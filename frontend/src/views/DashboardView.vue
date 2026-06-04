<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import DashSummaryCards from '@/components/DashSummaryCards.vue'
import TierCards from '@/components/TierCards.vue'
import PendingBarChart from '@/components/PendingBarChart.vue'
import OrgRanking from '@/components/OrgRanking.vue'
import DelayedTop from '@/components/DelayedTop.vue'
import { aggregateQuarterly, aggregateMonthly } from '@/lib/dashboardCharts'

const data = useDataStore()
const filter = useFilterStore()
const quarterly = computed(() => aggregateQuarterly(filter.filteredNodes, filter.filterYear))
const monthly = computed(() => aggregateMonthly(filter.filteredNodes, filter.filterYear))
onMounted(() => {
  if (!data.data) data.load()
})
</script>

<template>
  <div class="dashboard">
    <p v-if="data.loading" class="dash-hint">加载中…</p>
    <p v-else-if="data.error" class="dash-hint error">数据加载失败：{{ data.error }}</p>
    <template v-else-if="data.data">
      <DashSummaryCards />
      <TierCards />
      <section class="dash-block">
        <h3 class="dash-block-title">季度待回款</h3>
        <PendingBarChart :categories="quarterly.categories" :series="quarterly.series" />
      </section>
      <section class="dash-block">
        <h3 class="dash-block-title">月度待回款</h3>
        <PendingBarChart :categories="monthly.categories" :series="monthly.series" />
      </section>
      <div class="dash-two-col">
        <section class="dash-block">
          <h3 class="dash-block-title">服务组回款达成排名</h3>
          <OrgRanking />
        </section>
        <section class="dash-block">
          <h3 class="dash-block-title" style="color:#ef4444">延期项目 Top10</h3>
          <DelayedTop />
        </section>
      </div>
    </template>
    <p v-else class="dash-hint">暂无数据，请先在数据管理中同步/导入。</p>
  </div>
</template>

<style scoped>
.dashboard { min-height: 100%; }
.dash-hint { padding: 24px; color: #64748b; }
.dash-hint.error { color: #ef4444; }
.dash-block { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 16px 12px; padding: 12px 16px; }
.dash-block-title { font-size: 14px; font-weight: 600; color: #0f172a; margin: 0 0 8px; }
.dash-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 900px) { .dash-two-col { grid-template-columns: 1fr; } }
</style>
