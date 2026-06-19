<script setup lang="ts">
import { computed } from 'vue'
import ChartBox from '@/charts/ChartBox.vue'
import type { PeriodSeries } from '@/lib/payDashboard'

const props = defineProps<{
  categories: string[]
  series: PeriodSeries['series']
  height?: string
}>()

const COLORS = ['#c8161d', '#f9d46c', '#6ecc54']

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
  <div class="pbc-scroll">
    <div
      class="pbc-inner"
      :style="{ minWidth: `max(100%, ${Math.max(props.categories.length, 1) * 48}px)` }"
    >
      <ChartBox :option="option" :height="height || '300px'" />
    </div>
  </div>
</template>

<style scoped>
/* 横向滑动容器：桶多时整体变宽，左右滑动 */
.pbc-scroll {
  overflow-x: auto;
}
/* 内层随 min-width 撑开，ChartBox width:100% 跟随此宽度 */
.pbc-inner {
  height: 100%;
}
</style>
