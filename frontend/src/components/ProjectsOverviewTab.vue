<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { filterOverviewProjects, projectsOverviewSummary, type OverviewProject } from '@/lib/projectsOverview'
import { formatCellValue } from '@/lib/cellFormat'
import { fmtWan, pct } from '@/lib/format'

const props = defineProps<{ tier: string }>()
const data = useDataStore()
const filter = useFilterStore()

const displayProjects = computed<OverviewProject[]>(() =>
  filterOverviewProjects(
    (data.data?.projectOverview?.projects ?? []) as OverviewProject[],
    props.tier,
    filter.naguanOn,
    (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
  ),
)

const summary = computed(() => projectsOverviewSummary(displayProjects.value, filter.filteredNodes))

const columns = computed<DataColumn[]>(() => {
  const cols = (data.data?.projectOverview?.columns ?? []) as Record<string, any>[]
  return cols
    .filter((c) => c.visible !== false)
    .map((c) => ({
      key: c.key as string,
      label: c.label as string,
      formatter: (value: unknown) => formatCellValue(value, c.key as string),
    }))
})

const rateColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444')
</script>

<template>
  <div class="projects-tab">
    <div class="summary-bar">
      <div class="sb-item"><div class="sb-label">项目总数</div><div class="sb-val">{{ summary.projectCount }}</div></div>
      <div class="sb-item"><div class="sb-label">已回款总金额(万)</div><div class="sb-val green">{{ fmtWan(summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">待回款总金额(万)</div><div class="sb-val red">{{ fmtWan(summary.totalRemaining) }}</div></div>
      <div class="sb-item"><div class="sb-label">完成率</div><div class="sb-val" :style="{ color: rateColor(summary.rate) }">{{ pct(summary.rate) }}</div></div>
      <div class="sb-item"><div class="sb-label">加资源可提前</div><div class="sb-val primary">{{ summary.adv }}</div></div>
      <div class="sb-item"><div class="sb-label">达到回款条件</div><div class="sb-val orange">{{ summary.reached }}</div></div>
      <div class="sb-item"><div class="sb-label">延期</div><div class="sb-val red">{{ summary.delayed }}</div></div>
    </div>
    <DataTable :columns="columns" :rows="displayProjects" />
  </div>
</template>

<style scoped>
.projects-tab { padding: 12px 0; }
.summary-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; padding: 0 16px 12px; }
.sb-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
.sb-label { font-size: 12px; color: #64748b; }
.sb-val { font-size: 18px; font-weight: 700; color: #0f172a; }
.sb-val.green { color: #10b981; } .sb-val.red { color: #ef4444; } .sb-val.orange { color: #f59e0b; } .sb-val.primary { color: #4f46e5; }
</style>
