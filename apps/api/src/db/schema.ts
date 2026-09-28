import type { EnvelopeType, KdfParams, ObjectKind, PlanId } from '@impact-log/shared'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

// После изменения схемы: pnpm --filter @impact-log/api db:generate
// Из @impact-log/shared здесь только типы: схему читает drizzle-kit, рантайм-импорты ему ни к чему.

/**
 * Модель local-first + E2EE (ADR-0006…0009): сервер хранит только то, что нужно для входа,
 * синхронизации и тарифов. Пароля, Master Key и открытого содержимого записей здесь нет.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Непрозрачный публичный ID: 12 символов Crockford Base32 (60 случайных бит), не кодирует регион */
  accountId: varchar('account_id', { length: 12 }).notNull().unique(),
  login: varchar('login', { length: 32 }).notNull().unique(),
  /** Argon2id (PHC-строка) от authKey — ключа, выведенного из пароля на клиенте */
  authKeyHash: text('auth_key_hash').notNull(),
  /** Параметры KDF и соль пароля — клиент получает их через prelogin */
  kdfParams: jsonb('kdf_params').$type<KdfParams>().notNull(),
  kdfSalt: text('kdf_salt').notNull(),
  /**
   * TOTP-секрет: `v2:` + AES-256-GCM подключом HKDF(TOTP_ENCRYPTION_KEY) из env (не из БД),
   * AAD = id пользователя (lib/crypto.ts → createTotpCipher). Шифротекст не переносится между строками.
   */
  totpSecret: text('totp_secret').notNull(),
  /** Последний использованный шаг TOTP — защита от повторного использования кода */
  totpLastStep: bigint('totp_last_step', { mode: 'number' }),
  /** Новый TOTP-секрет на время перевыпуска 2FA (до подтверждения кодом), зашифрован так же */
  totpPendingSecret: text('totp_pending_secret'),
  /**
   * Неудачные проверки TOTP подряд — во всех местах, где проверяется код (вход, регистрация,
   * перевыпуск 2FA, удаление аккаунта). Успешный код и восстановление по Recovery Key обнуляют.
   * См. modules/auth/totpGuard.ts
   */
  totpFailedCount: integer('totp_failed_count').notNull().default(0),
  /** До этого момента коды не проверяются вовсе (429) — экспоненциальная блокировка перебора */
  totpLockedUntil: timestamp('totp_locked_until', { withTimezone: true }),
  /** hex SHA-256 от recoveryAuthKey (256 бит энтропии — медленный хеш не нужен) */
  recoveryAuthHash: text('recovery_auth_hash').notNull(),
  /** pending — регистрация начата, 2FA ещё не подтверждена; active — полноценный аккаунт */
  status: text('status', { enum: ['pending', 'active'] })
    .notNull()
    .default('pending'),
  /** Коммерческое состояние (PLAN_IDS) → профиль возможностей через resolveEntitlements */
  plan: text('plan').$type<PlanId>().notNull().default('PILOT'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
})

/** Ключевые конверты с Master Key — непрозрачные строки, сервер их не разбирает и не может открыть */
export const keyEnvelopes = pgTable(
  'key_envelopes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<EnvelopeType>().notNull(),
    envelope: text('envelope').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type] })],
)

/**
 * Устройства (клиенты) пользователя. Название зашифровано на клиенте; никаких отпечатков, IP,
 * user-agent. «Запомнить этот компьютер» — случайный токен в cookie, здесь только его SHA-256 и срок.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    encryptedLabel: text('encrypted_label'),
    /**
     * hex SHA-256 от секрета устройства (32 случайных байта, выдаются клиенту один раз при создании).
     * Повторно использовать deviceId при входе/восстановлении можно, только предъявив секрет.
     * null — у устройства нет секрета (создано до его появления) — его id повторно не используется.
     */
    secretHash: text('secret_hash'),
    trustTokenHash: text('trust_token_hash').unique(),
    trustExpiresAt: timestamp('trust_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Отозванное устройство не показывается и не может получить сессию */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('devices_user_id_idx').on(table.userId)],
)

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 от токена из cookie — сам токен в БД не хранится */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Для full — устройство сессии; для second-factor — кандидат, переданный при входе */
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    /**
     * enrollment — регистрация до подтверждения 2FA;
     * second-factor — authKey верный, ждём код;
     * recovery — Recovery Key подтверждён, ждём новый пароль;
     * full — полноценная сессия
     */
    kind: text('kind', { enum: ['enrollment', 'second-factor', 'recovery', 'full'] }).notNull(),
    /** Неудачные попытки ввода кода в рамках этой сессии */
    attempts: integer('attempts').notNull().default(0),
    /** «Запомнить этот компьютер»: 30 дней и постоянная cookie; иначе — сутки и cookie до закрытия браузера */
    persistent: boolean('persistent').notNull().default(false),
    /**
     * Полная сессия выдана recovery/complete (владение Recovery Key доказано): можно начать
     * перевыпуск 2FA без текущего кода. После успешного перевыпуска флаг снимается.
     */
    viaRecovery: boolean('via_recovery').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_device_id_idx').on(table.deviceId),
  ],
)

/** Глобальная последовательность изменений: каждая запись объекта получает nextval → курсор pull */
export const objectSeq = pgSequence('object_seq')

/** Зашифрованные объекты синхронизации (ADR-0007). Удаление — tombstone (deleted, ciphertext = null) */
export const objects = pgTable(
  'objects',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    kind: text('kind').$type<ObjectKind>().notNull(),
    version: integer('version').notNull(),
    ciphertext: text('ciphertext'),
    deleted: boolean('deleted').notNull().default(false),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.objectId] }),
    index('objects_user_seq_idx').on(table.userId, table.seq),
  ],
)

export type UserRow = typeof users.$inferSelect
export type DeviceRow = typeof devices.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type SessionKind = SessionRow['kind']
export type ObjectRow = typeof objects.$inferSelect

/** now() на стороне БД — чтобы не зависеть от часов приложения */
export const dbNow = sql`now()`
