import { z } from 'zod'

/** Совпадает с docker-compose.dev.yml — чтобы локально не нужен был .env */
export const DEV_DATABASE_URL = 'postgres://impact:impact@localhost:5432/impact'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** true только за reverse proxy (Caddy) — иначе клиент может подделать X-Forwarded-For */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  APP_VERSION: z.string().default('dev'),
})

export type Config = Omit<z.infer<typeof envSchema>, 'DATABASE_URL'> & { DATABASE_URL: string }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`)
  }
  const { DATABASE_URL, ...rest } = parsed.data
  if (!DATABASE_URL && rest.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production')
  }
  return { ...rest, DATABASE_URL: DATABASE_URL ?? DEV_DATABASE_URL }
}
