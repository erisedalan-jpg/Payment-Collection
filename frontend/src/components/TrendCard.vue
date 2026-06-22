<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { payMonthlyTrend, payQuarterlyTrend } from '@/lib/payDashboard'
import PendingBarChart from './PendingBarChart.vue'
import SegToggle from './SegToggle.vue'

const filter = useFilterStore()
const period = ref('month')
const PERIOD_OPTS = [
  { value: 'month', label: '月度' },
  { value: 'quarter', label: '季度' },
]

const series = computed(() =>
  period.value === 'month'
    ? payMonthlyTrend(filter.filteredPayNodes, filter.dateStart, filter.dateEnd)
    : payQuarterlyTrend(filter.filteredPayNodes, filter.dateStart, filter.dateEnd),
)
</script>

<template>
  <div class="trend-card">
    <div class="tc-head">
      <h3 class="tc-title">待回款金额</h3>
      <SegToggle v-model="period" :options="PERIOD_OPTS" />
    </div>
    <PendingBarChart :categories="series.categories" :series="series.series" />
  </div>
</template>

<style scoped>
.trend-card { }
.tc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.tc-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
</style>
