import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

// После изменения схемы: pnpm --filter @impact-log/api db:generate

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  login: varchar('login', { length: 32 }).notNull().unique(),
  /** Argon2id (PHC-строка) */
  passwordHash: text('password_hash').notNull(),
  /** TOTP-секрет, зашифрованный AES-256-GCM ключом из env (не из БД) */
  totpSecret: text('totp_secret').notNull(),
  /** Последний использованный шаг TOTP — защита от повторного использования кода */
  totpLastStep: bigint('totp_last_step', { mode: 'number' }),
  /** pending — регистрация начата, 2FA ещё не подтверждена; active — полноценный аккаунт */
  status: text('status', { enum: ['pending', 'active'] })
    .notNull()
    .default('pending'),
  /** Тариф — задел под монетизацию, логики пока нет */
  plan: text('plan').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
})

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 от токена из cookie — сам токен в БД не хранится */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * enrollment — регистрация до подтверждения 2FA;
     * second-factor — пароль верный, ждём код;
     * full — полноценная сессия
     */
    kind: text('kind', { enum: ['enrollment', 'second-factor', 'full'] }).notNull(),
    /** Неудачные попытки ввода кода в рамках этой сессии */
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 от кода (у кода 60 бит энтропии — медленный хеш не нужен) */
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('recovery_codes_user_id_idx').on(table.userId)],
)

export type UserRow = typeof users.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type SessionKind = SessionRow['kind']

/** now() на стороне БД — чтобы не зависеть от часов приложения */
export const dbNow = sql`now()`
