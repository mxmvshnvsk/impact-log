import { z } from 'zod'

/** Совпадает с docker-compose.dev.yml — чтобы локально не нужен был .env */
export const DEV_DATABASE_URL = 'postgres://impact:impact@localhost:5432/impact'

/** Ключ шифрования TOTP-секретов для разработки. В production обязателен свой (TOTP_ENCRYPTION_KEY) */
export const DEV_TOTP_KEY = '0'.repeat(64)

/** Формат TOTP_ENCRYPTION_KEY: 32 байта в hex */
export const SERVER_SECRET_PATTERN = /^[0-9a-f]{64}$/i

const booleanFromString = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** true только за reverse proxy (Caddy) — иначе клиент может подделать X-Forwarded-For */
  TRUST_PROXY: booleanFromString('false'),
  APP_VERSION: z.string().default('dev'),
  /** 32 байта в hex (64 символа): openssl rand -hex 32 */
  TOTP_ENCRYPTION_KEY: z
    .string()
    .regex(SERVER_SECRET_PATTERN, 'must be 64 hex chars (openssl rand -hex 32)')
    .optional(),
  /** Secure-флаг cookie. По умолчанию включён в production */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  REGISTRATION_ENABLED: booleanFromString('true'),
  /** Регион этого инстанса (ADR-0011): отдаётся клиентам в POST /api/region/resolve */
  REGION: z.string().min(1).default('ru-1'),
  /** Базовый URL API для клиентов этого региона: абсолютный URL или путь от origin */
  PUBLIC_API_BASE_URL: z.string().min(1).default('/api'),
  /** Запросов /api/sync/* в минуту на пользователя */
  SYNC_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
})

type Env = z.infer<typeof envSchema>

export type Config = Omit<Env, 'DATABASE_URL' | 'TOTP_ENCRYPTION_KEY' | 'COOKIE_SECURE'> & {
  DATABASE_URL: string
  TOTP_ENCRYPTION_KEY: string
  COOKIE_SECURE: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`)
  }
  const { DATABASE_URL, TOTP_ENCRYPTION_KEY, COOKIE_SECURE, ...rest } = parsed.data
  const production = rest.NODE_ENV === 'production'

  if (production && !DATABASE_URL) throw new Error('DATABASE_URL is required in production')
  if (production && !TOTP_ENCRYPTION_KEY) {
    throw new Error('TOTP_ENCRYPTION_KEY is required in production')
  }

  return {
    ...rest,
    DATABASE_URL: DATABASE_URL ?? DEV_DATABASE_URL,
    TOTP_ENCRYPTION_KEY: TOTP_ENCRYPTION_KEY ?? DEV_TOTP_KEY,
    COOKIE_SECURE: COOKIE_SECURE ? COOKIE_SECURE === 'true' : production,
  }
}
