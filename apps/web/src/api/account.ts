import {
  type ChangePasswordRequest,
  devicesResponseSchema,
  entitlementsResponseSchema,
  keyRotationSchema,
  keysResponseSchema,
  okResponseSchema,
  type RotateRecoveryKeyRequest,
  type RotationStageRequest,
  type RotationStartRequest,
  rotationCommitResponseSchema,
  rotationStageResponseSchema,
  SYNC_ACCOUNT_HEADER,
  totpSecretResponseSchema,
} from '@impact-log/shared'
import { post, request } from './http'

/**
 * Аккаунт синхронизации (полная сессия). Чувствительные действия подтверждаются currentAuthKey —
 * он выводится из текущего пароля на клиенте; неверный → 403 INVALID_CREDENTIALS (сессия жива).
 */
export const accountApi = {
  /** Конверты Master Key (password, recovery) — сервер не может их открыть */
  keys: () => request('/keys', keysResponseSchema),
  changePassword: (body: ChangePasswordRequest) =>
    post('/account/password', okResponseSchema, body),
  rotateRecoveryKey: (body: RotateRecoveryKeyRequest) =>
    post('/account/recovery-key', okResponseSchema, body),
  /** code — текущий код 2FA; не нужен только в сессии, созданной восстановлением по Recovery Key */
  startTotpRotation: (currentAuthKey: string, code?: string) =>
    post('/account/totp/start', totpSecretResponseSchema, {
      currentAuthKey,
      ...(code ? { code } : {}),
    }),
  confirmTotpRotation: (code: string) => post('/account/totp/confirm', okResponseSchema, { code }),
  /** Отменить отложенное восстановление по Recovery Key (его начал кто-то без пароля и 2FA) */
  cancelRecovery: () => post('/account/recovery/cancel', okResponseSchema, {}),
  deleteAccount: (body: { currentAuthKey: string; code: string }) =>
    post('/account/delete', okResponseSchema, body),
  entitlements: () => request('/entitlements', entitlementsResponseSchema),
}

/**
 * Ротация Master Key (ADR-0012): start → stage… → commit (или abort). Черновик и commit — только с
 * устройства-инициатора; accountId (X-Impact-Account) — сверка, что ротацию завершает хранилище того же
 * аккаунта, что и сессия.
 */
export const keyRotationApi = {
  start: (body: RotationStartRequest) => post('/keys/rotation/start', keyRotationSchema, body),
  stage: (objects: RotationStageRequest['objects'], accountId: string) =>
    post(
      '/keys/rotation/stage',
      rotationStageResponseSchema,
      { objects },
      {
        [SYNC_ACCOUNT_HEADER]: accountId,
      },
    ),
  commit: (accountId: string) =>
    post(
      '/keys/rotation/commit',
      rotationCommitResponseSchema,
      {},
      {
        [SYNC_ACCOUNT_HEADER]: accountId,
      },
    ),
  /** С устройства-инициатора — без подтверждения; с другого — currentAuthKey текущего пароля */
  abort: (currentAuthKey?: string) =>
    post('/keys/rotation/abort', okResponseSchema, currentAuthKey ? { currentAuthKey } : {}),
}

/** Устройства аккаунта: названия зашифрованы MK на клиенте */
export const devicesApi = {
  list: () => request('/devices', devicesResponseSchema),
  rename: (deviceId: string, encryptedLabel: string | null) =>
    request(`/devices/${encodeURIComponent(deviceId)}`, okResponseSchema, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedLabel }),
    }),
  revoke: (deviceId: string) =>
    request(`/devices/${encodeURIComponent(deviceId)}`, okResponseSchema, { method: 'DELETE' }),
}
