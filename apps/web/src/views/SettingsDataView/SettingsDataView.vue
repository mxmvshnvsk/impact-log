<template>
  <div class="settings-data">
    <DataStorageInfo :count="count" :created-at="createdAt" />
    <DataQuarantine />
    <DataExport :impacts="impacts" />
    <DataImport />
    <DataDanger />
  </div>
</template>

<script setup lang="ts">
import { DataDanger } from '@/components/DataDanger'
import { DataExport } from '@/components/DataExport'
import { DataImport } from '@/components/DataImport'
import { DataQuarantine } from '@/components/DataQuarantine'
import { DataStorageInfo } from '@/components/DataStorageInfo'
import { useSettingsDataView } from './useSettingsDataView'

const { impacts, count, createdAt } = useSettingsDataView()
</script>

<style scoped src="./SettingsDataView.css"></style>
