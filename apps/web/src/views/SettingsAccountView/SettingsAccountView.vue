<template>
  <div class="settings-account">
    <!-- аккаунт только что удалён: записи остались локально — оставить или стереть -->
    <SettingsSection
      v-if="deletedLogin !== null"
      :title="t('account.delete.doneTitle')"
      :lead="t('account.delete.doneText')"
      :icon="CircleCheck"
      tone="accent"
    >
      <div class="settings-account__actions">
        <UiButton @click="keepAfterDelete">{{ t('account.delete.keep') }}</UiButton>
        <UiButton variant="danger" :loading="wiping" @click="wipe">
          <Eraser :size="16" aria-hidden="true" />{{ t('account.delete.wipe') }}
        </UiButton>
      </div>
      <UiAlert v-if="wipeError" tone="danger">{{ t(wipeError) }}</UiAlert>
    </SettingsSection>

    <!-- без аккаунта: записи только на этом устройстве -->
    <SettingsSection
      v-else-if="mode === 'local'"
      :title="t('account.local.title')"
      :lead="t('account.local.text')"
      :icon="CloudOff"
    >
      <ul class="settings-account__points">
        <li v-for="point in localPoints" :key="point.key">
          <component :is="point.icon" :size="18" aria-hidden="true" />
          <span>{{ t(`account.local.points.${point.key}`) }}</span>
        </li>
      </ul>
      <div class="settings-account__actions">
        <UiButton :to="{ name: 'register' }">
          <CloudUpload :size="16" aria-hidden="true" />{{ t('account.local.enable') }}
        </UiButton>
        <UiButton variant="secondary" :to="{ name: 'login', query: { redirect: '/settings/account' } }">
          <LogIn :size="16" aria-hidden="true" />{{ t('account.local.signIn') }}
        </UiButton>
      </div>
    </SettingsSection>

    <template v-else>
      <SettingsSection
        v-if="mode === 'signed-out'"
        :title="t('account.signedOut.title')"
        :lead="t('account.signedOut.text')"
        :icon="LogIn"
        tone="warning"
      >
        <div>
          <UiButton :to="loginAgain">{{ t('account.signedOut.action') }}</UiButton>
        </div>
      </SettingsSection>

      <SettingsSection :title="t('account.profile.title')" :icon="UserRound" tone="accent">
        <dl class="settings-account__facts">
          <div class="settings-account__fact">
            <dt>{{ t('account.profile.login') }}</dt>
            <dd class="settings-account__strong">{{ account?.login }}</dd>
          </div>
          <div class="settings-account__fact">
            <dt>{{ t('account.profile.accountId') }}</dt>
            <dd>
              <span class="settings-account__id">
                <code translate="no">{{ accountId }}</code>
                <UiIconButton :label="copied ? t('auth.recoveryKit.copied') : t('account.profile.copyId')" @click="copyId">
                  <Check v-if="copied" :size="16" aria-hidden="true" />
                  <Copy v-else :size="16" aria-hidden="true" />
                </UiIconButton>
              </span>
              <span class="settings-account__hint">{{ t('account.profile.accountIdHint') }}</span>
            </dd>
          </div>
          <div class="settings-account__fact">
            <dt>{{ t('account.profile.plan') }}</dt>
            <dd class="settings-account__strong">{{ t(`account.profile.plans.${plan}`) }}</dd>
          </div>
          <div v-if="usageRows.length" class="settings-account__fact">
            <dt>{{ t('account.profile.impacts') }}</dt>
            <dd>{{ usageRows[0] }}</dd>
          </div>
          <div v-if="usageRows.length > 1" class="settings-account__fact">
            <dt>{{ t('account.profile.devices') }}</dt>
            <dd>{{ usageRows[1] }}</dd>
          </div>
          <div v-if="storageMeters.length" class="settings-account__fact">
            <dt>{{ t('account.profile.storage') }}</dt>
            <dd class="settings-account__meters">
              <div v-for="meter in storageMeters" :key="meter.key" class="settings-account__meter">
                <p class="settings-account__meter-row">
                  <span class="settings-account__meter-label">{{ meter.label }}</span>
                  <span>{{ meter.text }}</span>
                </p>
                <UiProgress
                  v-if="meter.max"
                  :value="meter.value"
                  :max="meter.max"
                  :label="`${meter.label}: ${meter.text}`"
                />
              </div>
            </dd>
          </div>
        </dl>
      </SettingsSection>

      <SyncPanel />
      <ConflictsPanel />

      <template v-if="mode === 'signed-in'">
        <DevicesPanel />
        <SecurityPanel />
      </template>
      <SessionPanel />
      <DeleteAccountPanel v-if="mode === 'signed-in'" />
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  Check,
  CircleCheck,
  CloudOff,
  CloudUpload,
  Copy,
  Eraser,
  LogIn,
  UserRound,
} from 'lucide-vue-next'
import { ConflictsPanel } from '@/components/ConflictsPanel'
import { DeleteAccountPanel } from '@/components/DeleteAccountPanel'
import { DevicesPanel } from '@/components/DevicesPanel'
import { SecurityPanel } from '@/components/SecurityPanel'
import { SessionPanel } from '@/components/SessionPanel'
import { SettingsSection } from '@/components/SettingsSection'
import { SyncPanel } from '@/components/SyncPanel'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiIconButton } from '@/ui/UiIconButton'
import { UiProgress } from '@/ui/UiProgress'
import { useSettingsAccountView } from './useSettingsAccountView'

const {
  t,
  mode,
  account,
  accountId,
  plan,
  usageRows,
  storageMeters,
  copied,
  copyId,
  loginAgain,
  localPoints,
  deletedLogin,
  keepAfterDelete,
  wiping,
  wipeError,
  wipe,
} = useSettingsAccountView()
</script>

<style scoped src="./SettingsAccountView.css"></style>
