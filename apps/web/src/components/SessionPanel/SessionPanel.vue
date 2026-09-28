<template>
  <SettingsSection :title="t('account.session.title')" :lead="t('account.session.text')" :icon="LogOut">
    <div class="session__options">
      <div class="session__option">
        <UiButton variant="secondary" class="session__button" @click="openLogout(false)">
          <HardDrive :size="16" aria-hidden="true" />{{ t('account.session.keep') }}
        </UiButton>
        <p class="session__hint">{{ t('account.session.keepHint') }}</p>
      </div>
      <div class="session__option">
        <UiButton variant="secondary" class="session__button session__danger" @click="openLogout(true)">
          <Eraser :size="16" aria-hidden="true" />{{ t('account.session.wipe') }}
        </UiButton>
        <p class="session__hint">{{ t('account.session.wipeHint') }}</p>
      </div>
    </div>

    <div class="session__everywhere">
      <div class="session__everywhere-text">
        <h3 class="session__everywhere-title">{{ t('account.session.everywhere') }}</h3>
        <p class="session__hint">{{ t('account.session.everywhereHint') }}</p>
      </div>
      <UiButton size="sm" variant="secondary" @click="everywhereOpen = true">
        <LogOut :size="16" aria-hidden="true" />{{ t('account.session.everywhere') }}
      </UiButton>
    </div>
    <UiAlert v-if="everywhereDone" tone="success">{{ t('account.session.everywhereDone') }}</UiAlert>

    <LogoutDialog :open="logoutOpen" :initial-wipe="logoutWipe" @close="logoutOpen = false" />
    <UiDialog
      :open="everywhereOpen"
      :title="t('account.session.everywhereTitle')"
      :description="t('account.session.everywhereText')"
      :confirm-label="t('account.session.everywhereConfirm')"
      :cancel-label="t('account.security.cancel')"
      :loading="everywhereBusy"
      @confirm="confirmEverywhere"
      @cancel="everywhereOpen = false"
    >
      <UiAlert v-if="everywhereError" tone="danger">{{ t(everywhereError) }}</UiAlert>
    </UiDialog>
  </SettingsSection>
</template>

<script setup lang="ts">
import { Eraser, HardDrive, LogOut } from 'lucide-vue-next'
import { LogoutDialog } from '@/components/LogoutDialog'
import { SettingsSection } from '@/components/SettingsSection'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiDialog } from '@/ui/UiDialog'
import { useSessionPanel } from './useSessionPanel'

const {
  t,
  logoutOpen,
  logoutWipe,
  openLogout,
  everywhereOpen,
  everywhereBusy,
  everywhereError,
  everywhereDone,
  confirmEverywhere,
} = useSessionPanel()
</script>

<style scoped src="./SessionPanel.css"></style>
