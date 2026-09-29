import {
  type ChangePasswordRequest,
  devicesResponseSchema,
  entitlementsResponseSchema,
  keysResponseSchema,
  okResponseSchema,
  type RotateRecoveryKeyRequest,
  registerStartResponseSchema,
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
    post('/account/totp/start', registerStartResponseSchema, {
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
