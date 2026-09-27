export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/** Первая буква строки в верхнем регистре — для аватара-инициала */
export function initial(value: string): string {
  return value.charAt(0).toUpperCase()
}
