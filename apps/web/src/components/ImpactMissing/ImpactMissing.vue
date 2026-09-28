<template>
  <UiCard class="impact-missing" padding="lg">
    <AppMascot class="impact-missing__mascot" mood="oops" />
    <div class="impact-missing__text">
      <h1 class="impact-missing__title">{{ t('impacts.missing.title') }}</h1>
      <p class="impact-missing__lead">{{ t('impacts.missing.text') }}</p>
      <UiButton :to="{ name: 'dashboard' }">
        <ArrowLeft :size="18" aria-hidden="true" />{{ t('impacts.missing.back') }}
      </UiButton>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { AppMascot } from '@/components/AppMascot'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'

/** Записи с таким id нет: удалена (возможно, на другом устройстве) или ссылка неверная */
const { t } = useI18n()
</script>

<style scoped src="./ImpactMissing.css"></style>
