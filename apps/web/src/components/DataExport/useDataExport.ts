import {
  buildReview,
  DEFAULT_REVIEW_OPTIONS,
  earliestDate,
  exportCsv,
  exportJson,
  type Impact,
  renderReviewMarkdown,
} from '@impact-log/core'
import { Braces, FileText, type LucideIcon, Sheet } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from '@/composables/useLocale'
import { type DownloadFormat, datedFilename, downloadText } from '@/utils/download'
import { localIsoDate } from '@/utils/periodSelection'

export type DataExportProps = { impacts: readonly Impact[] }

type ExportItem = { format: DownloadFormat; icon: LucideIcon }

const FORMATS: readonly ExportItem[] = [
  { format: 'json', icon: Braces },
  { format: 'csv', icon: Sheet },
  { format: 'md', icon: FileText },
]

/** Экспорт доступен всегда, на любом тарифе (ADR-0005 §13): JSON для переноса, CSV, Markdown */
export function useDataExport(props: DataExportProps) {
  const { t } = useI18n()
  const { locale } = useLocale()
  const done = ref<DownloadFormat | null>(null)

  /** Весь архив в Markdown: по месяцам, без блока «ключевые результаты» */
  function markdown(): string {
    const today = localIsoDate()
    let latest = today
    for (const impact of props.impacts) if (impact.occurredAt > latest) latest = impact.occurredAt
    const report = buildReview(props.impacts, {
      ...DEFAULT_REVIEW_OPTIONS,
      groupBy: 'month',
      highlights: 0,
      period: { from: earliestDate(props.impacts) ?? today, to: latest },
      locale: locale.value,
      title: t('data.export.markdownTitle'),
    })
    return renderReviewMarkdown(report)
  }

  function content(format: DownloadFormat): string {
    if (format === 'json') return exportJson(props.impacts)
    if (format === 'csv') return exportCsv(props.impacts)
    return markdown()
  }

  function download(format: DownloadFormat) {
    downloadText(datedFilename(format), content(format), format)
    done.value = format
  }

  return { t, formats: FORMATS, done, download }
}
