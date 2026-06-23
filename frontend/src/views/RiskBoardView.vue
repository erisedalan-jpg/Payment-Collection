<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import type { Project, ProjectPmis } from '@/types/analysis'
import {
  buildRiskRows, riskSummary, groupRisk, riskOverview,
  RISK_DIMENSIONS, RISK_METRICS, type RiskMetricKey, type RiskDimDef,
} from '@/lib/riskBoard'
import { fmtWan, pct } from '@/lib/format'
import { buildRankingOption, type ValueKind } from '@/lib/chartOptions'
import SegToggle from '@/components/SegToggle.vue'
import ChartTypeSelector from '@/components/ChartTypeSelector.vue'
import ChartBox from '@/charts/ChartBox.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() =>
  buildRiskRows(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
  ),
)
const summary = computed(() => riskSummary(rows.value))

const ratioText = (n: number, d: number): string => (d > 0 ? pct(n / d) : '-')
const cards = computed(() => {
  const s = summary.value
  return [
    { k: '项目健康度', main: s.healthPct == null ? '-' : pct(s.healthPct), sub: `无风险 ${s.noRisk} / 全量 ${s.total}`, tone: 'ok' },
    { k: '高风险项目', main: `${s.high} 个`, sub: `占比 ${ratioText(s.high, s.hasRisk)}`, tone: 'danger' },
    { k: '中风险项目', main: `${s.mid} 个`, sub: `占比 ${ratioText(s.mid, s.hasRisk)}`, tone: 'warn' },
    { k: '低风险项目', main: `${s.low} 个`, sub: `占比 ${ratioText(s.low, s.hasRisk)}`, tone: 'advance' },
  ]
})

// ---- 风险统计分析(排名) ----
const DIM_OPTS = RISK_DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))
const METRIC_OPTS = RISK_METRICS.map((m) => ({ value: m.key, label: m.label }))
const dimKey = ref<RiskDimDef['key']>('riskLevel')
const metricKey = ref<RiskMetricKey>('projectCount')
const chartTypes = ref<string[]>(['bar'])

const metricDef = computed(() => RISK_METRICS.find((m) => m.key === metricKey.value)!)
const currentValueKind = computed<ValueKind>(() => (metricDef.value.kind === 'money' ? 'amount' : 'count'))

const groups = computed(() => {
  const gs = groupRisk(rows.value, dimKey.value)
  const k = metricKey.value
  return [...gs].sort((a, b) => (b[k] as number) - (a[k] as number))
})
const top = computed(() => groups.value.slice(0, 15))

const rankingChartOptions = computed(() =>
  chartTypes.value.map((t) =>
    buildRankingOption(t as 'bar' | 'pie', {
      categories: top.value.map((g) => g.key),
      values: top.value.map((g) => g[metricKey.value] as number),
      metricLabel: metricDef.value.label,
      valueKind: currentValueKind.value,
      legendCounts: top.value.map((g) => g.projectCount),
    }),
  ),
)
const RANK_COLS = computed<DataColumn[]>(() => [
  { key: 'key', label: RISK_DIMENSIONS.find((d) => d.key === dimKey.value)?.label ?? '维度' },
  { key: 'projectCount', label: '项目数', width: 80, sortable: true, num: true },
  { key: 'hasRiskCount', label: '有风险项目数', width: 120, sortable: true, num: true },
  { key: 'openRiskSum', label: '未关闭风险数', width: 120, sortable: true, num: true },
  { key: 'contractAmount', label: '合同总额(万)', width: 120, sortable: true, num: true, formatter: (v) => fmtWan(v as number) },
])

// ---- 风险概览(透视表) ----
const OVERVIEW_DIM_OPTS = RISK_DIMENSIONS.filter((d) => d.key !== 'riskLevel').map((d) => ({ value: d.key, label: d.label }))
const overviewDim = ref<RiskDimDef['key']>('orgL4')
const overviewRows = computed(() => riskOverview(rows.value, overviewDim.value))
const OVERVIEW_COLS = computed<DataColumn[]>(() => [
  { key: 'key', label: RISK_DIMENSIONS.find((d) => d.key === overviewDim.value)?.label ?? '维度' },
  { key: '高', label: '高', width: 70, sortable: true, num: true },
  { key: '中', label: '中', width: 70, sortable: true, num: true },
  { key: '低', label: '低', width: 70, sortable: true, num: true },
  { key: '无风险', label: '无风险', width: 80, sortable: true, num: true },
  { key: 'total', label: '合计', width: 80, sortable: true, num: true },
  { key: 'healthPct', label: '健康度%', width: 90, num: true, formatter: (v) => (v == null ? '-' : pct(v as number)) },
])
</script>

<template>
  <div class="risk-view">
    <h2 class="rv-title">风险看板</h2>

    <div v-if="!rows.length" class="rv-empty">暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>

    <template v-else>
      <div class="rv-cards">
        <div v-for="c in cards" :key="c.k" class="rv-card">
          <div class="rv-card-k">{{ c.k }}</div>
          <div class="rv-card-main u-num" :class="'rv-main-' + c.tone">{{ c.main }}</div>
          <div class="rv-card-sub u-num">{{ c.sub }}</div>
        </div>
      </div>

      <h3 class="rv-h3">风险统计分析</h3>
      <div class="rv-toolbar">
        <span class="rv-label">维度</span><SegToggle v-model="dimKey" :options="DIM_OPTS" />
        <span class="rv-label">统计</span><SegToggle v-model="metricKey" :options="METRIC_OPTS" />
        <span class="rv-label">图表类型</span><ChartTypeSelector v-model="chartTypes" :available="['bar', 'pie']" />
      </div>
      <div class="rv-charts-row">
        <div v-for="(opt, idx) in rankingChartOptions" :key="chartTypes[idx]" class="rv-chart-item">
          <ChartBox :option="opt" height="300px" />
        </div>
      </div>
      <DataTable :columns="RANK_COLS" :rows="groups" />

      <h3 class="rv-h3">风险概览</h3>
      <div class="rv-toolbar">
        <span class="rv-label">行维度</span><SegToggle v-model="overviewDim" :options="OVERVIEW_DIM_OPTS" />
      </div>
      <DataTable :columns="OVERVIEW_COLS" :rows="overviewRows" />
    </template>
  </div>
</template>

<style scoped>
.risk-view { padding: var(--sp-4); }
.rv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.rv-h3 { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: var(--sp-5) 0 var(--sp-3); }
.rv-cards { display: flex; flex-wrap: wrap; gap: var(--gap-card); margin-bottom: var(--sp-3); }
.rv-card { flex: 1 1 200px; min-width: 180px; background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r-md); padding: var(--card-pad); display: flex; flex-direction: column; gap: var(--gap-stack); }
.rv-card-k { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.rv-card-main { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.rv-card-sub { font-size: var(--fs-2); color: var(--mut); }
.rv-main-ok { color: var(--ok-text); }
.rv-main-danger { color: var(--danger); }
.rv-main-warn { color: var(--warn-text); }
.rv-main-advance { color: var(--c-advance); }
.rv-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.rv-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.rv-charts-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); margin-bottom: var(--sp-3); }
.rv-chart-item { flex: 1 1 400px; min-width: 300px; background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r-md); padding: var(--sp-3); }
.rv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card);
  border: 1px solid var(--line); border-radius: var(--r-md); }
</style>
