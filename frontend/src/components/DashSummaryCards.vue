<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { computeDashboardSummary } from '@/lib/dashboardStats'
import { fmtWan, pct } from '@/lib/format'

const data = useDataStore()
const filter = useFilterStore()

const summary = computed(() =>
  computeDashboardSummary(filter.filteredNodes, data.data?.projectOverview?.projects ?? [], {
    naguanOn: filter.naguanOn,
    naguanExclude: (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
    viewMode: filter.viewMode,
    viewL4: filter.viewL4,
    viewPM: filter.viewPM,
  }),
)

const cards = computed(() => {
  const s = summary.value
  return [
    { label: '回款节点数 / 项目总数', value: `${s.relatedNodeCount} / ${s.totalProjects}`, cls: 'c-primary' },
    { label: '计划回款总金额(万)', value: fmtWan(s.totalExpected), cls: 'c-blue' },
    { label: '已回款总合计(万)', value: fmtWan(s.totalActual), cls: 'c-green' },
    { label: '待回款总金额(万)', value: fmtWan(s.totalRemaining), cls: 'c-red' },
    { label: '总完成率', value: pct(s.rate), cls: s.rate >= 0.8 ? 'c-green' : s.rate >= 0.5 ? 'c-orange' : 'c-red' },
  ]
})
</script>

<template>
  <div class="dash-summary">
    <div v-for="c in cards" :key="c.label" class="ds-card">
      <div class="ds-value" :class="c.cls">{{ c.value }}</div>
      <div class="ds-label">{{ c.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.dash-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding: 16px; }
.ds-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
.ds-value { font-size: 22px; font-weight: 700; }
.ds-label { font-size: 12px; color: #64748b; margin-top: 4px; }
.c-primary { color: #4f46e5; } .c-blue { color: #2563eb; } .c-green { color: #10b981; }
.c-orange { color: #f59e0b; } .c-red { color: #ef4444; }
</style>
