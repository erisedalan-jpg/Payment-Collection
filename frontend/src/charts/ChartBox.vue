<script setup lang="ts">
import { computed } from 'vue'
import { getActivePinia } from 'pinia'
import VChart from 'vue-echarts'
import { ENT_THEME, ENT_THEME_DARK } from './echartsTheme'
import { useSettingsStore } from '@/stores/settings'

withDefaults(
  defineProps<{
    option: Record<string, any>
    height?: string
  }>(),
  { height: '320px' },
)

const emit = defineEmits<{ 'datapoint-click': [any] }>()

// 无活动 pinia 时（个别不带 store 的测试场景）回退浅色，避免抛错。
const theme = computed(() => {
  if (!getActivePinia()) return ENT_THEME
  return useSettingsStore().theme === 'dark' ? ENT_THEME_DARK : ENT_THEME
})
</script>

<template>
  <div class="chart-box" :style="{ height }">
    <VChart :option="option" :theme="theme" autoresize @click="(e: any) => emit('datapoint-click', e)" />
  </div>
</template>

<style scoped>
.chart-box { width: 100%; }
.chart-box :deep(.echarts) { width: 100%; height: 100%; }
</style>
