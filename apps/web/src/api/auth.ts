import {
  type CodeRequest,
  type LoginRequest,
  loginResponseSchema,
  meResponseSchema,
  okResponseSchema,
  preloginResponseSchema,
  type RecoveryCompleteRequest,
  type RegisterRequest,
  recoveryBeginResponseSchema,
  recoveryDelayResponseSchema,
  recoveryUnlockResponseSchema,
  registerStartResponseSchema,
  sessionResponseSchema,
} from '@impact-log/shared'
import { post, request } from './http'

/** Аутентификация (ADR-0008): пароль на сервер не уходит — только authKey, выведенный на клиенте */
export const authApi = {
  /** Сессия + состояние безопасности аккаунта (recoveryPending — идёт отложенное восстановление) */
  me: () => request('/auth/me', meResponseSchema),
  prelogin: (login: string) => post('/auth/prelogin', preloginResponseSchema, { login }),
  register: (body: RegisterRequest) => post('/auth/register', registerStartResponseSchema, body),
  confirmRegistration: (body: CodeRequest) =>
    post('/auth/register/confirm', sessionResponseSchema, body),
  login: (body: LoginRequest) => post('/auth/login', loginResponseSchema, body),
  verifySecondFactor: (body: CodeRequest) =>
    post('/auth/login/verify', sessionResponseSchema, body),
  /*
   * Восстановление по Recovery Key (ADR-0008 §7): Recovery Key + ещё один фактор.
   * begin → recovery-сессия (конверт ещё не выдаётся) → verify (код 2FA) или delay/resume (48 ч) → complete.
   */
  recoveryBegin: (body: { login: string; recoveryAuthKey: string }) =>
    post('/auth/recovery/begin', recoveryBeginResponseSchema, body),
  /** A. Код 2FA → конверт MK под Recovery Key */
  recoveryVerify: (code: string) =>
    post('/auth/recovery/verify', recoveryUnlockResponseSchema, { code }),
  /** C. Запустить отсчёт задержки (идемпотентно) → когда станет доступно */
  recoveryDelay: () => post('/auth/recovery/delay', recoveryDelayResponseSchema, {}),
  /** C. Задержка прошла → конверт. Рано/не начато → 403 RECOVERY_NOT_READY (details.availableAt) */
  recoveryResume: () => post('/auth/recovery/resume', recoveryUnlockResponseSchema, {}),
  recoveryComplete: (body: RecoveryCompleteRequest) =>
    post('/auth/recovery/complete', sessionResponseSchema, body),
  /** B. Пароль проверен, телефона нет: Recovery Key вместо кода → новая 2FA для приложения */
  loginRecoveryKey: (recoveryAuthKey: string) =>
    post('/auth/login/recovery-key', registerStartResponseSchema, { recoveryAuthKey }),
  /** B. Первый код новой 2FA → полная сессия (старая 2FA и остальные сессии сброшены) */
  loginTotpReset: (body: CodeRequest) =>
    post('/auth/login/totp-reset', sessionResponseSchema, body),
  /** everywhere — все сессии и доверие всех устройств; forgetDevice — снять «Запомнить» с этого устройства */
  logout: (options: { everywhere?: boolean; forgetDevice?: boolean } = {}) =>
    post('/auth/logout', okResponseSchema, options),
}
