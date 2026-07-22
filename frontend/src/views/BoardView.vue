<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useScopedProjects } from '@/composables/useScopedData'
import { useFilterStore } from '@/stores/filter'
import { useSettingsStore } from '@/stores/settings'
import { useProjectTagsStore } from '@/stores/projectTags'
import { CHART_LIGHT, CHART_DARK } from '@/charts/echartsTheme'
import {
  PAY_BOARD_DIMENSIONS as DIMENSIONS, PAY_BOARD_METRICS as METRICS, PAY_BOARD_METRIC_BY_KEY as METRIC_BY_KEY,
  buildPayBoardRows, groupPayBoard, payBoardCross, payBoardPivot, type PayBoardGroup,
  sortPayBoardGroups, PAY_BOARD_SORTS, type PayBoardSortKey,
} from '@/lib/paymentBoard'
import { filterProjects, rateColorPmis } from '@/lib/paymentPmis'
import { fmtWan, fmtRatio, pct } from '@/lib/format'
import { buildRankingOption, valueKindForPie, type ValueKind } from '@/lib/chartOptions'
import ChartBox from '@/charts/ChartBox.vue'
import SegToggle from '@/components/SegToggle.vue'
import ChartTypeSelector from '@/components/ChartTypeSelector.vue'
import DimPicker from '@/components/DimPicker.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import BoardMatrix from '@/components/BoardMatrix.vue'
import PivotTable from '@/components/PivotTable.vue'
import BoardDrilldownModal from '@/components/BoardDrilldownModal.vue'

const route = useRoute()
const data = useDataStore()
const scoped = useScopedProjects()
const filter = useFilterStore()
const settings = useSettingsStore()
const projectTags = useProjectTagsStore()
onMounted(() => { if (!projectTags.loaded) projectTags.load() })

const DIM_OPTS = DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))
const METRIC_OPTS = METRICS.map((m) => ({ value: m.key, label: m.label }))
const MODE_OPTS = [
  { value: 'single', label: '排名' },
  { value: 'cross', label: '交叉' },
  { value: 'pivot', label: '透视' },
]

const rawDim = typeof route.query.dim === 'string' ? route.query.dim : ''
const aliasDim = rawDim === 'orgL4' ? 'dept' : rawDim
const initDim = DIMENSIONS.some((d) => d.key === aliasDim) ? aliasDim : 'dept'

const mode = ref('single')
const dimKey = ref(initDim)
const secondDim = ref('')
const metricKey = ref<(typeof METRICS)[number]['key']>('contractSum')
const rowDims = ref<string[]>([initDim])
const colDims = ref<string[]>([])

const sortKey = ref<PayBoardSortKey>('projectCount')
const SORT_OPTS = PAY_BOARD_SORTS.map((s) => ({ value: s.key, label: s.label }))

const boardRows = computed(() =>
  buildPayBoardRows(
    filterProjects(scoped.value?.projects ?? [], {
      viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
      excludeActive: filter.excludeOn, excludedIds: filter.excludedIds,
    }),
    data.data?.projectPmis ?? {},
    scoped.value?.paymentNodes,
    filter.payRecordsAll,
    filter.dateStart,
    filter.dateEnd,
    projectTags.effectiveAssignments,
  ),
)

const SECOND_OPTS = computed(() => [
  { value: '', label: '无' },
  ...DIMENSIONS.filter((d) => d.key !== dimKey.value).map((d) => ({ value: d.key, label: d.label })),
])

watch(dimKey, () => {
  if (secondDim.value === dimKey.value) secondDim.value = ''
})

// ---- 单维 ----
const groups = computed<PayBoardGroup[]>(() => groupPayBoard(boardRows.value, [dimKey.value]))
const sortedGroups = computed(() => sortPayBoardGroups(groups.value, sortKey.value))

const dimLabel = computed(() => DIM_OPTS.find((d) => d.value === dimKey.value)?.label ?? '维度')
const tableColumns = computed<DataColumn[]>(() => [
  { key: 'key', label: dimLabel.value },
  { key: 'projectCount', label: '项目数', sortable: true, num: true },
  { key: 'contractSum', label: '合同总额(万)', sortable: true, num: true, formatter: (v) => fmtWan(v) },
  { key: 'expectedSum', label: '计划回款(万)', sortable: true, num: true, formatter: (v) => fmtWan(v) },
  { key: 'rate', label: '完成率', sortable: true, num: true },
  { key: 'delayedNodeSum', label: '延期节点', sortable: true, num: true },
])

// 图表类型多选（单维排名模式）；available 始终含 bar/line/pie（contractSum 是金额）
const chartTypes = ref<string[]>(['bar'])

// 柱/折/饼：按当前排序键降序 Top15
const chartTop = computed(() => sortedGroups.value.slice(0, 15))

type SortChart = { label: string; kind: ValueKind; val: (g: PayBoardGroup) => number }
const SORT_CHART: Record<PayBoardSortKey, SortChart> = {
  projectCount:   { label: '项目数',   kind: 'count',  val: (g) => g.projectCount },
  contractSum:    { label: '合同金额', kind: 'amount', val: (g) => g.contractSum },
  rate:           { label: '完成率',   kind: 'ratio',  val: (g) => g.rate ?? 0 },
  delayedNodeSum: { label: '延期节点', kind: 'count',  val: (g) => g.delayedNodeSum },
}
const activeChart = computed(() => SORT_CHART[sortKey.value])
const pieRenderable = computed(() => valueKindForPie(activeChart.value.kind))
const chartPalette = computed(() => (settings.theme === 'dark' ? CHART_DARK : CHART_LIGHT))

function chartOptionForType(type: string) {
  const ac = activeChart.value
  return buildRankingOption(type as 'bar' | 'line' | 'pie', {
    categories: chartTop.value.map((g) => g.key),
    values: chartTop.value.map((g) => ac.val(g)),
    metricLabel: ac.label,
    valueKind: ac.kind,
    palette: chartPalette.value,
  })
}

// ---- 共用指标格式 ----
const metricKind = computed(() => METRIC_BY_KEY[metricKey.value].kind)
const metricFormat = computed(() => {
  const kind = metricKind.value
  return (v: number) => (kind === 'money' ? fmtWan(v) : kind === 'rate' ? pct(v) : String(v))
})

// ---- 交叉 ----
const matrix = computed(() =>
  mode.value === 'cross' && secondDim.value
    ? payBoardCross(boardRows.value, dimKey.value, secondDim.value, metricKey.value)
    : null,
)
const crossChartOption = computed(() => {
  const m = matrix.value
  if (!m || metricKind.value === 'rate') return null
  const rows = m.rows.slice(0, 15)
  const div = metricKind.value === 'money' ? 10000 : 1
  return {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 0 },
    grid: { left: 60, right: 20, top: 30, bottom: 70 },
    xAxis: { type: 'category', data: rows, axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: metricKind.value === 'money' ? '金额(万)' : '数量' },
    series: m.cols.map((cv) => ({
      name: cv,
      type: 'bar',
      stack: 'cross',
      data: rows.map((rv) => {
        const g = m.index[rv]?.[cv]
        return g ? +((g[metricKey.value] as number) / div).toFixed(2) : 0
      }),
      label: { show: true, position: 'inside' as const },
    })),
  }
})

// ---- 透视 ----
const pivot = computed(() =>
  mode.value === 'pivot' && rowDims.value.length
    ? payBoardPivot(boardRows.value, rowDims.value, colDims.value, metricKey.value)
    : null,
)

// ---- 下钻（共用） ----
const drillOpen = ref(false)
const drillGroup = ref<PayBoardGroup | null>(null)
function openDrill(g: PayBoardGroup) {
  drillGroup.value = g
  drillOpen.value = true
}
function onCellClick({ row, col }: { row: string; col: string }) {
  const g = matrix.value?.index[row]?.[col]
  if (g) openDrill(g)
}
function onPivotCellClick({ rowKey, colKey }: { rowKey: string; colKey: string }) {
  const g = pivot.value?.index[rowKey]?.[colKey]
  if (g) openDrill(g)
}
defineExpose({ drillOpen, dimKey, activeChart, pieRenderable })
</script>

<template>
  <div class="board-view">
    <p v-if="!data.data" class="bv-hint">暂无数据，请先在数据管理中同步/导入。</p>
    <template v-else>
      <div class="bv-toolbar">
        <div class="bv-ctl">
          <span class="bv-ctl-label">模式</span>
          <SegToggle v-model="mode" :options="MODE_OPTS" />
        </div>

        <template v-if="mode === 'single'">
          <div class="bv-ctl">
            <span class="bv-ctl-label">维度</span>
            <SegToggle v-model="dimKey" :options="DIM_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">排序</span>
            <SegToggle v-model="sortKey" :options="SORT_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">图表类型</span>
            <ChartTypeSelector v-model="chartTypes" :available="['bar', 'line', 'pie']" />
          </div>
        </template>

        <template v-else-if="mode === 'cross'">
          <div class="bv-ctl">
            <span class="bv-ctl-label">维度</span>
            <SegToggle v-model="dimKey" :options="DIM_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">次维度</span>
            <SegToggle v-model="secondDim" :options="SECOND_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">指标</span>
            <SegToggle v-model="metricKey" :options="METRIC_OPTS" />
          </div>
        </template>

        <template v-else>
          <div class="bv-ctl">
            <span class="bv-ctl-label">行维度</span>
            <DimPicker v-model="rowDims" :options="DIM_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">列维度</span>
            <DimPicker v-model="colDims" :options="DIM_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">指标</span>
            <SegToggle v-model="metricKey" :options="METRIC_OPTS" />
          </div>
        </template>
      </div>

      <!-- 单维 -->
      <template v-if="mode === 'single'">
        <div class="bv-charts-row">
          <section
            v-for="type in chartTypes"
            :key="type"
            class="bv-card bv-chart-item"
          >
            <h3 class="bv-title">{{ activeChart.label }}排名（Top {{ chartTop.length }}）</h3>
            <ChartBox v-if="type !== 'pie' || pieRenderable" :option="chartOptionForType(type)" height="320px" />
            <div v-else class="bv-empty">完成率为比率，不宜用饼图（请改用柱状/折线）</div>
          </section>
        </div>
        <section class="bv-card">
          <h3 class="bv-title">分组排名（点击行下钻该组项目）</h3>
          <DataTable :columns="tableColumns" :rows="sortedGroups" clickable @row-click="(r) => openDrill(r as PayBoardGroup)">
            <template #cell-rate="{ value }">
              <span class="u-num" :style="{ color: rateColorPmis(value) }">{{ fmtRatio(value) }}</span>
            </template>
            <template #cell-delayedNodeSum="{ value }">
              <span class="u-num" :class="{ 'bv-danger': value > 0 }">{{ value }}</span>
            </template>
          </DataTable>
        </section>
      </template>

      <!-- 交叉 -->
      <template v-else-if="mode === 'cross'">
        <section v-if="crossChartOption" class="bv-card">
          <h3 class="bv-title">{{ METRIC_BY_KEY[metricKey].label }} 交叉堆叠（行 Top 15）</h3>
          <ChartBox :option="crossChartOption" height="320px" />
        </section>
        <section class="bv-card">
          <h3 class="bv-title">交叉矩阵（点击单元格下钻）</h3>
          <BoardMatrix
            v-if="matrix"
            :matrix="matrix"
            :row-label="DIM_OPTS.find((d) => d.value === dimKey)?.label || ''"
            :col-label="SECOND_OPTS.find((d) => d.value === secondDim)?.label || ''"
            :format="metricFormat"
            @cell-click="onCellClick"
          />
          <div v-else class="bv-empty">请选择次维度</div>
        </section>
      </template>

      <!-- 透视 -->
      <template v-else>
        <section class="bv-card">
          <h3 class="bv-title">透视表 · {{ METRIC_BY_KEY[metricKey].label }}（点击单元格下钻）</h3>
          <PivotTable v-if="pivot" :pivot="pivot" :format="metricFormat" @cell-click="onPivotCellClick" />
          <div v-else class="bv-empty">请选择至少一个行维度</div>
        </section>
      </template>

      <BoardDrilldownModal
        v-model="drillOpen"
        :title="drillGroup?.key || ''"
        :projects="drillGroup?.rows || []"
      />
    </template>
  </div>
</template>

<style scoped>
.board-view { padding: var(--sp-4); }
.bv-hint { padding: var(--sp-5); color: var(--mut); }
.bv-toolbar { display: flex; flex-wrap: wrap; gap: var(--sp-4); margin-bottom: var(--sp-3); }
.bv-ctl { display: flex; align-items: center; gap: var(--sp-2); }
.bv-ctl-label { font-size: var(--fs-1); color: var(--mut); }
.bv-charts-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); margin-bottom: var(--sp-3); }
.bv-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-lg); padding: var(--sp-4); margin-bottom: var(--sp-3); }
.bv-chart-item { flex: 1 1 400px; min-width: 300px; margin-bottom: 0; }
.bv-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.bv-danger { color: var(--danger); font-weight: 700; }
.bv-empty { color: var(--mut); padding: var(--sp-4); text-align: center; }
</style>
