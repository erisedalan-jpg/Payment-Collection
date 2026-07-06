<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import { useFilterStore } from '@/stores/filter'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { useProjectTagsStore } from '@/stores/projectTags'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildCostRows, costKpis, costL4Dist, costL4Summary } from '@/lib/costAnalysis'
import { applyColumnFilters } from '@/lib/crossFilter'
import { tagMatch } from '@/lib/tagFilter'
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'
import MetricGrid from '@/components/MetricGrid.vue'
import ChartBox from '@/charts/ChartBox.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import TagFilterSelect from '@/components/TagFilterSelect.vue'
import { useRouter } from 'vue-router'
import { fmtWan } from '@/lib/format'
import { usePagedRows } from '@/lib/usePagedRows'
import { useExternalSort } from '@/lib/useExternalSort'
import { exportRows } from '@/lib/exportXlsx'
import StatusBadge from '@/components/StatusBadge.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { useDeferredMount } from '@/lib/useDeferredMount'
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'

defineOptions({ name: 'CostDetailView' })
useViewScrollMemory()

const TABLE_ID = 'cost-detail'
const data = useDataStore()
const settings = useSettingsStore()
const filter = useFilterStore()
const cf = useCrossFilterStore()
const projectTags = useProjectTagsStore()
const router = useRouter()
// 延迟渲染:点击进页先出标题/KPI,下一两帧再挂图表+两张表,消除跨页点击冻结。
const { ready } = useDeferredMount()
onMounted(() => {
  if (!data.data) data.load()
  if (!projectTags.loaded) projectTags.load()
})
// 进页先清空本表残留列筛选,避免跨导航叠加
cf.clearAll(TABLE_ID)

const sc = computed(() => (settings.theme === 'dark' ? STATUS_DARK : STATUS_LIGHT))
const baseProjects = computed(() => {
  const all = (data.data?.projects ?? []) as Project[]
  return filter.excludeOn ? all.filter((p) => !filter.excludedIds[p.projectId]) : all
})
const rows = computed(() => buildCostRows(
  baseProjects.value,
  (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
))

const kpi = computed(() => costKpis(rows.value))
const kpiItems = computed(() => {
  const k = kpi.value
  return [
    { k: '成本统计项目数', v: String(k.total), clickable: true },
    { k: '未超支', v: String(k.notOverspent), cls: 'ok', clickable: true },
    { k: '总成本超支数', v: String(k.totalOverspend), sub: `超支大于5000: ${k.totalOverspendOver5k}`, cls: 'danger', clickable: true },
    { k: '交付成本超支数', v: String(k.deliveryOverspend), sub: `未获取原项目预算: ${k.noOriginBudget}`, cls: 'danger', clickable: true },
  ]
})

const dist = computed(() => costL4Dist(rows.value))
const distOption = computed(() => {
  const d = dist.value, s = sc.value
  const lbl = { show: true, formatter: (p: any) => p.value || '' }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['超支不足5k', '超支大于5k'], top: 0 },
    grid: { left: 56, right: 20, top: 36, bottom: 64 },
    xAxis: { type: 'category', data: d.map((x) => x.orgL4), axisLabel: { interval: 0, rotate: d.length > 6 ? 30 : 0, fontSize: 11, margin: 10 } },
    yAxis: { type: 'value', name: '超支项目数', nameLocation: 'middle', nameGap: 38, nameRotate: 90 },
    series: [
      { name: '超支不足5k', type: 'bar', stack: 't', color: s.warn, label: lbl, data: d.map((x) => x.under5k) },
      { name: '超支大于5k', type: 'bar', stack: 't', color: s.danger, label: lbl, data: d.map((x) => x.over5k) },
    ],
  }
})

const l4Rows = computed(() => costL4Summary(rows.value))
const L4_COLS: DataColumn[] = [
  { key: 'orgL4', label: 'L4部门', width: 140, sortable: true },
  { key: 'total', label: '项目总数', width: 90, num: true, sortable: true },
  { key: 'normal', label: '未超支', width: 90, num: true, sortable: true },
  { key: 'under5k', label: '超支不足5k', width: 110, num: true, sortable: true },
  { key: 'over5k', label: '超支大于5k', width: 110, num: true, sortable: true },
  { key: 'noOriginBudget', label: '未获取原项目预算', width: 130, num: true, sortable: true },
  { key: 'over5kRatio', label: '超支占比', width: 100, num: true, sortable: true },
  { key: 'contractTotal', label: '合同总额(万)', width: 120, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'remainingTotal', label: '剩余预算(万)', width: 120, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'deliveryDeptRemaining', label: '交付部门剩余(万)', width: 130, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'deliveryOutsourceRemaining', label: '交付外包剩余(万)', width: 130, num: true, sortable: true, formatter: (v) => fmtWan(v) },
]

const L4_TABLE_ID = 'cost-l4-summary'
const l4Prefs = useColumnPrefs(L4_TABLE_ID, L4_COLS.map((c) => c.key), L4_COLS.map((c) => c.key))
const l4VisibleColumns = computed(() =>
  l4Prefs.visibleKeys.value.map((k) => L4_COLS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const l4PickerColumns = L4_COLS.map((c) => ({ key: c.key, label: c.label }))

// —— 项目成本明细表 ——
const num0 = (v: any) => Number(v || 0).toLocaleString('zh-CN')
const DETAIL_COLS: DataColumn[] = [
  { key: '_seq', label: '序号', width: 60, num: true },
  { key: 'projectId', label: '项目编号', width: 150, sortable: true },
  { key: 'projectName', label: '项目名称', wrap: true, sortable: true },
  { key: 'projectType', label: '类型', width: 100, sortable: true },
  { key: 'orgL4', label: 'L4部门', width: 110, sortable: true },
  { key: 'manager', label: '项目经理', width: 90, sortable: true },
  { key: 'amount', label: '项目金额(元)', width: 130, num: true, sortable: true, formatter: num0 },
  { key: 'status', label: '成本状态', width: 110, sortable: true },
  { key: 'totalBudget', label: '总预算(元)', width: 130, num: true, sortable: true, formatter: num0 },
  { key: 'actualCost', label: '已核算(元)', width: 130, num: true, sortable: true, formatter: num0 },
  { key: 'remaining', label: '剩余预算(元)', width: 140, num: true, sortable: true, formatter: num0 },
  { key: 'deliveryDeptRemaining', label: '交付部门剩余(元)', width: 140, num: true, sortable: true, formatter: num0 },
  { key: 'deliveryOutsourceRemaining', label: '交付外包剩余(元)', width: 140, num: true, sortable: true, formatter: num0 },
  { key: 'deliveryStatus', label: '交付成本状态', width: 130, sortable: true },
  { key: 'riskLevel', label: '项目风险', width: 110, sortable: true,
    formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'riskMajorCats', label: '风险大类', width: 180, wrap: true },
]
// 全列(除序号)可列头多选筛选;riskMajorCats 为数组列,不进列头筛选(整体 String 化会破坏筛选)
const FILTERABLE = new Set(DETAIL_COLS.map((c) => c.key).filter((k) => k !== '_seq' && k !== 'riskMajorCats'))
// 数值列(排序按数值,余按中文 localeCompare)
const NUMERIC_KEYS = new Set(['amount', 'totalBudget', 'actualCost', 'remaining', 'deliveryDeptRemaining', 'deliveryOutsourceRemaining'])

const TONE: Record<string, string> = { 未超支: 'ok', 超支不足5k: 'warn', 超支大于5k: 'danger', 未获取原项目预算: 'mut' }
const DELIVERY_TONE: Record<string, string> = { 未超支: 'ok', 交付预算超支: 'warn', 交付外包超支: 'warn', 原厂外包均超支: 'danger', 未获取原项目预算: 'mut' }

const detailCardRef = ref<HTMLElement | null>(null)
const fKw = ref('')
const selectedTags = ref<string[]>([])

// KPI 卡点击 → 就地筛选明细(本地 kpiFilter,不写 crossFilter)
type KpiFilter = 'all' | 'notOverspent' | 'totalOverspend' | 'deliveryOverspend'
const KPI_FILTER: KpiFilter[] = ['all', 'notOverspent', 'totalOverspend', 'deliveryOverspend']
const kpiFilter = ref<KpiFilter>('all')
function onKpiClick(i: number) {
  const f = KPI_FILTER[i]
  kpiFilter.value = (i === 0 || kpiFilter.value === f) ? 'all' : f
  detailCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 列头多选筛选 → 标签筛选(含无标签) → 关键词搜索 → KPI 就地筛选 → 默认按 L4 升序(标题"按 L4 组织排序")
const filtered = computed(() => {
  const colFiltered = applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID))
  const tagged = colFiltered.filter((x) => tagMatch(projectTags.assignments[x.projectId] ?? [], selectedTags.value))
  const kw = fKw.value.trim()
  let r = kw ? tagged.filter((x) => x.projectId.includes(kw) || x.projectName.includes(kw)) : tagged
  if (kpiFilter.value === 'notOverspent') r = r.filter((x) => !x.totalOverspend && !x.deliveryOverspend && !x.noOriginBudget)
  else if (kpiFilter.value === 'totalOverspend') r = r.filter((x) => x.totalOverspend)
  else if (kpiFilter.value === 'deliveryOverspend') r = r.filter((x) => x.deliveryOverspend)
  return [...r].sort((a, b) => a.orgL4.localeCompare(b.orgL4) || a.projectId.localeCompare(b.projectId))
})

// 表头排序(custom,跨页排全集)
const { sortState, onSortChange, sorted } = useExternalSort(filtered, NUMERIC_KEYS)

const { paged, currentPage, pageSize } = usePagedRows(sorted, 20)
const pagedSeq = computed(() => paged.value.map((r, i) => ({ ...r, _seq: (currentPage.value - 1) * pageSize.value + i + 1 })))

function reset() { fKw.value = ''; selectedTags.value = []; cf.clearAll(TABLE_ID); sortState.value = { prop: '', order: '' }; kpiFilter.value = 'all' }
function onExport() {
  exportRows('项目成本明细.xlsx', sorted.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 项目类型: r.projectType,
    L4部门: r.orgL4, 项目经理: r.manager, 项目金额: r.amount, 成本状态: r.status,
    总预算: r.totalBudget, 已核算: r.actualCost, 剩余预算: r.remaining,
    交付部门剩余: r.deliveryDeptRemaining, 交付外包剩余: r.deliveryOutsourceRemaining,
    交付成本状态: r.deliveryStatus,
    项目风险: r.openRisks ? `${r.riskLevel}(${r.openRisks})` : r.riskLevel,
    风险大类: r.riskMajorCats.join('、'),
  })))
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
defineExpose({ baseProjects, rows, filtered, sorted, DETAIL_COLS, fKw, selectedTags, kpiFilter, onKpiClick, onSortChange, sortState, TABLE_ID, l4VisibleColumns })
</script>

<template>
  <div class="cd-view">
    <h2 class="cd-title">成本分析</h2>

    <div v-if="!rows.length" class="cd-empty">暂无主域成本数据——请在「数据管理」提供 PMIS 文件后点「更新数据」。</div>

    <template v-else>
      <MetricGrid :items="kpiItems" :col-min="'160px'" @item-click="onKpiClick" />
      <div v-if="!ready" class="cd-defer"><el-skeleton :rows="8" animated /></div>
      <template v-else>
      <div class="cd-grid2">
        <div class="cd-card"><div class="cd-card-h">超支项目分布</div><ChartBox :option="distOption" height="420px" /></div>
        <div class="cd-card">
          <div class="cd-card-h cd-card-h--row">
            <span>L4 部门成本情况汇总</span>
            <ColumnPicker :columns="l4PickerColumns" :visible-keys="l4Prefs.visibleKeys.value"
              @toggle="l4Prefs.toggle" @move-up="l4Prefs.moveUp" @move-down="l4Prefs.moveDown" @reset="l4Prefs.reset" />
          </div>
          <DataTable :columns="l4VisibleColumns" :rows="l4Rows" :show-count="false">
          <template #cell-over5kRatio="{ row, value }"><span class="u-num" :class="row.over5k > 0 ? 'cd-red' : 'cd-green'">{{ value }}%</span></template>
        </DataTable></div>
      </div>
      <div class="cd-card" ref="detailCardRef">
        <div class="cd-card-h">项目成本明细</div>
        <div class="cd-bar">
          <el-input v-model="fKw" size="small" placeholder="编号/名称" style="width: 160px" clearable />
          <TagFilterSelect v-model="selectedTags" />
          <button class="cd-btn" @click="reset">重置</button>
          <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
          <button class="cd-btn" data-test="cost-export" @click="onExport">导出Excel</button>
        </div>
        <div class="cd-scroll">
          <DataTable :columns="DETAIL_COLS" :rows="pagedSeq" :show-count="false" clickable external-sort
            @row-click="onRow" @sort-change="onSortChange">
            <template v-for="col in DETAIL_COLS" :key="col.key" #[`header-${col.key}`]="{ col: c }">
              <span class="cd-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" /></span>
            </template>
            <template #cell-projectId="{ value }"><span class="cd-link">{{ value }}</span></template>
            <template #cell-status="{ value }"><StatusBadge :label="value" :tone="TONE[value]" /></template>
            <template #cell-remaining="{ row, value }"><span class="u-num" :class="row.remaining < 0 ? 'cd-red' : 'cd-green'">{{ num0(value) }}</span></template>
            <template #cell-deliveryStatus="{ value }"><StatusBadge :label="value" :tone="DELIVERY_TONE[value]" /></template>
            <template #cell-riskMajorCats="{ value }">
              <span v-if="!value || !value.length" class="cd-mut">-</span>
              <span v-else class="cd-majorcats">
                <span v-for="c in value" :key="c" class="cd-majorcat">{{ c }}</span>
              </span>
            </template>
          </DataTable>
        </div>
        <div class="cd-pager">
          <span class="u-num">共 {{ sorted.length }} 条</span>
          <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="sorted.length" layout="sizes, prev, pager, next" size="small" background />
        </div>
      </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.cd-view { padding: var(--sp-4); }
.cd-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.cd-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: var(--gap-card); }
.cd-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3); margin-bottom: var(--sp-3); }
.cd-card-h { font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-2); }
.cd-card-h--row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.cd-th { display: inline-flex; align-items: center; }
.cd-red { color: var(--danger-text); font-weight: 600; }
.cd-green { color: var(--ok-text); }
.cd-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.cd-defer { padding: var(--sp-4); background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); min-height: 360px; }
.cd-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.cd-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.cd-btn:hover { background: var(--bg); color: var(--accent); }
.cd-scroll { overflow-x: auto; }
.cd-link { color: var(--accent); cursor: pointer; }
.cd-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
.cd-majorcats { display: flex; flex-direction: column; gap: 2px; }
.cd-mut { color: var(--mut); }
</style>
