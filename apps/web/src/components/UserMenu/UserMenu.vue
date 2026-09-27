<template>
  <div v-if="user" class="user-menu">
    <span class="user-menu__avatar" aria-hidden="true">{{ avatar }}</span>
    <span class="user-menu__login">{{ user.login }}</span>
    <UiButton class="user-menu__logout" size="sm" variant="secondary" @click="logout">
      <LogOut :size="16" aria-hidden="true" />
      <span class="user-menu__logout-text">{{ t('nav.logout') }}</span>
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { LogOut } from 'lucide-vue-next'
import { UiButton } from '@/ui/UiButton'
import { useUserMenu } from './useUserMenu'

const { t, user, avatar, logout } = useUserMenu()
</script>

<style scoped src="./UserMenu.css"></style>
