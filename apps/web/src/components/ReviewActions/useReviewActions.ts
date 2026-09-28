import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@/composables/useClipboard'
import { datedFilename, downloadText } from '@/utils/download'

export type ReviewActionsProps = {
  markdown: string
  /** Markdown + инструкция для внешнего AI */
  prompt: string
}

export function useReviewActions(props: ReviewActionsProps) {
  const { t } = useI18n()
  const markdownClipboard = useClipboard()
  const promptClipboard = useClipboard()

  function copyMarkdown() {
    void markdownClipboard.copy(props.markdown)
  }

  function copyPrompt() {
    void promptClipboard.copy(props.prompt)
  }

  function download() {
    downloadText(datedFilename('md', 'review'), props.markdown, 'md')
  }

  /** Печатается только отчёт — см. ReviewView.print.css */
  function print() {
    window.print()
  }

  const status = computed(() => {
    if (markdownClipboard.copied.value) return t('review.actions.copiedMarkdown')
    if (promptClipboard.copied.value) return t('review.actions.copiedPrompt')
    return ''
  })

  return {
    t,
    markdownCopied: markdownClipboard.copied,
    promptCopied: promptClipboard.copied,
    status,
    copyMarkdown,
    copyPrompt,
    download,
    print,
  }
}
