<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import type { Project, ProjectPmis } from '@/types/analysis'
import {
  buildInsightRows, groupInsight, insightCross, insightPivot,
  INSIGHT_DIMENSIONS, INSIGHT_METRICS, INSIGHT_METRIC_BY_KEY, INSIGHT_DIM_BY_KEY,
  type InsightGroup, type InsightMetricKey,
} from '@/lib/projectPivot'
import { fmtWan, pct } from '@/lib/format'
import SegToggle from '@/components/SegToggle.vue'
import DimPicker from '@/components/DimPicker.vue'
import ChartBox from '@/charts/ChartBox.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import BoardMatrix from '@/components/BoardMatrix.vue'
import PivotTable from '@/components/PivotTable.vue'
import InsightDrillModal from '@/components/InsightDrillModal.vue'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() =>
  buildInsightRows(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
  ),
)

const MODES = [
  { value: 'rank', label: '排名' },
  { value: 'cross', label: '交叉' },
  { value: 'pivot', label: '透视' },
]
const mode = ref('rank')
const DIM_OPTS = INSIGHT_DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))
const METRIC_OPTS = INSIGHT_METRICS.map((m) => ({ value: m.key, label: m.label }))
const dimKey = ref('stage')
const secondDim = ref('')
const metricKey = ref<InsightMetricKey>('projectCount')
const rowDims = ref<string[]>(['stage'])
const colDims = ref<string[]>([])

const metricFormat = computed(() => {
  const kind = INSIGHT_METRIC_BY_KEY[metricKey.value].kind
  return (v: number) => (kind === 'money' ? fmtWan(v) : kind === 'rate' ? pct(v) : String(v))
})

// ---- 排名 ----
const groups = computed(() => {
  const gs = groupInsight(rows.value, [dimKey.value])
  const k = metricKey.value
  return [...gs].sort((a, b) => ((b[k] ?? 0) as number) - ((a[k] ?? 0) as number))
})
const top = computed(() => groups.value.slice(0, 15))
const chartOption = computed(() => {
  const kind = INSIGHT_METRIC_BY_KEY[metricKey.value].kind
  const div = kind === 'money' ? 10000 : 1
  const label = INSIGHT_METRIC_BY_KEY[metricKey.value].label
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 20, top: 30, bottom: 60 },
    xAxis: { type: 'category', data: top.value.map((g) => g.key), axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: kind === 'money' ? `${label}(万)` : label },
    series: [{ name: label, type: 'bar', data: top.value.map((g) => +(((g[metricKey.value] ?? 0) as number) / div).toFixed(4)) }],
  }
})
const RANK_COLS = computed<DataColumn[]>(() => [
  { key: 'key', label: INSIGHT_DIM_BY_KEY[dimKey.value]?.label ?? '维度' },
  { key: 'projectCount', label: '项目数', width: 80, sortable: true },
  { key: 'contractAmount', label: '合同总额(万)', width: 110, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'avgProgress', label: '平均完工', width: 90, formatter: (v) => (v == null ? '-' : pct(v)) },
  { key: 'avgCostRatio', label: '平均消耗比', width: 100, formatter: (v) => (v == null ? '-' : pct(v)) },
  { key: 'paymentRatio', label: '回款完成率', width: 100, formatter: (v) => (v == null ? '-' : pct(v)) },
  { key: 'delayedProjects', label: '延期项目', width: 90, sortable: true },
])

// ---- 交叉 ----
const SECOND_OPTS = computed(() => DIM_OPTS.filter((o) => o.value !== dimKey.value))
const matrix = computed(() =>
  mode.value === 'cross' && secondDim.value
    ? insightCross(rows.value, dimKey.value, secondDim.value, metricKey.value)
    : null,
)

// ---- 透视 ----
const pivot = computed(() =>
  mode.value === 'pivot' && rowDims.value.length
    ? insightPivot(rows.value, rowDims.value, colDims.value, metricKey.value)
    : null,
)

// ---- 下钻 ----
const drillOpen = ref(false)
const drillTitle = ref('')
const drillGroup = ref<InsightGroup | null>(null)
function openDrill(g: InsightGroup | undefined | null, title?: string) {
  if (!g) return
  drillGroup.value = g
  drillTitle.value = title ?? g.key
  drillOpen.value = true
}
function onRankRow(row: Record<string, any>) {
  openDrill(groups.value.find((g) => g.key === row.key))
}
function onCellClick(p: { row: string; col: string }) {
  openDrill(matrix.value?.index[p.row]?.[p.col] as InsightGroup | undefined, `${p.row} / ${p.col}`)
}
function onPivotCell(p: { rowKey: string; colKey: string }) {
  openDrill(pivot.value?.index[p.rowKey]?.[p.colKey] as InsightGroup | undefined, `${p.rowKey}${p.colKey ? ' / ' + p.colKey : ''}`)
}
</script>

<template>
  <div class="insight-view">
    <h2 class="iv-title">项目分析</h2>

    <div class="iv-toolbar">
      <SegToggle v-model="mode" :options="MODES" />
      <SegToggle v-if="mode !== 'pivot'" v-model="dimKey" :options="DIM_OPTS" />
      <el-select v-if="mode === 'cross'" v-model="secondDim" size="small" placeholder="选择次维度" style="width: 130px"
        :empty-values="['', null, undefined]" :value-on-clear="''" clearable>
        <el-option v-for="o in SECOND_OPTS" :key="o.value" :value="o.value" :label="o.label" />
      </el-select>
      <SegToggle v-model="metricKey" :options="METRIC_OPTS" />
    </div>

    <div v-if="mode === 'pivot'" class="iv-dims">
      <span class="iv-dims-label">行维度</span><DimPicker v-model="rowDims" :options="DIM_OPTS" />
      <span class="iv-dims-label">列维度</span><DimPicker v-model="colDims" :options="DIM_OPTS" />
    </div>

    <div v-if="!rows.length" class="iv-empty">暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>

    <template v-else>
      <template v-if="mode === 'rank'">
        <div class="iv-card"><ChartBox :option="chartOption" height="300px" /></div>
        <DataTable :columns="RANK_COLS" :rows="groups" clickable @row-click="onRankRow" />
      </template>

      <template v-else-if="mode === 'cross'">
        <div v-if="!secondDim" class="iv-hint">选择次维度后展示交叉矩阵。</div>
        <BoardMatrix v-else-if="matrix" :matrix="matrix"
          :row-label="INSIGHT_DIM_BY_KEY[dimKey]?.label ?? ''"
          :col-label="INSIGHT_DIM_BY_KEY[secondDim]?.label ?? ''"
          :format="metricFormat" @cell-click="onCellClick" />
      </template>

      <template v-else>
        <div v-if="!rowDims.length" class="iv-hint">选择至少一个行维度。</div>
        <PivotTable v-else-if="pivot" :pivot="pivot" :format="metricFormat" @cell-click="onPivotCell" />
      </template>
    </template>

    <InsightDrillModal v-model="drillOpen" :title="drillTitle" :rows="drillGroup?.rows ?? []" />
  </div>
</template>

<style scoped>
.insight-view { padding: 16px; }
.iv-title { font-size: 18px; font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.iv-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.iv-dims { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.iv-dims-label { font-size: 12px; color: var(--sub); font-weight: 600; }
.iv-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 10px; margin-bottom: 12px; }
.iv-hint { font-size: 13px; color: var(--mut); padding: 24px 0; text-align: center; }
.iv-empty { color: var(--mut); padding: 40px 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
</style>
