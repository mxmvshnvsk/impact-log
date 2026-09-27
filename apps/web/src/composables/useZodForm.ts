import { nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { z } from 'zod'
import { ApiError, type ClientErrorCode } from '@/api/http'
import { fieldErrors } from '@/utils/zodErrors'

/**
 * Форма на zod-схеме из packages/shared (правила — docs/design-system.md, раздел «Формы»):
 * — поле проверяется при потере фокуса;
 * — после первой ошибки поле перепроверяется на каждый ввод;
 * — при отправке проверяется всё, фокус переходит на первое неверное поле;
 * — ошибка API показывается над кнопкой отправки (formError).
 */
export function useZodForm<Schema extends z.ZodObject>(schema: Schema, initial: z.input<Schema>) {
  type Field = keyof z.input<Schema> & string

  const { t } = useI18n()
  const values = reactive({ ...initial }) as z.input<Schema>
  /** Ключи i18n ошибок по полям (validation.<key>) */
  const errors = reactive<Record<string, string | undefined>>({})
  const submitting = ref(false)
  const formError = ref<ClientErrorCode | null>(null)

  function validate(): z.ZodSafeParseResult<z.output<Schema>> {
    return schema.safeParse(values)
  }

  function validateField(field: Field) {
    const result = validate()
    const message = result.success ? undefined : fieldErrors(result.error.issues)[field]
    if (message) errors[field] = message
    else delete errors[field]
  }

  function onBlur(field: Field) {
    if (values[field] === '' && !errors[field]) return // пустое поле не ругаем до отправки
    validateField(field)
  }

  // После первой ошибки — перепроверяем поле на каждый ввод, чтобы ошибка исчезла сразу
  watch(values, () => {
    for (const field of Object.keys(errors) as Field[]) validateField(field)
    formError.value = null
  })

  /** Переведённый текст ошибки поля (или null) */
  function fieldError(field: Field): string | null {
    const key = errors[field]
    return key ? t(`validation.${key}`) : null
  }

  function setFieldError(field: Field, key: string) {
    errors[field] = key
  }

  async function submit(handler: (data: z.output<Schema>) => Promise<void>): Promise<boolean> {
    formError.value = null
    const result = validate()
    if (!result.success) {
      Object.assign(errors, fieldErrors(result.error.issues))
      await nextTick()
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return false
    }

    submitting.value = true
    try {
      await handler(result.data)
      return true
    } catch (error) {
      formError.value = error instanceof ApiError ? error.code : 'UNKNOWN_ERROR'
      return false
    } finally {
      submitting.value = false
    }
  }

  return { values, errors, submitting, formError, onBlur, fieldError, setFieldError, submit }
}
