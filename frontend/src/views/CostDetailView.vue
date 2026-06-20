<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildCostRows, costKpis, costL4Dist, costL4Summary } from '@/lib/costAnalysis'
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'
import MetricGrid from '@/components/MetricGrid.vue'
import ChartBox from '@/charts/ChartBox.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'

const data = useDataStore()
const settings = useSettingsStore()
onMounted(() => { if (!data.data) data.load() })

const sc = computed(() => (settings.theme === 'dark' ? STATUS_DARK : STATUS_LIGHT))
const rows = computed(() => buildCostRows(
  (data.data?.projects ?? []) as Project[],
  (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
))

const kpi = computed(() => costKpis(rows.value))
const kpiItems = computed(() => {
  const k = kpi.value
  return [
    { k: '成本统计项目数', v: String(k.total) },
    { k: '未超支', v: String(k.normal), cls: 'ok' },
    { k: '超支不足5K', v: String(k.under5k), cls: 'warn' },
    { k: '超支大于5K', v: String(k.over5k), cls: 'danger' },
  ]
})

const dist = computed(() => costL4Dist(rows.value))
const distOption = computed(() => {
  const d = dist.value, s = sc.value
  const lbl = { show: true, formatter: (p: any) => p.value || '' }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['超支不足5k', '超支大于5k'], bottom: 0 },
    grid: { left: 40, right: 20, top: 10, bottom: 50 },
    xAxis: { type: 'category', data: d.map((x) => x.orgL4), axisLabel: { interval: 0, rotate: d.length > 6 ? 30 : 0, fontSize: 11 } },
    yAxis: { type: 'value', name: '超支项目数' },
    series: [
      { name: '超支不足5k', type: 'bar', stack: 't', color: s.warn, label: lbl, data: d.map((x) => x.under5k) },
      { name: '超支大于5k', type: 'bar', stack: 't', color: s.danger, label: lbl, data: d.map((x) => x.over5k) },
    ],
  }
})

const l4Rows = computed(() => costL4Summary(rows.value))
const L4_COLS: DataColumn[] = [
  { key: 'orgL4', label: 'L4部门', width: 140 },
  { key: 'total', label: '项目总数', width: 90, num: true },
  { key: 'normal', label: '未超支', width: 90, num: true },
  { key: 'under5k', label: '超支不足5k', width: 110, num: true },
  { key: 'over5k', label: '超支大于5k', width: 110, num: true },
  { key: 'over5kRatio', label: '超支占比', width: 100, num: true, formatter: (v) => v + '%' },
]
</script>

<template>
  <div class="cd-view">
    <h2 class="cd-title">成本分析</h2>

    <div v-if="!rows.length" class="cd-empty">暂无主域成本数据——请在「数据管理」提供 PMIS 文件后点「更新数据」。</div>

    <template v-else>
      <MetricGrid :items="kpiItems" :col-min="'160px'" />
      <div class="cd-grid2">
        <div class="cd-card"><div class="cd-card-h">超支项目分布(按 L4,剔 XS)</div><ChartBox :option="distOption" height="260px" /></div>
        <div class="cd-card"><div class="cd-card-h">L4 部门成本情况汇总</div><DataTable :columns="L4_COLS" :rows="l4Rows" :show-count="false">
          <template #cell-over5kRatio="{ row, value }"><span class="u-num" :class="row.over5k > 0 ? 'cd-red' : 'cd-green'">{{ value }}</span></template>
        </DataTable></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cd-view { padding: var(--sp-4); }
.cd-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.cd-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: var(--gap-card); }
.cd-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3); margin-bottom: var(--sp-3); }
.cd-card-h { font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-2); }
.cd-red { color: var(--danger); font-weight: 600; }
.cd-green { color: var(--ok); }
.cd-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
</style>
