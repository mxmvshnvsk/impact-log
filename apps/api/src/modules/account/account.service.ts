import type { ChangePasswordRequest, RotateRecoveryKeyRequest } from '@impact-log/shared'
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { sessions, users } from '../../db/schema'
import type { Cipher } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import { recoveryAuthHash } from '../auth/auth.service'
import { hashAuthKey, verifyAuthKey } from '../auth/authKey'
import { CLEAR_DELAYED_RECOVERY, cancelDelayedRecovery } from '../auth/delayedRecovery'
import type { FullSession } from '../auth/sessions'
import { deleteOtherSessions, deleteRecoverySessions } from '../auth/sessions'
import { generateTotpKey, totpEnrollment, verifyTotp } from '../auth/totp'
import { reserveTotpAttempt, TOTP_SUCCESS_RESET } from '../auth/totpGuard'
import { putEnvelope } from '../keys/envelopes'
import { cancelRotation } from '../keys/rotationStore'

type Deps = { db: Database; cipher: Cipher }

export function createAccountService({ db, cipher }: Deps) {
  /**
   * Повторная аутентификация для чувствительных действий: currentAuthKey (из текущего пароля).
   * 403, а не 401: сессия жива, просто подтверждение не прошло — клиент не должен разлогиниваться.
   */
  async function reauthenticate(current: FullSession, authKey: string) {
    if (!(await verifyAuthKey(current.user.authKeyHash, authKey))) {
      throw new AppError('INVALID_CREDENTIALS', 403)
    }
  }

  /**
   * Код по действующему TOTP-секрету: блокировка перебора (totpGuard, 429 во время блокировки) и
   * отказ для уже использованного шага. Возвращает шаг — его нужно зафиксировать условным UPDATE.
   */
  async function checkCurrentCode(current: FullSession, code: string): Promise<number> {
    const { user } = current
    await reserveTotpAttempt(db, user.id)
    const step = verifyTotp(cipher.decrypt(user.totpSecret, user.id), code, user.totpLastStep)
    if (step === null) throw new AppError('INVALID_CODE', 400)
    return step
  }

  /**
   * Смена пароля: новый authKey/KDF/соль и новый конверт того же MK; остальные сессии завершаются
   * (в том числе незавершённые восстановления), отложенное восстановление снимается — владелец в строю.
   * Идущая ротация MK отменяется: её password-конверт сделан KEK'ом старого пароля (ADR-0012)
   */
  async function changePassword(current: FullSession, input: ChangePasswordRequest) {
    await reauthenticate(current, input.currentAuthKey)
    const authKeyHash = await hashAuthKey(input.authKey)
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ authKeyHash, kdfParams: input.kdf, kdfSalt: input.salt, ...CLEAR_DELAYED_RECOVERY })
        .where(eq(users.id, current.user.id))
      await putEnvelope(tx, current.user.id, 'password', input.passwordEnvelope)
      await deleteOtherSessions(tx, current.user.id, current.id)
      await cancelRotation(tx, current.user.id)
    })
  }

  /**
   * Перевыпуск Recovery Key: старый перестаёт работать сразу — в том числе уже начатые им
   * восстановления и сбросы 2FA (recovery- и totp-reset-сессии удаляются в той же транзакции) и
   * отложенное восстановление. Идущая ротация MK отменяется: commit поставил бы Recovery Key, выпущенный
   * до этого перевыпуска (ADR-0012)
   */
  async function rotateRecoveryKey(current: FullSession, input: RotateRecoveryKeyRequest) {
    await reauthenticate(current, input.currentAuthKey)
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          recoveryAuthHash: recoveryAuthHash(input.recoveryAuthKey),
          ...CLEAR_DELAYED_RECOVERY,
        })
        .where(eq(users.id, current.user.id))
      await putEnvelope(tx, current.user.id, 'recovery', input.recoveryEnvelope)
      await deleteRecoverySessions(tx, current.user.id)
      await cancelRotation(tx, current.user.id)
    })
  }

  /**
   * Перевыпуск 2FA, шаг 1: authKey + текущий код 2FA → новый секрет ждёт подтверждения, старый
   * продолжает работать. Без кода — только в сессии после отложенного восстановления (viaRecovery,
   * путь C): телефона нет, а второй фактор заменила выдержанная задержка с предупреждением на устройствах.
   * (Потерянный телефон при известном пароле — путь B: /auth/login/recovery-key, без полной сессии.)
   */
  async function startTotpRotation(
    current: FullSession,
    input: { currentAuthKey: string; code?: string | undefined },
  ) {
    await reauthenticate(current, input.currentAuthKey)
    if (input.code === undefined && !current.viaRecovery) throw new AppError('INVALID_CODE', 400)
    const step = input.code === undefined ? null : await checkCurrentCode(current, input.code)

    const key = generateTotpKey()
    const pending = cipher.encrypt(key, current.user.id)
    if (step === null) {
      await db
        .update(users)
        .set({ totpPendingSecret: pending })
        .where(eq(users.id, current.user.id))
    } else {
      // Условное обновление: код нельзя использовать повторно (и параллельно)
      const [updated] = await db
        .update(users)
        .set({ totpPendingSecret: pending, totpLastStep: step, ...TOTP_SUCCESS_RESET })
        .where(
          and(
            eq(users.id, current.user.id),
            or(isNull(users.totpLastStep), lt(users.totpLastStep, step)),
          ),
        )
        .returning({ id: users.id })
      if (!updated) throw new AppError('INVALID_CODE', 400)
    }
    return totpEnrollment(key, current.user.login)
  }

  /**
   * Перевыпуск 2FA, шаг 2: код из приложения по новому секрету → секрет заменяется.
   * totp_last_step начинается заново (шаг этого кода), остальные сессии завершаются (ADR-0001 п.6),
   * а у текущей снимается viaRecovery — без кода 2FA перевыпускается только один раз.
   */
  async function confirmTotpRotation(current: FullSession, code: string) {
    const { user } = current
    const pending = user.totpPendingSecret
    if (!pending) throw new AppError('INVALID_CODE', 400)
    await reserveTotpAttempt(db, user.id)
    const step = verifyTotp(cipher.decrypt(pending, user.id), code, null)
    if (step === null) throw new AppError('INVALID_CODE', 400)
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({
          totpSecret: pending,
          totpPendingSecret: null,
          totpLastStep: step,
          ...TOTP_SUCCESS_RESET,
        })
        .where(and(eq(users.id, user.id), eq(users.totpPendingSecret, pending)))
        .returning({ id: users.id })
      // Секрет успели перевыпустить ещё раз параллельным запросом — этот код уже не к нему
      if (!updated) throw new AppError('INVALID_CODE', 400)
      await deleteOtherSessions(tx, user.id, current.id)
      await tx.update(sessions).set({ viaRecovery: false }).where(eq(sessions.id, current.id))
    })
  }

  /**
   * Отмена отложенного восстановления (и всех незавершённых действий по Recovery Key) с вошедшего
   * устройства. Без повторного подтверждения: действие только защитное
   */
  async function cancelRecovery(current: FullSession) {
    await db.transaction((tx) => cancelDelayedRecovery(tx, current.user.id))
  }

  /** Удаление аккаунта: authKey + код 2FA. Каскадом уходят конверты, устройства, сессии, объекты */
  async function deleteAccount(
    current: FullSession,
    input: { currentAuthKey: string; code: string },
  ) {
    await reauthenticate(current, input.currentAuthKey)
    await checkCurrentCode(current, input.code)
    await db.delete(users).where(eq(users.id, current.user.id))
  }

  return {
    changePassword,
    rotateRecoveryKey,
    startTotpRotation,
    confirmTotpRotation,
    cancelRecovery,
    deleteAccount,
  }
}

export type AccountService = ReturnType<typeof createAccountService>
