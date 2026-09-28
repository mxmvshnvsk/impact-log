import { readMeta, writeMeta } from './db'

/*
 * Какие черновики захвата (ImpactDraft.draftId) уже сохранены и в какие записи. Нужно, чтобы повторное
 * открытие той же ссылки из Chrome/CLI/VS Code не создавало дубликат. Только идентификаторы, на устройстве.
 */
type CaptureMark = { draftId: string; objectId: string; savedAt: string }

const MAX_MARKS = 500

export async function findCapture(draftId: string): Promise<string | null> {
  const marks = (await readMeta<CaptureMark[]>('captures')) ?? []
  return marks.find((mark) => mark.draftId === draftId)?.objectId ?? null
}

export async function rememberCapture(draftId: string, objectId: string): Promise<void> {
  const marks = (await readMeta<CaptureMark[]>('captures')) ?? []
  const next = [
    { draftId, objectId, savedAt: new Date().toISOString() },
    ...marks.filter((mark) => mark.draftId !== draftId),
  ].slice(0, MAX_MARKS)
  await writeMeta('captures', next)
}
