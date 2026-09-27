import {
  type CodeRequest,
  type Credentials,
  type LoginRequest,
  loginResponseSchema,
  meResponseSchema,
  okResponseSchema,
  registerConfirmResponseSchema,
  registerStartResponseSchema,
  type SecondFactorRequest,
} from '@impact-log/shared'
import { post, request } from './http'

export const authApi = {
  me: () => request('/auth/me', meResponseSchema),
  register: (body: Credentials) => post('/auth/register', registerStartResponseSchema, body),
  confirmRegistration: (body: CodeRequest) =>
    post('/auth/register/confirm', registerConfirmResponseSchema, body),
  login: (body: LoginRequest) => post('/auth/login', loginResponseSchema, body),
  verifySecondFactor: (body: SecondFactorRequest) =>
    post('/auth/login/verify', meResponseSchema, body),
  logout: () => post('/auth/logout', okResponseSchema, {}),
}
