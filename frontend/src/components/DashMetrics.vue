<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { payDashSummary } from '@/lib/payDashboard'
import { fmtWan, pct } from '@/lib/format'

const data = useDataStore()
const filter = useFilterStore()

const summary = computed(() =>
  payDashSummary(
    filter.filteredPayNodes,
    data.data?.projects ?? [],
    { excludeActive: filter.excludeOn, excludedIds: filter.excludedIds, viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM },
    filter.payRecordsAll,
    data.data?.paymentNodes,
    filter.dateStart,
    filter.dateEnd,
  ),
)

const metrics = computed(() => {
  const s = summary.value
  return [
    { k: '项目数', v: String(s.totalProjects), cls: '' },
    { k: '回款节点数', v: String(s.relatedNodeCount), cls: '' },
    { k: '已回款(万)', v: fmtWan(s.totalActual), cls: 'paid' },
    { k: '待回款(万)', v: fmtWan(s.totalRemaining), cls: 'remain' },
    { k: '完成率', v: pct(s.rate), cls: s.rate >= 0.8 ? 'paid' : s.rate >= 0.5 ? 'pending' : 'danger' },
    { k: '延期项目数', v: String(s.delayedProjects), cls: 'danger' },
  ]
})
</script>

<template>
  <div class="dash-metrics u-grid-auto">
    <div v-for="m in metrics" :key="m.k" class="dm-card">
      <div class="dm-k">{{ m.k }}</div>
      <div class="dm-v" :class="m.cls">{{ m.v }}</div>
    </div>
  </div>
</template>

<style scoped>
.dash-metrics { --col-min: 130px; }
.dm-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.dm-k { font-size: var(--fs-1); color: var(--mut); }
.dm-v { font-size: var(--fs-5); font-weight: 800; margin-top: 4px; color: var(--txt); }
.dm-v.paid { color: var(--c-paid); }
.dm-v.remain { color: var(--c-remaining); }
.dm-v.pending { color: var(--c-pending); }
.dm-v.danger { color: var(--danger); }
</style>
