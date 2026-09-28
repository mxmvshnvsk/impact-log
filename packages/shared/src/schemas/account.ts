import { z } from 'zod'
import { entitlementProfileSchema, PLAN_IDS } from '../entitlements'
import {
  authKeySchema,
  envelopeTextSchema,
  kdfParamsSchema,
  kdfSaltSchema,
  loginSchema,
  totpCodeSchema,
} from './auth'

/* ---------- ключевые конверты (ADR-0006) ---------- */

export const ENVELOPE_TYPES = ['password', 'recovery'] as const
export type EnvelopeType = (typeof ENVELOPE_TYPES)[number]

export const storedEnvelopeSchema = z.object({
  type: z.enum(ENVELOPE_TYPES),
  /** Сериализованный конверт (core/crypto/envelope) — сервер его не разбирает и не может открыть */
  envelope: envelopeTextSchema,
  updatedAt: z.string(),
})
export type StoredEnvelope = z.infer<typeof storedEnvelopeSchema>

/** GET /api/keys (полная сессия) */
export const keysResponseSchema = z.object({ envelopes: z.array(storedEnvelopeSchema) })
export type KeysResponse = z.infer<typeof keysResponseSchema>

/** POST /api/account/password — смена пароля: новый authKey, новая соль/KDF и новый конверт того же MK */
export const changePasswordRequestSchema = z.object({
  currentAuthKey: authKeySchema,
  authKey: authKeySchema,
  kdf: kdfParamsSchema,
  salt: kdfSaltSchema,
  passwordEnvelope: envelopeTextSchema,
})
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>

/** POST /api/account/recovery-key — перевыпуск Recovery Key (старый перестаёт работать) */
export const rotateRecoveryKeyRequestSchema = z.object({
  currentAuthKey: authKeySchema,
  recoveryEnvelope: envelopeTextSchema,
  recoveryAuthKey: authKeySchema,
})
export type RotateRecoveryKeyRequest = z.infer<typeof rotateRecoveryKeyRequestSchema>

/** POST /api/account/totp/start — перевыпуск 2FA (например, после восстановления доступа) */
export const totpRotateStartRequestSchema = z.object({
  currentAuthKey: authKeySchema,
  /** Текущий код 2FA. Не нужен только в сессии, созданной восстановлением по Recovery Key */
  code: totpCodeSchema.optional(),
})
/** POST /api/account/totp/confirm → okResponseSchema */
export const totpRotateConfirmRequestSchema = z.object({ code: totpCodeSchema })

/** POST /api/account/delete — удаление аккаунта и всех зашифрованных данных на сервере */
export const deleteAccountRequestSchema = z.object({
  currentAuthKey: authKeySchema,
  code: totpCodeSchema,
})

/* ---------- устройства (ADR-0008) ---------- */

export const deviceSchema = z.object({
  deviceId: z.uuid(),
  /** Название устройства зашифровано MK на клиенте — сервер видит только шифротекст */
  encryptedLabel: z.string().max(2048).nullable(),
  /** Устройство помечено «Запомнить этот компьютер» (вход без кода 2FA) */
  trusted: z.boolean(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  current: z.boolean(),
})
export type Device = z.infer<typeof deviceSchema>

/** GET /api/devices — только не отозванные устройства */
export const devicesResponseSchema = z.object({ devices: z.array(deviceSchema) })
/** PATCH /api/devices/:deviceId */
export const updateDeviceRequestSchema = z.object({
  encryptedLabel: z.string().max(2048).nullable(),
})
/** DELETE /api/devices/:deviceId — отзыв: сессии и «доверие» устройства удаляются → okResponseSchema */

/* ---------- entitlements (ADR-0009) ---------- */

/** GET /api/entitlements */
export const entitlementsResponseSchema = z.object({
  plan: z.enum(PLAN_IDS),
  profile: entitlementProfileSchema,
  usage: z.object({
    activeImpacts: z.number().int().nonnegative(),
    devices: z.number().int().nonnegative(),
    /** Сумма размеров шифротекстов на сервере, байт (квота limits.maxStorageBytes) */
    storageBytes: z.number().int().nonnegative(),
    /** Живые объекты на сервере, без tombstone'ов (квота limits.maxObjects) */
    objects: z.number().int().nonnegative(),
  }),
})
export type EntitlementsResponse = z.infer<typeof entitlementsResponseSchema>

/* ---------- регион (ADR-0011) ---------- */

/** POST /api/region/resolve — для несуществующих логинов ответ такой же, как для существующих */
export const regionResolveRequestSchema = z.object({ login: loginSchema })
export const regionResolutionSchema = z.object({
  region: z.string(),
  /** Абсолютный URL или путь относительно origin ('/api') */
  apiBaseUrl: z.string(),
  ttlSeconds: z.number().int().positive(),
})
export type RegionResolution = z.infer<typeof regionResolutionSchema>
