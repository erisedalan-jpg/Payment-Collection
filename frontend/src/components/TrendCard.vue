<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePaymentFilterStore } from '@/stores/paymentFilter'
import { payMonthlyTrend, payQuarterlyTrend } from '@/lib/payDashboard'
import PendingBarChart from './PendingBarChart.vue'
import SegToggle from './SegToggle.vue'
import SectionTitle from '@/components/SectionTitle.vue'

const filter = usePaymentFilterStore()
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
      <SectionTitle>待回款金额</SectionTitle>
      <SegToggle v-model="period" :options="PERIOD_OPTS" />
    </div>
    <PendingBarChart :categories="series.categories" :series="series.series" />
  </div>
</template>

<style scoped>
.trend-card { }
.tc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
</style>
