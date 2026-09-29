<template>
  <SettingsSection :title="t('account.security.title')" :icon="ShieldCheck" tone="accent">
    <ul class="security__list">
      <li v-for="row in rows" :id="anchor(row.key)" :key="row.key" class="security__row">
        <div class="security__row-head">
          <span class="security__row-icon"><component :is="row.icon" :size="18" aria-hidden="true" /></span>
          <div class="security__row-text">
            <h3 class="security__row-title">{{ t(`account.security.${row.key}.title`) }}</h3>
            <p class="security__row-lead">{{ t(`account.security.${row.key}.text`) }}</p>
            <!-- что делать, если потеряли пароль / телефон / всё -->
            <dl v-if="row.key === 'recoveryKey'" class="security__scheme">
              <div v-for="item in scheme" :key="item" class="security__scheme-item">
                <dt>{{ t(`account.security.scheme.${item}.lost`) }}</dt>
                <dd>{{ t(`account.security.scheme.${item}.how`) }}</dd>
              </div>
            </dl>
          </div>
          <UiButton
            v-if="active !== row.key"
            size="sm"
            variant="secondary"
            class="security__row-action"
            @click="open(row.key)"
          >
            {{ t(`account.security.${row.key}.action`) }}
          </UiButton>
        </div>
        <UiAlert v-if="done === row.key" tone="success">{{ t(`account.security.${row.key}.done`) }}</UiAlert>
        <div v-if="active === row.key" class="security__row-body">
          <ChangePasswordForm v-if="row.key === 'password'" @done="finish('password')" @cancel="close" />
          <RecoveryKeyRotation v-else-if="row.key === 'recoveryKey'" @done="finish('recoveryKey')" @cancel="close" />
          <TotpRotation v-else @done="finish('totp')" @cancel="close" />
        </div>
      </li>
    </ul>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'
import { ChangePasswordForm } from '@/components/ChangePasswordForm'
import { RecoveryKeyRotation } from '@/components/RecoveryKeyRotation'
import { SettingsSection } from '@/components/SettingsSection'
import { TotpRotation } from '@/components/TotpRotation'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { useSecurityPanel } from './useSecurityPanel'

const { t, rows, scheme, anchor, active, done, open, close, finish } = useSecurityPanel()
</script>

<style scoped src="./SecurityPanel.css"></style>
