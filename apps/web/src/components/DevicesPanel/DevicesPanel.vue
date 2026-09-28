<template>
  <SettingsSection :title="t('account.devices.title')" :lead="t('account.devices.lead')" :icon="MonitorSmartphone">
    <p v-if="loading && !devices.length" class="devices__muted" role="status">
      <UiSpinner :size="16" />{{ t('account.devices.loading') }}
    </p>
    <div v-else-if="loadError" class="devices__error">
      <UiAlert tone="danger">{{ t(loadError) }}</UiAlert>
      <UiButton size="sm" variant="secondary" @click="load">{{ t('account.devices.retry') }}</UiButton>
    </div>

    <ul v-if="devices.length" class="devices__list">
      <li v-for="device in devices" :key="device.deviceId" class="devices__item">
        <span class="devices__icon" :class="{ 'devices__icon--current': device.current }">
          <component :is="device.icon" :size="18" aria-hidden="true" />
        </span>
        <div class="devices__body">
          <form
            v-if="device.current && renaming"
            class="devices__rename"
            novalidate
            @submit.prevent="saveName"
          >
            <UiInput
              ref="renameRef"
              v-model="draftName"
              name="device-name"
              autocomplete="off"
              :maxlength="maxLength"
              :label="t('account.devices.renameLabel')"
              :error="renameError ? t(renameError) : null"
            />
            <div class="devices__rename-actions">
              <UiButton type="submit" size="sm" :loading="saving">{{ t('account.devices.save') }}</UiButton>
              <UiButton size="sm" variant="ghost" :disabled="saving" @click="cancelRename">
                {{ t('account.devices.cancel') }}
              </UiButton>
            </div>
          </form>
          <template v-else>
            <p class="devices__name">
              <span :class="{ 'devices__name--muted': !device.label }">{{ device.name }}</span>
              <span v-if="device.current" class="devices__badge devices__badge--current">
                {{ t('account.devices.current') }}
              </span>
            </p>
            <p class="devices__meta">
              <span>{{ t('account.devices.lastSeen', { date: device.lastSeen }) }}</span>
              <span>{{ t('account.devices.added', { date: device.added }) }}</span>
            </p>
            <p v-if="device.trusted" class="devices__trusted">
              <ShieldCheck :size="14" aria-hidden="true" />{{ t('account.devices.trusted') }}
            </p>
          </template>
        </div>
        <div v-if="!(device.current && renaming)" class="devices__actions">
          <UiButton v-if="device.current" size="sm" variant="secondary" @click="startRename(device)">
            <Pencil :size="14" aria-hidden="true" />{{ t('account.devices.rename') }}
          </UiButton>
          <UiButton
            v-else
            size="sm"
            variant="ghost"
            class="devices__revoke"
            :aria-label="t('account.devices.revokeLabel', { name: device.name })"
            @click="askRevoke(device)"
          >
            <Unplug :size="14" aria-hidden="true" />{{ t('account.devices.revoke') }}
          </UiButton>
        </div>
      </li>
    </ul>
    <UiAlert v-if="notice" tone="success">{{ t(notice) }}</UiAlert>
    <UiAlert v-if="actionError" tone="danger">{{ t(actionError) }}</UiAlert>

    <UiDialog
      :open="revoking !== null"
      tone="danger"
      :title="t('account.devices.revokeTitle', { name: revoking?.name ?? '' })"
      :description="t('account.devices.revokeText')"
      :confirm-label="t('account.devices.revokeConfirm')"
      :cancel-label="t('account.devices.cancel')"
      :loading="revokeBusy"
      @confirm="confirmRevoke"
      @cancel="revoking = null"
    />
  </SettingsSection>
</template>

<script setup lang="ts">
import { MonitorSmartphone, Pencil, ShieldCheck, Unplug } from 'lucide-vue-next'
import { SettingsSection } from '@/components/SettingsSection'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiDialog } from '@/ui/UiDialog'
import { UiInput } from '@/ui/UiInput'
import { UiSpinner } from '@/ui/UiSpinner'
import { useDevicesPanel } from './useDevicesPanel'

const {
  t,
  devices,
  loading,
  loadError,
  load,
  maxLength,
  renaming,
  draftName,
  renameRef,
  renameError,
  saving,
  startRename,
  cancelRename,
  saveName,
  revoking,
  revokeBusy,
  askRevoke,
  confirmRevoke,
  notice,
  actionError,
} = useDevicesPanel()
</script>

<style scoped src="./DevicesPanel.css"></style>
