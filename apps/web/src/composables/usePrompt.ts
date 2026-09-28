import { onScopeDispose, type ShallowRef, shallowRef } from 'vue'

export type Prompt<TRequest, TAnswer> = {
  /** Открытый вопрос (null — диалог закрыт) */
  request: ShallowRef<TRequest | null>
  /** Задать вопрос из середины асинхронного флоу и дождаться ответа */
  ask(request: TRequest): Promise<TAnswer>
  /** Ответ из диалога */
  answer(value: TAnswer): void
}

/**
 * Вопрос пользователю посреди долгой операции (вход, восстановление): флоу вызывает ask() и ждёт,
 * экран показывает диалог по request и отвечает через answer(). Новый вопрос или уход с экрана
 * закрывают прежний ответом fallback (обычно «отмена»).
 */
export function usePrompt<TRequest, TAnswer>(fallback: TAnswer): Prompt<TRequest, TAnswer> {
  const request = shallowRef<TRequest | null>(null)
  let resolver: ((value: TAnswer) => void) | null = null

  function answer(value: TAnswer) {
    const resolve = resolver
    resolver = null
    request.value = null
    resolve?.(value)
  }

  function ask(next: TRequest): Promise<TAnswer> {
    if (resolver) answer(fallback)
    request.value = next
    return new Promise<TAnswer>((resolve) => {
      resolver = resolve
    })
  }

  onScopeDispose(() => answer(fallback))

  return { request, ask, answer }
}
