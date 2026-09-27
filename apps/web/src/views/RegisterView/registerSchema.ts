import { credentialsSchema } from '@impact-log/shared'
import { z } from 'zod'

/** Форма регистрации: к общей схеме добавляем повтор пароля (проверяется только на клиенте) */
export const registerFormSchema = credentialsSchema
  .extend({ passwordConfirm: z.string() })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'password.mismatch',
    path: ['passwordConfirm'],
  })
