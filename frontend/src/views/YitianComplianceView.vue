<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import RatioRing from '@/components/RatioRing.vue'
import ChartBox from '@/charts/ChartBox.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import { useYitianStore } from '@/stores/yitian'
import { useScopedYitian } from '@/composables/useScopedData'
import { useYitianViewStore } from '@/stores/yitianView'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters, cfUniqueValues } from '@/lib/crossFilter'
import { issueRows, countByCode, countByL4, issueHeatmap, ISSUE_LABELS, type IssueHeatmap } from '@/lib/yitian/compliance'
import { kpi } from '@/lib/yitian/metrics'
import { parseDrillQuery } from '@/lib/yitian/drill'
import { STATUS_LIGHT, STATUS_DARK, STRUCT_LIGHT, STRUCT_DARK } from '@/charts/echartsTheme'
import { useSettingsStore } from '@/stores/settings'
import { exportRows } from '@/lib/exportXlsx'
import { buildDetailDrill } from '@/lib/yitian/detailDrill'

const TABLE_ID = 'yitian-compliance'
const store = useYitianStore()
const scopedYitian = useScopedYitian()
const view = useYitianViewStore()
const settings = useYitianSettingsStore()
const themeStore = useSettingsStore()
const cf = useCrossFilterStore()
const route = useRoute()
const router = useRouter()

onMounted(() => { store.load(); settings.load() })

// 图表 option 里显式写死的颜色不随 ChartBox 主题色板联动,须自己按主题选浅/暗两套镜像常量(不新增颜色)。
const pal = computed(() => themeStore.theme === 'dark'
  ? { status: STATUS_DARK, struct: STRUCT_DARK }
  : { status: STATUS_LIGHT, struct: STRUCT_LIGHT })

const ready = computed(() => !!store.data)

// 下钻落地:趋势页等带 dStart/dEnd query 跳进来时,设日期区间后清 query(免重进/刷新重放)。
// 用 ready 门控的 post-flush 一次性 watcher(而非 onMounted 里直设):数据未到时
// YitianToolbar(v-if="ready")还没挂载,若在 onMounted 里直接设 view.start/end,
// 等 toolbar 挂载后其 hydrate() 会用 localStorage 历史区间覆盖掉刚设的下钻值。
// flush:'post' + nextTick 确保这段在 toolbar hydrate() 之后才跑。
let drillApplied = false
function applyDrillLanding() {
  if (drillApplied) return
  const q = route.query
  if (!Object.keys(q).length) { drillApplied = true; return }
  drillApplied = true
  const d = parseDrillQuery(q)
  if (d.start && d.end) { view.start = d.start; view.end = d.end }
  // 只删下钻键,保留落地时 query 上其它非下钻参数——不整体清空。
  const rest: Record<string, any> = { ...route.query }
  delete rest.dL4; delete rest.dStart; delete rest.dEnd; delete rest.dScroll
  router.replace({ query: rest })
}
watch(ready, (r) => { if (r) nextTick(applyDrillLanding) }, { immediate: true, flush: 'post' })

// excludedTypes 必须传进去,否则超管在 /data 剔除某类型后,总览/趋势页的问题数变了,
// 这里仍原样列出,两页口径漂移(I-7)。
const allRows = computed(() =>
  scopedYitian.value ? issueRows(scopedYitian.value, view.start, view.end, view.l4s, settings.settings.excludedTypes) : [])

const codeDist = computed(() => countByCode(allRows.value))
const l4Dist = computed(() => countByL4(allRows.value))
const heatmap = computed(() => issueHeatmap(allRows.value))

// 全量派生行(含 issueTypes 供列筛选);列筛选交给 applyColumnFilters,不再本地 codeFilter。
const allDetailRows = computed(() =>
  allRows.value.map((r) => ({
    ...r,
    okText: r.ok === 2 ? '问题' : '提示',
    issueText: r.msgs.length ? r.msgs.join('；') : r.codes.map((c) => ISSUE_LABELS[c] ?? c).join('；'),
    issueTypes: r.codes.map((c) => ISSUE_LABELS[c] ?? c),
  })))
const filtered = computed(() => applyColumnFilters(allDetailRows.value, cf.tableFilters(TABLE_ID)))

const FILTERABLE = new Set(['date', 'empName', 'l4', 'type', 'hours', 'customer', 'workOrder', 'okText'])
const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

/** 图表下钻→同页列筛选:清空所有既有筛选再按下钻目标设列。 */
function drillTable(setters: { col: string; val: string }[]) {
  cf.clearAll(TABLE_ID)
  for (const s of setters) cf.setColumnFilter(TABLE_ID, s.col, [s.val], cfUniqueValues(allDetailRows.value, s.col).length)
}
function onCodeBarClick(p: any) { if (p?.name) drillTable([{ col: 'issueTypes', val: p.name }]) }
function onL4BarClick(p: any) { if (p?.name) drillTable([{ col: 'l4', val: p.name }]) }
function onHeatmapClick(p: any) {
  const d = p?.data as [number, number, number] | undefined
  if (!d) return
  const l4 = heatmap.value.l4s[d[0]]; const code = heatmap.value.codes[d[1]]?.label
  drillTable([{ col: 'l4', val: l4 }, { col: 'issueTypes', val: code }])
}
function goDetailIssue(row: { empId: string }) {
  if (row?.empId) router.push({ path: '/yitian/detail', query: buildDetailDrill({ emp: row.empId, only: true }) })
}

// 健康带:合规率环 + 三项计数卡(均取自 issueRows 派生,与问题明细同源,不会对不上)。
const k = computed(() => (scopedYitian.value
  ? kpi(scopedYitian.value, view.start, view.end, view.l4s, settings.settings.excludedTypes)
  : null))
const complianceRatio = computed(() => k.value?.complianceRate ?? null)
// 合规率环按阈值上色(与总览页同口径):≥90% 达标绿,<90% 警示黄,null 交给 RatioRing 默认(mut)。
const complianceRingColor = computed(() => {
  const r = complianceRatio.value
  return r == null ? undefined : (r >= 0.9 ? 'var(--ok)' : 'var(--warn)')
})

const healthMetrics = computed(() => {
  const r = allRows.value
  return [
    { k: '总问题数', v: String(r.length) },
    { k: '问题人次', v: String(new Set(r.map((x) => x.empId)).size) },
    { k: '涉及组织数', v: String(new Set(r.map((x) => x.l4)).size) },
  ]
})

/** 问题分布横向柱:按码前缀上色,HINT_=warn(提示),其余=danger(问题),与旧 pill 列表语义一致(M-5)。 */
function codeBarOption(codes: { label: string; code: string; count: number }[]) {
  const rows2 = [...codes].sort((a, b) => a.count - b.count)
  const status = pal.value.status
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows2.map((r) => r.label) },
    series: [{
      type: 'bar',
      data: rows2.map((r) => ({
        value: r.count,
        itemStyle: { color: r.code.startsWith('HINT_') ? status.warn : status.danger },
      })),
    }],
  }
}
const codeBarChartOption = computed(() => codeBarOption(codeDist.value))
const codeBarHeight = computed(() => `${Math.max(240, codeDist.value.length * 32 + 96)}px`)

/** 问题按 L4 组织分布横向柱:与 codeBarOption 同构,无问题码前缀语义,走主题默认色。 */
function l4BarOption(rows2: { l4: string; count: number }[]) {
  const sorted = [...rows2].sort((a, b) => a.count - b.count)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: sorted.map((r) => r.l4) },
    series: [{ type: 'bar', data: sorted.map((r) => r.count) }],
  }
}
const l4BarChartOption = computed(() => l4BarOption(l4Dist.value))
const l4BarHeight = computed(() => `${Math.max(240, l4Dist.value.length * 32 + 96)}px`)

/** 问题码 × L4 热力图,色阶三档全取已导出 echarts 主题常量(按当前主题挑浅/暗那一套),不新增颜色。 */
function heatmapOption(h: IssueHeatmap) {
  const { status, struct } = pal.value
  return {
    tooltip: { position: 'top' },
    grid: { left: 8, right: 8, top: 8, bottom: 60, containLabel: true },
    xAxis: { type: 'category', data: h.l4s, axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'category', data: h.codes.map((c) => c.label) },
    visualMap: {
      min: 0, max: Math.max(1, h.max), calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
      inRange: { color: [struct.card, status.warn, status.danger] },
    },
    series: [{ type: 'heatmap', data: h.cells, label: { show: true } }],
  }
}
const heatmapChartOption = computed(() => heatmapOption(heatmap.value))
const heatmapHeight = computed(() => `${Math.max(320, heatmap.value.codes.length * 40 + 140)}px`)

const cols: DataColumn[] = [
  { key: 'date', label: '工作日', width: 110, sortable: true },
  { key: 'empName', label: '员工', width: 90, sortable: true },
  { key: 'l4', label: 'L4 组织', width: 130, sortable: true },
  { key: 'type', label: '工时类型', width: 100, sortable: true },
  { key: 'hours', label: '工时', width: 80, num: true, sortable: true },
  { key: 'customer', label: '客户', width: 160 },
  { key: 'workOrder', label: '工单编号', width: 140 },
  { key: 'okText', label: '状态', width: 80, sortable: true },
  { key: 'issueText', label: '问题', width: 320, wrap: true },
  { key: 'snippet', label: '工作成果摘要', width: 360, wrap: true },
  { key: 'detailAction', label: '明细', width: 70, fixed: 'right' },
]

function onExport() {
  // 既有签名是 exportRows(filename, rows) —— 文件名在前,别写反
  exportRows(
    `倚天工时合规问题_${view.start}_${view.end}.xlsx`,
    filtered.value.map((r) => ({
      工作日: r.date, 员工: r.empName, L4组织: r.l4, 工时类型: r.type, 工时: r.hours,
      客户: r.customer, 工单编号: r.workOrder, 状态: r.okText, 问题: r.issueText, 工作成果摘要: r.snippet,
    })),
  )
}

defineExpose({ filtered, paged, codeDist, codeBarChartOption, complianceRatio, complianceRingColor, goDetailIssue })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <div class="yt-kpi-row">
        <MetricGrid :items="healthMetrics" col-min="180px" class="yt-kpi-grid" />
        <div class="yt-ring-card">
          <RatioRing :ratio="complianceRatio" label="合规率" :size="140" :color="complianceRingColor" />
        </div>
      </div>

      <section class="yt-card">
        <div class="yt-head">
          <h3 class="yt-h">问题分布</h3>
          <div class="yt-actions">
            <el-button @click="onExport">导出</el-button>
          </div>
        </div>
        <div v-if="!codeDist.length" class="yt-empty">本区间无合规问题</div>
        <ChartBox v-else :option="codeBarChartOption" :height="codeBarHeight" @datapoint-click="onCodeBarClick" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">问题按 L4 组织分布</h3>
        <div v-if="!l4Dist.length" class="yt-empty">本区间无合规问题</div>
        <ChartBox v-else :option="l4BarChartOption" :height="l4BarHeight" @datapoint-click="onL4BarClick" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">问题码 × L4 热力图</h3>
        <div v-if="!heatmap.codes.length" class="yt-empty">本区间无合规问题</div>
        <ChartBox v-else :option="heatmapChartOption" :height="heatmapHeight" @datapoint-click="onHeatmapClick" />
      </section>

      <section class="yt-card">
        <div class="yt-head">
          <h3 class="yt-h">问题明细</h3>
          <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
        </div>
        <DataTable :columns="cols" :rows="paged" sticky-header :max-height-px="560">
          <template v-for="col in cols" :key="col.key" #[`header-${col.key}`]="{ col: c }">
            <span class="yt-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="allDetailRows" /><ColumnFilter v-else-if="c.key === 'issueText'" :table-id="TABLE_ID" col-key="issueTypes" :source-rows="allDetailRows" /></span>
          </template>
          <template #cell-detailAction="{ row }">
            <el-link type="primary" :underline="false" @click.stop="goDetailIssue(row)">明细</el-link>
          </template>
        </DataTable>
        <div class="yt-pager">
          <span class="yt-total u-num">共 {{ filtered.length }} 条</span>
          <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :total="filtered.length" layout="prev, pager, next" size="small" background />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
.yt-kpi-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; gap: var(--gap-card); }
@media (max-width: 768px) { .yt-kpi-row { grid-template-columns: 1fr; } }
.yt-kpi-grid { min-width: 0; }
.yt-ring-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-width: 200px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--card-pad);
}
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-head { display: flex; justify-content: space-between; align-items: center; gap: var(--gap-stack); flex-wrap: wrap; }
.yt-actions { display: flex; gap: var(--gap-stack); align-items: center; }
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
.yt-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
.yt-pager { display: flex; justify-content: flex-end; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
.yt-total { font-size: var(--fs-1); color: var(--sub); }
</style>
