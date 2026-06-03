<script setup lang="ts">
import VChart from 'vue-echarts'
import { ENT_THEME } from './echartsTheme'

withDefaults(
  defineProps<{
    option: Record<string, any>
    height?: string
  }>(),
  { height: '320px' },
)
</script>

<template>
  <div class="chart-box" :style="{ height }">
    <VChart :option="option" :theme="ENT_THEME" autoresize />
  </div>
</template>

<style scoped>
.chart-box { width: 100%; }
.chart-box :deep(.echarts) { width: 100%; height: 100%; }
</style>
