import { type ImpactDraft, impactDraftSchema, readDraftFromHash } from '@impact-log/core'
import type { Router } from 'vue-router'

/*
 * Черновик из Chrome/CLI/VS Code приходит во фрагменте /capture#draft=… (ADR-0010): фрагмент не уходит
 * на сервер. Сразу после чтения убираем его из адресной строки и текущей записи истории (саму ссылку
 * браузер мог запомнить в истории посещений до этого), дальше держим в памяти.
 * Пока пользователь создаёт хранилище или входит, черновик лежит в sessionStorage этой вкладки
 * (данные пользователя на его же устройстве) и удаляется после сохранения записи.
 */
const STASH_KEY = 'impact-log:capture-draft'

export type HandoffResult =
  | { status: 'draft'; draft: ImpactDraft }
  | { status: 'invalid' }
  | { status: 'none' }

/** Разбор фрагмента; принимает и закодированный целиком «#draft%3D…» (некоторые мессенджеры так делают) */
export function readHandoff(hash: string): HandoffResult {
  if (!hash || hash === '#') return { status: 'none' }
  let value = hash
  if (!value.includes('=')) {
    try {
      value = decodeURIComponent(value)
    } catch {
      return { status: 'invalid' }
    }
  }
  if (!/(?:^#|&)draft=/.test(value)) return { status: 'none' }
  const draft = readDraftFromHash(value)
  return draft ? { status: 'draft', draft } : { status: 'invalid' }
}

/**
 * Убрать фрагмент из адресной строки, не создавая новую запись истории. Сразу — через history (адресная
 * строка очищается синхронно), затем через роутер: иначе vue-router продолжает считать текущим адрес
 * с #draft=… (route.fullPath/hash), и он может утечь дальше — например, в redirect входа.
 */
export function clearHandoffFromUrl(router: Router, path: string): Promise<unknown> {
  window.history.replaceState(window.history.state, '', path)
  return router.replace({ path, query: {}, hash: '' }).catch(() => undefined)
}

export function stashDraft(draft: ImpactDraft): void {
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify(draft))
  } catch {
    // приватный режим / квота — черновик останется только в памяти
  }
}

export function readStashedDraft(): ImpactDraft | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    if (!raw) return null
    const parsed = impactDraftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function clearStashedDraft(): void {
  try {
    sessionStorage.removeItem(STASH_KEY)
  } catch {
    // нечего чистить
  }
}
