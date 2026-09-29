import type {
  KeyRotation,
  KeysResponse,
  RotationStageRequest,
  RotationStartRequest,
} from '@impact-log/shared'
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { Database, Executor } from '../../db/client'
import { keyRotations, objects, rotationObjects, users } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { recoveryAuthHash } from '../auth/auth.service'
import { verifyAuthKey } from '../auth/authKey'
import { CLEAR_DELAYED_RECOVERY } from '../auth/delayedRecovery'
import { deleteOtherSessions, type FullSession } from '../auth/sessions'
import { listEnvelopes, putEnvelope } from './envelopes'
import { cancelRotation, countStaged, toKeyRotation } from './rotationStore'

type Deps = { db: Database }

/** Сколько id отдаётся в details.missing и details.stale у ROTATION_INCOMPLETE (каждый список) */
export const INCOMPLETE_LIST_MAX = 1000

/**
 * Перешифровка не меняет размер объекта заметно (тот же payload, новый DEK), поэтому шифротекст черновика
 * не больше «2 × живой + 4 КиБ»: иначе черновик был бы бесплатным хранилищем сверх тарифа (до 256 КиБ на
 * каждый крошечный живой объект). Больше — rejected, как и объект, которого нет среди живых.
 */
const STAGE_GROWTH_FACTOR = 2
const STAGE_GROWTH_SLACK = 4 * 1024

/**
 * Ротация Master Key (ADR-0012). Сервер не разбирает ни конверты, ни шифротексты: он хранит черновик нового
 * состояния и атомарно подменяет им текущее, проверив, что перешифрован каждый живой объект в его ТЕКУЩЕЙ
 * версии. Сериализация: start и commit блокируют строку пользователя (как push), stage держит строку ротации
 * FOR SHARE — commit и отмена ждут окончания загрузки, а загрузка в уже отменённую ротацию невозможна.
 */
export function createRotationService({ db }: Deps) {
  /**
   * GET /api/keys. Один снимок (repeatable read): конверты и эпоха всегда одной эпохи — иначе клиент, попав
   * между commit'ом и чтением, открыл бы прежний MK и принял его за новый
   */
  async function keys(userId: string): Promise<KeysResponse> {
    return db.transaction(
      async (tx) => {
        const [user] = await tx
          .select({ keyEpoch: users.keyEpoch })
          .from(users)
          .where(eq(users.id, userId))
        if (!user) throw new AppError('UNAUTHORIZED', 401)
        const envelopes = await listEnvelopes(tx, userId)
        const [rotation] = await tx
          .select()
          .from(keyRotations)
          .where(eq(keyRotations.userId, userId))
        return {
          envelopes,
          keyEpoch: user.keyEpoch,
          rotation: rotation ? toKeyRotation(rotation, await countStaged(tx, userId)) : null,
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }

  /**
   * Начать ротацию: currentAuthKey (403, как в /api/account/*) → строка ротации с конвертами нового MK и
   * хешем нового recoveryAuthKey; targetEpoch = key_epoch + 1, инициатор — устройство сессии.
   * Уже идёт → 409 ROTATION_IN_PROGRESS с details = keyRotation.
   */
  async function start(current: FullSession, input: RotationStartRequest): Promise<KeyRotation> {
    const { user } = current
    if (!(await verifyAuthKey(user.authKeyHash, input.currentAuthKey))) {
      throw new AppError('INVALID_CREDENTIALS', 403)
    }
    return db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ keyEpoch: users.keyEpoch, authKeyHash: users.authKeyHash })
        .from(users)
        .where(eq(users.id, user.id))
        .for('update')
      if (!locked) throw new AppError('UNAUTHORIZED', 401)
      // Пароль сменили, пока проверялся authKey: password-конверт ротации сделан старым KEK
      if (locked.authKeyHash !== user.authKeyHash) throw new AppError('INVALID_CREDENTIALS', 403)
      const [existing] = await tx
        .select()
        .from(keyRotations)
        .where(eq(keyRotations.userId, user.id))
      if (existing) {
        const details = toKeyRotation(existing, await countStaged(tx, user.id))
        throw new AppError('ROTATION_IN_PROGRESS', 409, details)
      }
      const [created] = await tx
        .insert(keyRotations)
        .values({
          userId: user.id,
          targetEpoch: locked.keyEpoch + 1,
          deviceId: current.deviceId,
          passwordEnvelope: input.passwordEnvelope,
          recoveryEnvelope: input.recoveryEnvelope,
          recoveryAuthHash: recoveryAuthHash(input.recoveryAuthKey),
        })
        .returning()
      if (!created) throw new Error('Failed to start key rotation')
      return toKeyRotation(created, 0)
    })
  }

  /** Ротация пользователя под блокировкой + проверка, что сессия — с устройства-инициатора */
  async function lockOwnRotation(tx: Executor, current: FullSession, mode: 'share' | 'update') {
    const [rotation] = await tx
      .select()
      .from(keyRotations)
      .where(eq(keyRotations.userId, current.user.id))
      .for(mode)
    if (!rotation) throw new AppError('NO_ROTATION', 409)
    if (rotation.deviceId !== current.deviceId) throw new AppError('FORBIDDEN', 403)
    return rotation
  }

  /**
   * Черновик: каждый объект должен быть живым объектом пользователя (и не больше допустимого размера) →
   * upsert (version, ciphertext) → staged, иначе rejected. Версия здесь не сверяется — это делает commit.
   * Повтор objectId в одном запросе — побеждает последний. staged в ответе — всего записей в черновике.
   */
  async function stage(current: FullSession, input: RotationStageRequest) {
    const userId = current.user.id
    return db.transaction(async (tx) => {
      await lockOwnRotation(tx, current, 'share')

      const latest = new Map(input.objects.map((item) => [item.objectId, item]))
      const live = await tx
        .select({
          objectId: objects.objectId,
          size: sql<number>`coalesce(octet_length(${objects.ciphertext}), 0)`.mapWith(Number),
        })
        .from(objects)
        .where(
          and(
            eq(objects.userId, userId),
            eq(objects.deleted, false),
            inArray(objects.objectId, [...latest.keys()]),
          ),
        )
      const liveSize = new Map(live.map((row) => [row.objectId, row.size]))
      const accepted = [...latest.values()].filter((item) => {
        const size = liveSize.get(item.objectId)
        return (
          size !== undefined &&
          Buffer.byteLength(item.ciphertext, 'utf8') <=
            size * STAGE_GROWTH_FACTOR + STAGE_GROWTH_SLACK
        )
      })

      if (accepted.length > 0) {
        await tx
          .insert(rotationObjects)
          .values(
            accepted.map((item) => ({
              userId,
              objectId: item.objectId,
              version: item.version,
              ciphertext: item.ciphertext,
            })),
          )
          .onConflictDoUpdate({
            target: [rotationObjects.userId, rotationObjects.objectId],
            set: {
              version: sql`excluded.version`,
              ciphertext: sql`excluded.ciphertext`,
              stagedAt: sql`now()`,
            },
          })
      }

      const staged = new Set(accepted.map((item) => item.objectId))
      return {
        results: input.objects.map(({ objectId }) => ({
          objectId,
          status: staged.has(objectId) ? ('staged' as const) : ('rejected' as const),
        })),
        staged: await countStaged(tx, userId),
      }
    })
  }

  /**
   * Commit — одна транзакция под блокировкой строки пользователя (push'и ждут). Для каждого живого объекта
   * нужна запись черновика с его текущей версией, иначе 409 ROTATION_INCOMPLETE { missing, stale } и ничего
   * не меняется. Иначе: шифротексты черновика → живые объекты (key_epoch = target, новые seq, версии прежние;
   * tombstone'ы не трогаются; квоты не применяются — безопасность не ограничивается тарифом), конверты и
   * Recovery Key ротации → текущие, users.key_epoch = target, отложенное восстановление снято, ротация и
   * черновик удалены, все ДРУГИЕ сессии (в том числе recovery / totp-reset старым ключом) завершены.
   * «Запомнить этот компьютер» у устройств сохраняется: вход по-прежнему требует пароль.
   */
  async function commit(current: FullSession): Promise<{ keyEpoch: number }> {
    const userId = current.user.id
    return db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ keyEpoch: users.keyEpoch })
        .from(users)
        .where(eq(users.id, userId))
        .for('update')
      if (!locked) throw new AppError('UNAUTHORIZED', 401)
      const rotation = await lockOwnRotation(tx, current, 'update')
      // Эпоха меняется только commit'ом, который удаляет ротацию, — расхождение означает порчу данных
      if (rotation.targetEpoch !== locked.keyEpoch + 1) {
        throw new Error('Key rotation target epoch does not follow the account epoch')
      }

      const alive = and(eq(objects.userId, userId), eq(objects.deleted, false))
      const draftOf = and(
        eq(rotationObjects.userId, objects.userId),
        eq(rotationObjects.objectId, objects.objectId),
      )
      const missing = await tx
        .select({ objectId: objects.objectId })
        .from(objects)
        .leftJoin(rotationObjects, draftOf)
        .where(and(alive, isNull(rotationObjects.objectId)))
        .orderBy(asc(objects.seq))
        .limit(INCOMPLETE_LIST_MAX)
      const stale = await tx
        .select({ objectId: objects.objectId })
        .from(objects)
        .innerJoin(rotationObjects, draftOf)
        .where(and(alive, ne(rotationObjects.version, objects.version)))
        .orderBy(asc(objects.seq))
        .limit(INCOMPLETE_LIST_MAX)
      if (missing.length > 0 || stale.length > 0) {
        throw new AppError('ROTATION_INCOMPLETE', 409, {
          missing: missing.map((row) => row.objectId),
          stale: stale.map((row) => row.objectId),
        })
      }

      await tx
        .update(objects)
        .set({
          ciphertext: sql`${rotationObjects.ciphertext}`,
          keyEpoch: rotation.targetEpoch,
          seq: sql`nextval('object_seq')`,
          updatedAt: sql`now()`,
        })
        .from(rotationObjects)
        .where(and(alive, draftOf))
      await putEnvelope(tx, userId, 'password', rotation.passwordEnvelope)
      await putEnvelope(tx, userId, 'recovery', rotation.recoveryEnvelope)
      await tx
        .update(users)
        .set({
          keyEpoch: rotation.targetEpoch,
          recoveryAuthHash: rotation.recoveryAuthHash,
          ...CLEAR_DELAYED_RECOVERY,
        })
        .where(eq(users.id, userId))
      await cancelRotation(tx, userId)
      await deleteOtherSessions(tx, userId, current.id)
      return { keyEpoch: rotation.targetEpoch }
    })
  }

  /**
   * Отмена: с устройства-инициатора — без подтверждения; с другого устройства — только с верным
   * currentAuthKey (инициатор потерян или ротация брошена), иначе 403 INVALID_CREDENTIALS.
   * Ротации нет — ничего не делаем (ok).
   */
  async function abort(current: FullSession, currentAuthKey: string | undefined) {
    const userId = current.user.id
    const [rotation] = await db
      .select({ deviceId: keyRotations.deviceId })
      .from(keyRotations)
      .where(eq(keyRotations.userId, userId))
    if (!rotation) return
    if (rotation.deviceId === current.deviceId) {
      await db
        .delete(keyRotations)
        .where(and(eq(keyRotations.userId, userId), eq(keyRotations.deviceId, current.deviceId)))
      return
    }
    if (
      currentAuthKey === undefined ||
      !(await verifyAuthKey(current.user.authKeyHash, currentAuthKey))
    ) {
      throw new AppError('INVALID_CREDENTIALS', 403)
    }
    await cancelRotation(db, userId)
  }

  return { keys, start, stage, commit, abort }
}

export type RotationService = ReturnType<typeof createRotationService>
