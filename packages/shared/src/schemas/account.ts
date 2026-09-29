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
import { MAX_OBJECT_CIPHERTEXT } from './sync'

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

/* ---------- ротация Master Key (ADR-0012) ---------- */
/*
 * Эпоха ключа: users.key_epoch (с 1). Ротация = новый MK, ВСЕ живые объекты перешифровываются им (свежие DEK),
 * новый password-конверт (тот же пароль, та же соль/KDF → тот же authKey) и новый Recovery Key.
 * Шифротексты новой эпохи сначала складываются на сервере в «черновик ротации» (staging) и подменяют живые
 * объекты только атомарным commit; abort просто выбрасывает черновик — данные никогда не остаются наполовину
 * перешифрованными. Пока идёт ротация, остальные устройства синхронизируются как обычно (старым ключом);
 * commit проверяет, что для каждого живого объекта есть перешифровка его ТЕКУЩЕЙ версии, иначе 409.
 * После commit: версии объектов не меняются, seq — новые (pull разошлёт новые шифротексты), все ДРУГИЕ сессии
 * завершены (устройства входят заново и получают новый MK), отложенное восстановление снято, старый
 * Recovery Key не работает.
 */

/** Идущая ротация (видна в GET /api/keys) */
export const keyRotationSchema = z.object({
  targetEpoch: z.number().int().positive(),
  startedAt: z.string(),
  /** Устройство, которое начало ротацию (только оно может загружать черновик и делать commit) */
  deviceId: z.uuid(),
  /** Сколько объектов уже в черновике */
  staged: z.number().int().nonnegative(),
})
export type KeyRotation = z.infer<typeof keyRotationSchema>

/** GET /api/keys (полная сессия) — конверты текущей эпохи */
export const keysResponseSchema = z.object({
  envelopes: z.array(storedEnvelopeSchema),
  keyEpoch: z.number().int().positive(),
  rotation: keyRotationSchema.nullable(),
})
export type KeysResponse = z.infer<typeof keysResponseSchema>

/**
 * POST /api/keys/rotation/start (полная сессия) — начать ротацию. Конверты — НОВОГО MK: password-конверт тем же
 * KEK (пароль не меняется), recovery — от нового Recovery Key. Неверный currentAuthKey → 403 INVALID_CREDENTIALS;
 * ротация уже идёт → 409 ROTATION_IN_PROGRESS (details: keyRotationSchema).
 * Ответ — keyRotationSchema.
 */
export const rotationStartRequestSchema = z.object({
  currentAuthKey: authKeySchema,
  passwordEnvelope: envelopeTextSchema,
  recoveryEnvelope: envelopeTextSchema,
  recoveryAuthKey: authKeySchema,
})
export type RotationStartRequest = z.infer<typeof rotationStartRequestSchema>

export const MAX_ROTATION_STAGE_OBJECTS = 200

/**
 * POST /api/keys/rotation/stage (сессия устройства-инициатора) — положить перешифрованные объекты в черновик.
 * version — версия живого объекта, с которой делалась перешифровка. Повторная отправка того же objectId
 * заменяет запись черновика. Объекты, которых нет среди живых, отклоняются (rejected INVALID).
 * Нет ротации → 409 NO_ROTATION; чужое устройство → 403 FORBIDDEN.
 */
export const rotationStageRequestSchema = z.object({
  objects: z
    .array(
      z.object({
        objectId: z.uuid(),
        version: z.number().int().positive(),
        ciphertext: z.string().min(1).max(MAX_OBJECT_CIPHERTEXT),
      }),
    )
    .min(1)
    .max(MAX_ROTATION_STAGE_OBJECTS),
})
export type RotationStageRequest = z.infer<typeof rotationStageRequestSchema>
export const rotationStageResponseSchema = z.object({
  results: z.array(z.object({ objectId: z.uuid(), status: z.enum(['staged', 'rejected']) })),
  staged: z.number().int().nonnegative(),
})

/**
 * POST /api/keys/rotation/commit (сессия устройства-инициатора, без тела) — атомарно: шифротексты черновика →
 * живые объекты (key_epoch = targetEpoch, новые seq, версии прежние), новые конверты и Recovery Key,
 * users.key_epoch = targetEpoch, все ДРУГИЕ сессии удалены, отложенное восстановление снято, черновик удалён.
 * Если для каких-то живых объектов перешифровки нет или она сделана со старой версии →
 * 409 ROTATION_INCOMPLETE, details: rotationIncompleteSchema (клиент делает pull, дошифровывает и повторяет).
 * Ответ — { keyEpoch }.
 */
export const rotationIncompleteSchema = z.object({
  /** Живые объекты без записи в черновике */
  missing: z.array(z.uuid()),
  /** Черновик сделан с устаревшей версии (объект изменили на другом устройстве) */
  stale: z.array(z.uuid()),
})
export const rotationCommitResponseSchema = z.object({ keyEpoch: z.number().int().positive() })

/**
 * POST /api/keys/rotation/abort (полная сессия) — отменить ротацию, черновик удаляется. С устройства-инициатора —
 * без тела; с любого другого устройства — { currentAuthKey } (если инициатор потерян). Нет ротации → ok.
 * Ротация также отменяется автоматически при смене пароля, перевыпуске Recovery Key и восстановлении доступа
 * (конверты черновика стали бы неверными).
 */
export const rotationAbortRequestSchema = z
  .object({ currentAuthKey: authKeySchema.optional() })
  .optional()

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
