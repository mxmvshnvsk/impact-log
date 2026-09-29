<template>
  <div class="capture l-content">
    <!-- черновик не читается -->
    <UiCard v-if="invalid" class="capture__state" padding="lg">
      <AppMascot class="capture__mascot" mood="oops" />
      <div class="capture__state-text">
        <h1 class="capture__title">{{ t('capture.invalid.title') }}</h1>
        <p class="capture__lead">{{ t('capture.invalid.text') }}</p>
        <UiButton :to="hasVault ? { name: 'dashboard' } : { name: 'landing' }">
          {{ hasVault ? t('capture.toJournal') : t('capture.toLanding') }}
        </UiButton>
      </div>
    </UiCard>

    <!-- открыли /capture без черновика -->
    <UiCard v-else-if="!draft" class="capture__state" padding="lg">
      <AppMascot class="capture__mascot" mood="idle" />
      <div class="capture__state-text">
        <h1 class="capture__title">{{ t('capture.empty.title') }}</h1>
        <p class="capture__lead">{{ t('capture.empty.text') }}</p>
        <div class="capture__actions">
          <UiButton v-if="hasVault" :to="{ name: 'impact-new' }">{{ t('dashboard.new') }}</UiButton>
          <UiButton :to="hasVault ? { name: 'dashboard' } : { name: 'landing' }" variant="secondary">
            {{ hasVault ? t('capture.toJournal') : t('capture.toLanding') }}
          </UiButton>
          <UiButton
            v-for="link in extensionLinks"
            :key="link.key"
            :href="link.url"
            target="_blank"
            rel="noopener noreferrer"
            variant="ghost"
          >
            {{ t(`common.install.${link.key}`) }}<ExternalLink :size="16" aria-hidden="true" />
            <span class="sr-only">{{ t('footer.newTab') }}</span>
          </UiButton>
        </div>
      </div>
    </UiCard>

    <template v-else>
      <header class="capture__header">
        <div class="capture__badges">
          <UiEyebrow>{{ t('capture.eyebrow') }}</UiEyebrow>
          <span class="capture__source">
            <component :is="source.icon" :size="14" aria-hidden="true" />
            {{ source.from }}
          </span>
          <a
            v-if="source.href"
            class="capture__source-link"
            :href="source.href"
            target="_blank"
            rel="noopener noreferrer"
          >{{ source.host }}<ExternalLink :size="12" aria-hidden="true" /></a>
        </div>
        <h1 class="capture__title">{{ headerTitle }}</h1>
        <p v-if="headerLead" class="capture__lead">{{ headerLead }}</p>
      </header>

      <!-- хранилища ещё нет: сначала онбординг, черновик ждёт -->
      <div v-if="!hasVault" class="capture__onboarding">
        <UiCard v-if="preview" as="article" variant="glass" class="capture__preview">
          <p class="capture__preview-label">{{ t('capture.onboarding.preview') }}</p>
          <h2 class="capture__preview-title">{{ preview.title }}</h2>
          <MarkdownView
            v-if="preview.description"
            class="capture__preview-text"
            :source="preview.description"
            compact
          />
          <p v-if="preview.evidence || preview.metrics" class="capture__preview-meta">
            <span v-if="preview.evidence">{{ t('capture.onboarding.evidence', { n: preview.evidence }, preview.evidence) }}</span>
            <span v-if="preview.metrics">{{ t('capture.onboarding.metrics', { n: preview.metrics }, preview.metrics) }}</span>
          </p>
        </UiCard>
        <UiCard class="capture__choice" padding="lg">
          <ul class="capture__points">
            <li><ShieldCheck :size="18" aria-hidden="true" />{{ t('capture.onboarding.local') }}</li>
            <li><Lock :size="18" aria-hidden="true" />{{ t('capture.onboarding.encrypted') }}</li>
            <li><RefreshCw :size="18" aria-hidden="true" />{{ t('capture.onboarding.sync') }}</li>
          </ul>
          <UiAlert v-if="createError || vaultUnavailable" tone="danger">
            {{ t('landing.cta.unavailable') }}
          </UiAlert>
          <div class="capture__actions">
            <UiButton :loading="creating" :disabled="vaultUnavailable" @click="startLocal">
              {{ t('landing.cta.start') }}<ArrowRight :size="18" aria-hidden="true" />
            </UiButton>
            <UiButton variant="secondary" :to="loginRoute">{{ t('landing.cta.login') }}</UiButton>
          </div>
          <p class="capture__note">{{ t('capture.onboarding.keep') }}</p>
        </UiCard>
      </div>

      <!-- эта ссылка уже сохранена — не плодим дубликаты -->
      <UiCard v-else-if="duplicateOf && !saveAgain" class="capture__state" padding="lg">
        <AppMascot class="capture__mascot" mood="idle" />
        <div class="capture__state-text">
          <p class="capture__lead">{{ t('capture.duplicate.text') }}</p>
          <div class="capture__actions">
            <UiButton :to="{ name: 'impact', params: { id: duplicateOf } }">
              {{ t('capture.duplicate.open') }}
            </UiButton>
            <UiButton variant="secondary" @click="allowSaveAgain">
              {{ t('capture.duplicate.again') }}
            </UiButton>
          </div>
        </div>
      </UiCard>

      <ImpactForm
        v-else-if="initial"
        :key="draft.draftId"
        :initial="initial"
        :save="save"
        :submit-label="t('capture.save')"
        draft
        @cancel="cancel"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, ExternalLink, Lock, RefreshCw, ShieldCheck } from 'lucide-vue-next'
import { AppMascot } from '@/components/AppMascot'
import { ImpactForm } from '@/components/ImpactForm'
import { MarkdownView } from '@/components/MarkdownView'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { UiEyebrow } from '@/ui/UiEyebrow'
import { useCaptureView } from './useCaptureView'

const c = useCaptureView()
const { t, hasVault, vaultUnavailable, draft, invalid, initial, source, preview } = c
const { headerTitle, headerLead } = c
const {
  creating,
  createError,
  startLocal,
  loginRoute,
  duplicateOf,
  saveAgain,
  allowSaveAgain,
  save,
  cancel,
  extensionLinks,
} = c
</script>

<style scoped src="./CaptureView.css"></style>
