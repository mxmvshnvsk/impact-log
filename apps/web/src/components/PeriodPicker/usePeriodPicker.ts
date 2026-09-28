import type { Period } from '@impact-log/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useLocale } from '@/composables/useLocale'
import { formatRange, plural } from '@/utils/insightsFormat'
import {
  isIsoDate,
  PERIOD_CHOICES,
  type PeriodChoice,
  type PeriodSelection,
  periodLength,
} from '@/utils/periodSelection'

export type PeriodPickerProps = {
  modelValue: PeriodSelection
  /** Разрешённый период (для подписи и начальных дат своего диапазона) */
  period: Period
  /** select — всегда выпадающий список (узкая колонка настроек) */
  variant?: 'auto' | 'select'
  /** Максимальная дата своего диапазона (сегодня) */
  max?: string
}

type Emit = (event: 'update:modelValue', value: PeriodSelection) => void

export function usePeriodPicker(props: PeriodPickerProps, emit: Emit) {
  const { t } = useI18n()
  const { locale } = useLocale()
  const { isMobile } = useBreakpoint()

  const useSelect = computed(() => props.variant === 'select' || isMobile.value)

  const options = computed(() =>
    PERIOD_CHOICES.map((choice) => ({
      value: choice,
      label: t(`insights.period.presets.${choice}`),
    })),
  )

  const choice = computed<PeriodChoice>(() => props.modelValue.preset)

  function onChoice(value: string | number) {
    const next = String(value) as PeriodChoice
    if (!PERIOD_CHOICES.includes(next) || next === choice.value) return
    if (next === 'custom') {
      // свой диапазон начинается с того, что пользователь видел
      emit('update:modelValue', { preset: 'custom', from: props.period.from, to: props.period.to })
    } else {
      emit('update:modelValue', { preset: next })
    }
  }

  const custom = computed(() => (props.modelValue.preset === 'custom' ? props.modelValue : null))

  function onDate(edge: 'from' | 'to', event: Event) {
    const value = (event.target as HTMLInputElement).value
    const current = custom.value
    if (!current || !isIsoDate(value)) return
    let { from, to } = current
    if (edge === 'from') from = value
    else to = value
    if (from > to) [from, to] = edge === 'from' ? [from, from] : [to, to]
    emit('update:modelValue', { preset: 'custom', from, to })
  }

  const caption = computed(() => {
    const days = periodLength(props.period)
    return `${formatRange(locale.value, props.period.from, props.period.to)} · ${plural(t, locale.value, 'insights.units.days', days)}`
  })

  return { t, useSelect, options, choice, onChoice, custom, onDate, caption }
}
