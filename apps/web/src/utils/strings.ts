export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/** Первая буква строки в верхнем регистре — для аватара-инициала */
export function initial(value: string): string {
  return value.charAt(0).toUpperCase()
}

/**
 * Логин (и другие короткие идентификаторы) без переноса по дефису: «qa-636103» не разрывается на «qa-» / «636103».
 * Вокруг дефиса — WORD JOINER (U+2060): глиф остаётся обычным дефисом, а перенос запрещён.
 */
export function noBreak(value: string): string {
  return value.replace(/-/g, '\u2060-\u2060')
}
