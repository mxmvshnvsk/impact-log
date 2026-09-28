/** Нормализация меток: обрезка, схлопывание пробелов, нижний регистр, без «#», без дублей */
export function normalizeLabels(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const value = raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase()
    if (value && !seen.has(value)) {
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

/** Категории: регистр сохраняем, дубли сравниваем без учёта регистра */
export function normalizeCategories(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ')
    const key = value.toLocaleLowerCase()
    if (value && !seen.has(key)) {
      seen.add(key)
      result.push(value)
    }
  }
  return result
}

/** Разбор строки «tag1, tag2 #tag3» в список меток */
export function parseLabelInput(input: string): string[] {
  return normalizeLabels(input.split(/[,\s]+/))
}
