<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useSettingsStore } from '@/stores/settings'
import { useProjectTagsStore } from '@/stores/projectTags'
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'
import {
  PAY_BOARD_DIMENSIONS as DIMENSIONS, PAY_BOARD_METRICS as METRICS, PAY_BOARD_METRIC_BY_KEY as METRIC_BY_KEY,
  buildPayBoardRows, groupPayBoard, payBoardCross, payBoardPivot, type PayBoardGroup,
} from '@/lib/paymentBoard'
import { filterProjects, rateColorPmis } from '@/lib/paymentPmis'
import { fmtWan, fmtRatio, pct } from '@/lib/format'
import { buildRankingOption } from '@/lib/chartOptions'
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

const boardRows = computed(() =>
  buildPayBoardRows(
    filterProjects(data.data?.projects ?? [], {
      viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
      excludeActive: filter.excludeOn, excludedIds: filter.excludedIds,
    }),
    data.data?.projectPmis ?? {},
    data.data?.paymentNodes,
    filter.payRecordsAll,
    filter.dateStart,
    filter.dateEnd,
    projectTags.assignments,
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

// 柱状图（bar）：按计划回款降序 Top15，已回/待回堆叠柱 + 总计柱顶
const chartTop = computed(() => [...groups.value].sort((a, b) => b.expectedSum - a.expectedSum).slice(0, 15))
const stackedBarOption = computed(() => {
  const sc = settings.theme === 'dark' ? STATUS_DARK : STATUS_LIGHT
  const t = chartTop.value
  const paid = t.map((g) => Math.round(g.actualSum / 10000))
  const pending = t.map((g) => Math.round(g.pendingSum / 10000))
  const total = t.map((_, i) => paid[i] + pending[i])
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['已回款', '待回款'], top: 0 },
    grid: { left: 60, right: 20, top: 30, bottom: 60 },
    xAxis: { type: 'category', data: t.map((g) => g.key), axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: '金额(万)' },
    series: [
      { name: '已回款', type: 'bar', stack: 'a', data: paid, itemStyle: { color: sc.ok }, label: { show: true, position: 'inside' } },
      { name: '待回款', type: 'bar', stack: 'a', data: pending, itemStyle: { color: sc.warn }, label: { show: true, position: 'inside' } },
      // 透明总计 series: 0 高、不入 legend，顶部显示 已回+待回 总计（ECharts 堆叠柱无内建总计）
      { name: '总计', type: 'bar', stack: 'a', data: new Array(t.length).fill(0), itemStyle: { color: 'transparent' },
        tooltip: { show: false }, label: { show: true, position: 'top', formatter: (p: { dataIndex: number }) => String(total[p.dataIndex]) } },
    ],
  }
})

// 折线图（line）：已回款 & 待回款两条折线 + 标签
const lineChartOption = computed(() => {
  const sc = settings.theme === 'dark' ? STATUS_DARK : STATUS_LIGHT
  const t = chartTop.value
  const paid = t.map((g) => Math.round(g.actualSum / 10000))
  const pending = t.map((g) => Math.round(g.pendingSum / 10000))
  const labelStyle = { show: true, position: 'top' as const }
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['已回款', '待回款'], top: 0 },
    grid: { left: 60, right: 20, top: 40, bottom: 60 },
    xAxis: { type: 'category', data: t.map((g) => g.key), axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: '金额(万)' },
    series: [
      { name: '已回款', type: 'line', data: paid, itemStyle: { color: sc.ok }, symbol: 'circle', symbolSize: 6, label: labelStyle },
      { name: '待回款', type: 'line', data: pending, itemStyle: { color: sc.warn }, symbol: 'circle', symbolSize: 6, label: labelStyle },
    ],
  }
})

// 饼图（pie）：contractSum 合同总额占比
const pieChartOption = computed(() => {
  const t = chartTop.value
  return buildRankingOption('pie', {
    categories: t.map((g) => g.key),
    values: t.map((g) => g.contractSum),
    metricLabel: '合同总额',
    valueKind: 'amount',
  })
})

// 按选中图表类型输出对应 option
function chartOptionForType(type: string) {
  if (type === 'line') return lineChartOption.value
  if (type === 'pie') return pieChartOption.value
  return stackedBarOption.value
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
defineExpose({ drillOpen, dimKey })
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
            <h3 class="bv-title">
              <template v-if="type === 'bar'">已回款 / 待回款对比（Top {{ chartTop.length }}）</template>
              <template v-else-if="type === 'line'">已回款 / 待回款折线（Top {{ chartTop.length }}）</template>
              <template v-else>合同总额占比（Top {{ chartTop.length }}）</template>
            </h3>
            <ChartBox :option="chartOptionForType(type)" height="320px" />
          </section>
        </div>
        <section class="bv-card">
          <h3 class="bv-title">分组排名（点击行下钻该组项目）</h3>
          <DataTable :columns="tableColumns" :rows="groups" clickable @row-click="(r) => openDrill(r as PayBoardGroup)">
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
.board-view { padding: 16px; }
.bv-hint { padding: 24px; color: var(--mut); }
.bv-toolbar { display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 12px; }
.bv-ctl { display: flex; align-items: center; gap: 8px; }
.bv-ctl-label { font-size: var(--fs-1); color: var(--mut); }
.bv-charts-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); margin-bottom: 12px; }
.bv-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
.bv-chart-item { flex: 1 1 400px; min-width: 300px; margin-bottom: 0; }
.bv-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.bv-danger { color: var(--danger); font-weight: 700; }
.bv-empty { color: var(--mut); padding: 16px; text-align: center; }
</style>
