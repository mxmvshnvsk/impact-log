<template>
  <div ref="rootRef" class="account-menu" @keydown="onKeydown">
    <button
      ref="triggerRef"
      type="button"
      class="account-menu__trigger"
      :class="{ 'account-menu__trigger--open': open }"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      :aria-label="`${t('account.menu.label')}: ${label}`"
      @click="toggle"
    >
      <span class="account-menu__avatar" :class="`account-menu__avatar--${mode}`" aria-hidden="true">
        <HardDrive v-if="mode === 'local'" :size="16" />
        <template v-else>{{ avatar }}</template>
        <span v-if="mode === 'signed-out'" class="account-menu__alert" />
      </span>
      <span class="account-menu__label" :class="{ 'account-menu__label--local': mode === 'local' }">{{
        label
      }}</span>
      <ChevronDown class="account-menu__chevron" :size="16" aria-hidden="true" />
    </button>

    <Transition name="account-menu">
      <div v-if="open" :id="menuId" class="account-menu__popover" role="menu" :aria-label="t('account.menu.label')">
        <div class="account-menu__head">
          <span class="account-menu__head-title">{{ label }}</span>
          <span class="account-menu__head-hint" :class="`account-menu__head-hint--${mode}`">{{ hint }}</span>
        </div>
        <template v-for="item in items" :key="item.key">
          <RouterLink
            v-if="item.to"
            :to="item.to"
            role="menuitem"
            class="account-menu__item"
            :class="{ 'account-menu__item--accent': item.accent }"
            @click="close()"
          >
            <component :is="item.icon" :size="16" aria-hidden="true" />{{ item.label }}
          </RouterLink>
          <button
            v-else
            type="button"
            role="menuitem"
            class="account-menu__item"
            :class="{ 'account-menu__item--accent': item.accent }"
            @click="item.action?.()"
          >
            <component :is="item.icon" :size="16" aria-hidden="true" />{{ item.label }}
          </button>
        </template>
      </div>
    </Transition>

    <LogoutDialog :open="logoutOpen" @close="logoutOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, HardDrive } from 'lucide-vue-next'
import { LogoutDialog } from '@/components/LogoutDialog'
import { useAccountMenu } from './useAccountMenu'

const {
  t,
  rootRef,
  triggerRef,
  menuId,
  open,
  mode,
  label,
  hint,
  avatar,
  items,
  toggle,
  close,
  onKeydown,
  logoutOpen,
} = useAccountMenu()
</script>

<style scoped src="./AccountMenu.css"></style>
