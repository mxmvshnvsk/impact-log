import { localIsoDate } from './periodSelection'

/**
 * Скачивание файла, собранного в браузере: Blob → <a download>. Ничего не уходит в сеть,
 * объектная ссылка освобождается сразу после того, как браузер начал загрузку.
 */
export function downloadFile(filename: string, content: BlobPart, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export const MIME = {
  json: 'application/json;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
} as const

export type DownloadFormat = keyof typeof MIME

/** BOM в CSV — чтобы Excel открыл кириллицу без «кракозябр» */
const CSV_BOM = '﻿'

/** impact-log-2026-09-28.json, impact-log-review-2026-09-28.md … */
export function datedFilename(extension: DownloadFormat, suffix?: string, date = new Date()) {
  return `impact-log${suffix ? `-${suffix}` : ''}-${localIsoDate(date)}.${extension}`
}

export function downloadText(filename: string, text: string, format: DownloadFormat): void {
  downloadFile(filename, format === 'csv' ? CSV_BOM + text : text, MIME[format])
}
