import { ref } from 'vue'
import { useScoreOptions } from '@/components/ScoreInput/useScoreInput'
import type { MascotMood } from '@/composables/useMascot'

const MARKDOWN = [
  '### Heading',
  'Paragraph with **bold**, _italic_, `code` and [a link](https://example.com).',
  '',
  '- list item',
  '- [x] done task',
  '- [ ] open task',
  '',
  '> quote',
  '',
  '```',
  'pnpm build',
  '```',
  '',
  '![external image](https://example.com/x.png) — becomes a link',
].join('\n')

/** Витрина компонентов (только в dev): /dev/ui */
export function useUiKitView() {
  const moods: MascotMood[] = ['idle', 'watching', 'hiding', 'peeking', 'sleeping', 'happy', 'oops']
  return {
    text: ref('ab'),
    secret: ref('correct horse'),
    otp: ref('12'),
    checked: ref(true),
    moods,
    longText: ref(
      'Cut frontend build time from 6 to 2 minutes.\nThe team waits 40 hours less per month.',
    ),
    period: ref('quarter'),
    periodOptions: [
      { value: 'month', label: '30 days' },
      { value: 'quarter', label: '3 months' },
      { value: 'year', label: 'Year' },
    ],
    segment: ref<string | number>('write'),
    segmentOptions: [
      { value: 'write', label: 'Write' },
      { value: 'preview', label: 'Preview' },
      { value: 'split', label: 'Split', title: 'Side by side' },
    ],
    score: ref(3),
    scoreOptions: useScoreOptions(),
    chips: ref(['perf', 'ci']),
    markdown: MARKDOWN,
    dialog: ref<'default' | 'danger' | null>(null),
  }
}
