import {
  type AttachmentRef,
  type Evidence,
  type ImpactInput,
  impactInputSchema,
  type Metric,
  todayIso,
} from '@impact-log/core'
import { parseNumberInput } from '@/utils/numbers'

/*
 * Состояние формы записи: то же, что ImpactInput, но числа метрик — строками (как в полях ввода),
 * а у повторяемых строк есть стабильный key для v-for. Ошибки — ключи i18n validation.* по «пути» поля:
 * title, occurredAt, metrics.0.value, evidence.1.url …
 */
export type MetricRow = {
  key: string
  label: string
  baseline: string
  value: string
  unit: string
}
export type EvidenceRow = Evidence & { key: string }

export type ImpactFormState = {
  title: string
  occurredAt: string
  impactScore: number
  description: string
  categories: string[]
  labels: string[]
  metrics: MetricRow[]
  evidence: EvidenceRow[]
  /** Вложения в форме не редактируются, но при сохранении не должны теряться */
  attachments?: AttachmentRef[]
}

export type FormErrors = Record<string, string>

let counter = 0
export function rowKey(): string {
  counter += 1
  return `row-${counter}`
}

export function emptyMetricRow(): MetricRow {
  return { key: rowKey(), label: '', baseline: '', value: '', unit: '' }
}

function numberText(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

export function toFormState(input: Partial<ImpactInput>): ImpactFormState {
  return {
    title: input.title ?? '',
    occurredAt: input.occurredAt ?? todayIso(),
    impactScore: input.impactScore ?? 3,
    description: input.description ?? '',
    categories: [...(input.categories ?? [])],
    labels: [...(input.labels ?? [])],
    metrics: (input.metrics ?? []).map((metric) => ({
      key: rowKey(),
      label: metric.label,
      baseline: numberText(metric.baseline),
      value: numberText(metric.value),
      unit: metric.unit ?? '',
    })),
    evidence: (input.evidence ?? []).map((item) => ({ ...item, key: rowKey() })),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  }
}

/** Снимок для сравнения «есть ли несохранённые изменения» (без служебных key) */
export function snapshot(state: ImpactFormState): string {
  return JSON.stringify({
    ...state,
    metrics: state.metrics.map(({ key: _key, ...row }) => row),
    evidence: state.evidence.map(({ key: _key, ...item }) => item),
  })
}

function metricsFromRows(rows: readonly MetricRow[], errors: FormErrors): Metric[] {
  const metrics: Metric[] = []
  rows.forEach((row, index) => {
    const label = row.label.trim()
    const unit = row.unit.trim()
    const isEmpty = !label && !row.value.trim() && !row.baseline.trim() && !unit
    if (isEmpty) return // пустую строку просто не сохраняем
    const value = parseNumberInput(row.value)
    const baseline = parseNumberInput(row.baseline)
    if (!label) errors[`metrics.${index}.label`] = 'impact.metricLabelRequired'
    if (value === null) {
      errors[`metrics.${index}.value`] = row.value.trim()
        ? 'impact.metricNumber'
        : 'impact.metricValueRequired'
    }
    if (row.baseline.trim() && baseline === null) {
      errors[`metrics.${index}.baseline`] = 'impact.metricNumber'
    }
    if (label && value !== null) {
      metrics.push({
        label,
        value,
        ...(unit ? { unit } : {}),
        ...(baseline !== null ? { baseline } : {}),
      })
    }
  })
  return metrics
}

/** Сообщения схем ядра — ключи вида impact.titleRequired; прочие (лимиты zod) сводим к общим */
function issueKey(path: readonly PropertyKey[], message: string): string {
  if (message.startsWith('impact.')) return message
  const [field] = path
  if (field === 'categories' || field === 'labels') return 'impact.chipTooLong'
  if (field === 'metrics') return 'impact.metricInvalid'
  if (field === 'evidence') return 'impact.evidenceInvalid'
  return 'impact.invalid'
}

/** Проверка всей формы: ImpactInput (если всё верно) и ошибки по путям полей */
export function validateForm(state: ImpactFormState): { input: ImpactInput; errors: FormErrors } {
  const errors: FormErrors = {}
  const metrics = metricsFromRows(state.metrics, errors)
  const input: ImpactInput = {
    title: state.title.trim(),
    occurredAt: state.occurredAt,
    impactScore: state.impactScore,
    description: state.description.trim() ? state.description : undefined,
    categories: state.categories,
    labels: state.labels,
    metrics: metrics.length ? metrics : undefined,
    evidence: state.evidence.length
      ? state.evidence.map(({ key: _key, ...item }) => item)
      : undefined,
    attachments: state.attachments,
  }
  const result = impactInputSchema.safeParse(input)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join('.')
      const key =
        issue.path[0] === 'categories' || issue.path[0] === 'labels' ? String(issue.path[0]) : path
      if (!(key in errors)) errors[key] = issueKey(issue.path, issue.message)
    }
  }
  return { input, errors }
}
