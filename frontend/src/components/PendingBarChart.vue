<script setup lang="ts">
import { computed } from 'vue'
import ChartBox from '@/charts/ChartBox.vue'
import type { PeriodSeries } from '@/lib/payDashboard'

const props = defineProps<{
  categories: string[]
  series: PeriodSeries['series']
  height?: string
}>()

const COLORS = ['#EF4444', '#F59E0B', '#10B981']

const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 60, right: 25, top: 25, bottom: 25 },
  xAxis: { type: 'category', data: props.categories },
  yAxis: { type: 'value', name: '金额(万)' },
  series: props.series.map((s, i) => ({
    name: s.tier,
    type: 'bar',
    stack: 'a',
    data: s.data,
    itemStyle: { color: COLORS[i % COLORS.length] },
  })),
}))
</script>

<template>
  <ChartBox :option="option" :height="height || '300px'" />
</template>
