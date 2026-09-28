<template>
  <form class="quick-add" novalidate :aria-label="t('dashboard.quick.label')" @submit.prevent="submit">
    <UiInput
      :model-value="title"
      class="quick-add__field"
      name="quick-title"
      :label="t('dashboard.quick.field')"
      :placeholder="t('dashboard.quick.placeholder')"
      :error="error"
      :maxlength="200"
      autocomplete="off"
      enterkeyhint="done"
      spellcheck
      @update:model-value="onTitle"
      @focus="emit('focus')"
      @blur="emit('blur')"
    />
    <div class="quick-add__bar">
      <div class="quick-add__score">
        <span class="quick-add__score-label" aria-hidden="true">{{ t('impacts.form.score') }}</span>
        <UiSegmented v-model="score" size="sm" :label="t('impacts.form.score')" :options="scoreOptions" />
      </div>
      <div class="quick-add__actions">
        <UiButton variant="ghost" size="sm" @click="details">
          {{ t('dashboard.quick.details') }}
        </UiButton>
        <UiButton type="submit" size="sm" :loading="saving">
          <CornerDownLeft :size="16" aria-hidden="true" />{{ t('dashboard.quick.submit') }}
        </UiButton>
      </div>
    </div>
    <p class="quick-add__status" role="status">
      <template v-if="done">
        <Check :size="16" aria-hidden="true" />
        {{ t('dashboard.quick.done') }}
        <RouterLink :to="{ name: 'impact-edit', params: { id: done.objectId } }">
          {{ t('dashboard.quick.addDetails') }}
        </RouterLink>
      </template>
    </p>
  </form>
</template>

<script setup lang="ts">
import type { Impact } from '@impact-log/core'
import { Check, CornerDownLeft } from 'lucide-vue-next'
import { useScoreOptions } from '@/components/ScoreInput/useScoreInput'
import { UiButton } from '@/ui/UiButton'
import { UiInput } from '@/ui/UiInput'
import { UiSegmented } from '@/ui/UiSegmented'
import { useImpactQuickAdd } from './useImpactQuickAdd'

const emit = defineEmits<{
  created: [impact: Impact]
  failed: []
  typing: [length: number]
  focus: []
  blur: []
}>()
const scoreOptions = useScoreOptions()
const { t, title, score, saving, error, done, onTitle, submit, details } = useImpactQuickAdd(emit)
</script>

<style scoped src="./ImpactQuickAdd.css"></style>
