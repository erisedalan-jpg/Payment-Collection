<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useSettingsStore } from '@/stores/settings'
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'
import {
  PAY_BOARD_DIMENSIONS as DIMENSIONS, PAY_BOARD_METRICS as METRICS, PAY_BOARD_METRIC_BY_KEY as METRIC_BY_KEY,
  buildPayBoardRows, groupPayBoard, payBoardCross, payBoardPivot, type PayBoardGroup,
} from '@/lib/paymentBoard'
import { filterProjects } from '@/lib/paymentPmis'
import { fmtWan, pct } from '@/lib/format'
import ChartBox from '@/charts/ChartBox.vue'
import SegToggle from '@/components/SegToggle.vue'
import DimPicker from '@/components/DimPicker.vue'
import BoardMatrix from '@/components/BoardMatrix.vue'
import PivotTable from '@/components/PivotTable.vue'
import BoardDrilldownModal from '@/components/BoardDrilldownModal.vue'

const route = useRoute()
const data = useDataStore()
const filter = useFilterStore()
const settings = useSettingsStore()

const DIM_OPTS = DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))
const METRIC_OPTS = METRICS.map((m) => ({ value: m.key, label: m.label }))
const MODE_OPTS = [
  { value: 'single', label: '排名' },
  { value: 'cross', label: '交叉' },
  { value: 'pivot', label: '透视' },
]
const SORT_OPTS = [
  { value: 'actualSum', label: '已回款' },
  { value: 'rate', label: '完成率' },
  { value: 'projectCount', label: '项目数' },
  { value: 'delayedNodeSum', label: '延期节点数' },
]

const initDim =
  typeof route.query.dim === 'string' && DIMENSIONS.some((d) => d.key === route.query.dim)
    ? (route.query.dim as string)
    : 'dept'

const mode = ref('single')
const dimKey = ref(initDim)
const sortKey = ref('actualSum')
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
const groups = computed<PayBoardGroup[]>(() => {
  const gs = groupPayBoard(boardRows.value, [dimKey.value])
  const k = sortKey.value as keyof PayBoardGroup
  // rate 可为 null（无合同组）：降序时 null 统一沉底，避免与真实 0% 组混排
  return [...gs].sort((a, b) => ((b[k] as number | null) ?? -Infinity) - ((a[k] as number | null) ?? -Infinity))
})
const top = computed(() => groups.value.slice(0, 15))
const chartOption = computed(() => {
  const sc = settings.theme === 'dark' ? STATUS_DARK : STATUS_LIGHT
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['已回款', '待回款'], top: 0 },
    grid: { left: 60, right: 20, top: 30, bottom: 60 },
    xAxis: { type: 'category', data: top.value.map((g) => g.key), axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: '金额(万)' },
    series: [
      { name: '已回款', type: 'bar', stack: 'a', data: top.value.map((g) => +(g.actualSum / 10000).toFixed(2)), itemStyle: { color: sc.ok } },
      { name: '待回款', type: 'bar', stack: 'a', data: top.value.map((g) => +(g.pendingSum / 10000).toFixed(2)), itemStyle: { color: sc.warn } },
    ],
  }
})

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
defineExpose({ drillOpen })
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
        <section class="bv-card">
          <h3 class="bv-title">已回款 / 待回款对比（Top {{ top.length }}）</h3>
          <ChartBox :option="chartOption" height="320px" />
        </section>
        <section class="bv-card">
          <h3 class="bv-title">分组排名（点击行下钻该组项目）</h3>
          <div class="bv-table">
            <div class="bv-row bv-head">
              <span class="bv-c-name">{{ DIM_OPTS.find((d) => d.value === dimKey)?.label }}</span>
              <span>项目数</span><span>合同总额(万)</span><span>计划回款(万)</span><span>已回款(万)</span>
              <span>待回款(万)</span><span>完成率</span><span>延期节点</span>
            </div>
            <div v-for="g in groups" :key="g.key" v-activate class="bv-row bv-body" @click="openDrill(g)">
              <span class="bv-c-name" :title="g.key">{{ g.key }}</span>
              <span>{{ g.projectCount }}</span>
              <span>{{ fmtWan(g.contractSum) }}</span>
              <span>{{ fmtWan(g.expectedSum) }}</span>
              <span class="bv-paid">{{ fmtWan(g.actualSum) }}</span>
              <span class="bv-remain">{{ fmtWan(g.pendingSum) }}</span>
              <span>{{ pct(g.rate) }}</span>
              <span :class="{ 'bv-danger': g.delayedNodeSum > 0 }">{{ g.delayedNodeSum }}</span>
            </div>
            <div v-if="!groups.length" class="bv-empty">暂无数据</div>
          </div>
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
.bv-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
.bv-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.bv-table { font-size: var(--fs-2); }
.bv-row { display: grid; grid-template-columns: 1.6fr repeat(7, 1fr); gap: 8px; align-items: center; padding: 7px 8px; }
.bv-row > span:not(.bv-c-name) { text-align: right; }
.bv-head { color: var(--mut); font-size: var(--fs-1); border-bottom: 1px solid var(--line); }
.bv-body { border-top: 1px solid var(--line); cursor: pointer; border-radius: 6px; }
.bv-body:hover { background: var(--card2); }
.bv-c-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt); }
.bv-paid { color: var(--c-paid); }
.bv-remain { color: var(--c-remaining); }
.bv-danger { color: var(--danger); font-weight: 700; }
.bv-empty { color: var(--mut); padding: 16px; text-align: center; }
</style>
