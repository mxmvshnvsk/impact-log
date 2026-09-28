import { loginSchema, passwordSchema } from '@impact-log/shared'
import { z } from 'zod'

/** Форма шага 1: пароль и повтор проверяются только на клиенте — на сервер пароль не уходит */
export const registerFormSchema = z
  .object({ login: loginSchema, password: passwordSchema, passwordConfirm: z.string() })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'password.mismatch',
    path: ['passwordConfirm'],
  })

/** Пароль уже превращён в ключи (вернулись назад, например из-за занятого логина) — проверяем только логин */
export const loginOnlySchema = z.object({
  login: loginSchema,
  password: z.string(),
  passwordConfirm: z.string(),
})
