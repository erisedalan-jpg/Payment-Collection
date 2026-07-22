<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDataStore } from '@/stores/data'
import { useScopedProjects } from '@/composables/useScopedData'
import { useProjectTagsStore } from '@/stores/projectTags'
import type { Project, ProjectPmis } from '@/types/analysis'
import {
  buildInsightRows, groupInsight, insightCross, insightPivot,
  INSIGHT_DIMENSIONS, INSIGHT_METRICS, INSIGHT_METRIC_BY_KEY, INSIGHT_DIM_BY_KEY,
  type InsightGroup, type InsightMetricKey,
} from '@/lib/projectPivot'
import { fmtWan, pct } from '@/lib/format'
import { buildRankingOption, valueKindForPie, type ValueKind } from '@/lib/chartOptions'
import { tagMatch } from '@/lib/tagFilter'
import SegToggle from '@/components/SegToggle.vue'
import ChartTypeSelector from '@/components/ChartTypeSelector.vue'
import DimPicker from '@/components/DimPicker.vue'
import ChartBox from '@/charts/ChartBox.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import BoardMatrix from '@/components/BoardMatrix.vue'
import PivotTable from '@/components/PivotTable.vue'
import InsightDrillModal from '@/components/InsightDrillModal.vue'
import TagFilterSelect from '@/components/TagFilterSelect.vue'

const data = useDataStore()
const scoped = useScopedProjects()
const projectTags = useProjectTagsStore()
onMounted(() => {
  if (!data.data) data.load()
  if (!projectTags.loaded) projectTags.load()
})

const selectedTags = ref<string[]>([])

const rows = computed(() => {
  const ps = ((scoped.value?.projects ?? []) as Project[])
    .filter((p) => tagMatch(projectTags.tagsOf(p.projectId), selectedTags.value))
  return buildInsightRows(ps, (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)
})

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
  // NaN=桶存在但 rate 指标无数据(lib cellVal 标记),显 '-' 与排名表/下钻一致,区别于真实 0%
  return (v: number) => (Number.isNaN(v) ? '-' : kind === 'money' ? fmtWan(v) : kind === 'rate' ? pct(v) : String(v))
})

// ---- 排名 ----
const groups = computed(() => {
  const gs = groupInsight(rows.value, [dimKey.value])
  const k = metricKey.value
  return [...gs].sort((a, b) => ((b[k] ?? 0) as number) - ((a[k] ?? 0) as number))
})
const top = computed(() => groups.value.slice(0, 15))

// 图表类型多选（排名模式）
const chartTypes = ref<string[]>(['bar'])

// 当前指标的 valueKind（chartOptions 的类型）
const currentValueKind = computed((): ValueKind => {
  const kind = INSIGHT_METRIC_BY_KEY[metricKey.value].kind
  if (kind === 'money') return 'amount'
  if (kind === 'rate') return 'ratio'
  return 'count'
})

// available：ratio 类指标不含 pie
const availableChartTypes = computed<string[]>(() =>
  valueKindForPie(currentValueKind.value) ? ['bar', 'line', 'pie'] : ['bar', 'line'],
)

// 指标切换时若 chartTypes 含 pie 但新指标不支持 pie，自动移除
watch(metricKey, () => {
  if (!valueKindForPie(currentValueKind.value) && chartTypes.value.includes('pie')) {
    const next = chartTypes.value.filter((t) => t !== 'pie')
    chartTypes.value = next.length ? next : ['bar']
  }
})

// 按选中图表类型构造各 option（排名，Top15）
const rankingChartOptions = computed(() => {
  const cats = top.value.map((g) => g.key)
  // amount 类型 buildRankingOption 会自行除万；ratio/count 不除
  const vals = top.value.map((g) => (g[metricKey.value] ?? 0) as number)
  const label = INSIGHT_METRIC_BY_KEY[metricKey.value].label
  return chartTypes.value.map((t) =>
    buildRankingOption(t as 'bar' | 'line' | 'pie', {
      categories: cats,
      values: vals,
      metricLabel: label,
      valueKind: currentValueKind.value,
    }),
  )
})
const RANK_COLS = computed<DataColumn[]>(() => [
  { key: 'key', label: INSIGHT_DIM_BY_KEY[dimKey.value]?.label ?? '维度' },
  { key: 'projectCount', label: '项目数', width: 80, sortable: true },
  { key: 'contractAmount', label: '合同总额(万)', width: 110, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'avgProgress', label: '平均完工', width: 90, formatter: (v) => (v == null ? '-' : pct(v)) },
  { key: 'avgCostRatio', label: '平均消耗比', width: 100, formatter: (v) => (v == null ? '-' : pct(v)) },
  { key: 'paymentRatio', label: '回款完成率', width: 100, formatter: (v) => (v == null ? '-' : pct(v)) },
  { key: 'delayedProjects', label: '延期项目数', width: 90, sortable: true },
])

// ---- 交叉 ----
// 次维同为点击选择(P5.5 用户反馈,弃下拉);「无」=不交叉;主维变更若与次维撞车则复位
const SECOND_OPTS = computed(() => [{ value: '', label: '无' }, ...DIM_OPTS.filter((o) => o.value !== dimKey.value)])
watch(dimKey, () => { if (secondDim.value === dimKey.value) secondDim.value = '' })
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

defineExpose({ selectedTags })
</script>

<template>
  <div class="insight-view">
    <h2 class="iv-title">项目分析</h2>

    <div class="iv-toolbar">
      <SegToggle v-model="mode" :options="MODES" />
      <SegToggle v-if="mode !== 'pivot'" v-model="dimKey" :options="DIM_OPTS" />
      <SegToggle v-model="metricKey" :options="METRIC_OPTS" />
      <TagFilterSelect v-model="selectedTags" />
    </div>
    <div v-if="mode === 'cross'" class="iv-toolbar">
      <span class="iv-dims-label">次维度</span>
      <SegToggle v-model="secondDim" :options="SECOND_OPTS" />
    </div>

    <div v-if="mode === 'pivot'" class="iv-dims">
      <span class="iv-dims-label">行维度</span><DimPicker v-model="rowDims" :options="DIM_OPTS" />
      <span class="iv-dims-label">列维度</span><DimPicker v-model="colDims" :options="DIM_OPTS" />
    </div>

    <div v-if="!rows.length" class="iv-empty">{{ (data.data?.projects?.length && selectedTags.length) ? '无匹配所选标签的项目。' : '暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。' }}</div>

    <template v-else>
      <template v-if="mode === 'rank'">
        <div class="iv-rank-controls">
          <span class="iv-dims-label">图表类型</span>
          <ChartTypeSelector v-model="chartTypes" :available="availableChartTypes" />
        </div>
        <div class="iv-charts-row">
          <div
            v-for="(opt, idx) in rankingChartOptions"
            :key="chartTypes[idx]"
            class="iv-card iv-chart-item"
          >
            <ChartBox :option="opt" height="300px" />
          </div>
        </div>
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
.insight-view { padding: var(--sp-4); }
.iv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.iv-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.iv-dims { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.iv-dims-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.iv-rank-controls { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.iv-charts-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); margin-bottom: var(--sp-3); }
.iv-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3); margin-bottom: var(--sp-3); }
.iv-chart-item { flex: 1 1 400px; min-width: 300px; margin-bottom: 0; }
.iv-hint { font-size: var(--fs-2); color: var(--mut); padding: var(--sp-5) 0; text-align: center; }
.iv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
</style>
