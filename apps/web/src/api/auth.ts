import {
  type CodeRequest,
  type LoginRequest,
  loginResponseSchema,
  okResponseSchema,
  preloginResponseSchema,
  type RecoveryCompleteRequest,
  type RegisterRequest,
  recoveryBeginResponseSchema,
  registerStartResponseSchema,
  sessionResponseSchema,
} from '@impact-log/shared'
import { post, request } from './http'

/** Аутентификация (ADR-0008): пароль на сервер не уходит — только authKey, выведенный на клиенте */
export const authApi = {
  me: () => request('/auth/me', sessionResponseSchema),
  prelogin: (login: string) => post('/auth/prelogin', preloginResponseSchema, { login }),
  register: (body: RegisterRequest) => post('/auth/register', registerStartResponseSchema, body),
  confirmRegistration: (body: CodeRequest) =>
    post('/auth/register/confirm', sessionResponseSchema, body),
  login: (body: LoginRequest) => post('/auth/login', loginResponseSchema, body),
  verifySecondFactor: (body: CodeRequest) =>
    post('/auth/login/verify', sessionResponseSchema, body),
  recoveryBegin: (body: { login: string; recoveryAuthKey: string }) =>
    post('/auth/recovery/begin', recoveryBeginResponseSchema, body),
  recoveryComplete: (body: RecoveryCompleteRequest) =>
    post('/auth/recovery/complete', sessionResponseSchema, body),
  /** everywhere — все сессии и доверие всех устройств; forgetDevice — снять «Запомнить» с этого устройства */
  logout: (options: { everywhere?: boolean; forgetDevice?: boolean } = {}) =>
    post('/auth/logout', okResponseSchema, options),
}
