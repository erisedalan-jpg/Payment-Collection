<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ChartBox from '@/charts/ChartBox.vue'
import HealthSegmentBar from '@/components/HealthSegmentBar.vue'
import { useYitianStore } from '@/stores/yitian'
import { useScopedYitian } from '@/composables/useScopedData'
import { useYitianViewStore } from '@/stores/yitianView'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters, cfUniqueValues } from '@/lib/crossFilter'
import { parseDrillQuery } from '@/lib/yitian/drill'
import { buildDetailDrill } from '@/lib/yitian/detailDrill'
import { empStats, saturationTop, unfilledList, neverFilledList, type EmpStat } from '@/lib/yitian/metrics'
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'
import { useSettingsStore } from '@/stores/settings'

const store = useYitianStore()
const scopedYitian = useScopedYitian()
const view = useYitianViewStore()
const themeStore = useSettingsStore()

const TABLE_ID = 'yitian-analytics'
const cf = useCrossFilterStore()
const route = useRoute()
const router = useRouter()
const FILTERABLE = new Set(['id', 'name', 'l31', 'l4', 'hoursText', 'baseText', 'satText', 'diffText'])

// 图表 option 里显式写死的颜色不随 ChartBox 主题色板联动,须自己按主题选浅/暗两套镜像常量(不新增颜色)。
const pal = computed(() => (themeStore.theme === 'dark' ? STATUS_DARK : STATUS_LIGHT))

const ready = computed(() => !!store.data)

function pct(v: number | null): string {
  return v === null ? '-' : (v * 100).toFixed(1) + '%'
}
function hrs(v: number): string {
  return v.toFixed(1)
}
function shape(s: EmpStat) {
  return {
    ...s,
    hoursText: hrs(s.hours),
    baseText: hrs(s.base),
    satText: pct(s.sat),
    diffText: (s.diff > 0 ? '+' : '') + hrs(s.diff),
  }
}

const stats = computed(() =>
  scopedYitian.value ? empStats(scopedYitian.value, view.start, view.end, view.l4s) : [])

const empRows = computed(() => stats.value.map(shape))
const topStats = computed(() => saturationTop(stats.value, 10))
const topRows = computed(() => topStats.value.map(shape))
const unfilledRows = computed(() => unfilledList(stats.value).map(shape))
const neverRows = computed(() => neverFilledList(stats.value).map(shape))

// 顶部人数结构:达标(diff>=0 且已填)/欠填(已填但 diff<0)/完全未填(!filled)。段数取自 empStats。
const headcountSegments = computed(() => {
  const s = stats.value
  return [
    { key: 'ok', label: '达标', count: s.filter((x) => x.filled && x.diff >= 0).length, color: 'var(--ok)' },
    { key: 'under', label: '欠填', count: s.filter((x) => x.filled && x.diff < 0).length, color: 'var(--warn)' },
    { key: 'never', label: '完全未填', count: s.filter((x) => !x.filled).length, color: 'var(--danger)' },
  ]
})

// 员工工时明细:表头列筛选(crossFilter) → 分页
const filtered = computed(() => applyColumnFilters(empRows.value, cf.tableFilters(TABLE_ID)))
const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

function scrollTo(id: string) {
  nextTick(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
// 员工级图表(饱和度TOP柱/发散条/散点)单点下钻:按工号(id)精确筛到该员工,滚到明细表。
// 三张图的每个数据项都自带 id(柱=对象 {value,id};散点=元组第4位),handler 直接读 id——
// 不再靠 name 反查(同名员工会查到错的人),也绕开散点 params.name 恒为空串的 ECharts 行为。
function drillEmpById(id: string) {
  cf.clearAll(TABLE_ID)
  cf.setColumnFilter(TABLE_ID, 'id', [id], cfUniqueValues(empRows.value, 'id').length)
  scrollTo('yt-emp')
}
function onEmpChartClick(p: any) {
  const id = p?.data?.id ?? p?.value?.[3] // 柱:data.id;散点:value[3]
  if (id) drillEmpById(String(id))
}
function goDetailEmp(row: { id: string }) {
  if (row?.id) router.push({ path: '/yitian/detail', query: buildDetailDrill({ emp: row.id }) })
}
// HealthSegmentBar 人数结构段点击:滚到对应结构段(欠填/完全未填走各自子表,达标无对应子表→落员工明细)。
function onSegClick(key: string) {
  scrollTo(key === 'never' ? 'yt-neverfilled' : key === 'under' ? 'yt-unfilled' : 'yt-emp')
}

onMounted(() => { store.load() })

// 下钻落地:总览/趋势/客户页带 dL4/dStart/dEnd/dScroll query 跳进来时,设筛选/日期区间/
// 滚动锚点后清 query(免重进/刷新重放)。用 ready 门控的 post-flush 一次性 watcher(而非
// onMounted 里直设):数据未到时 YitianToolbar(v-if="ready")与各锚点 section 都还没挂载/
// 渲染,若在 onMounted 里直接设 view.start/end,等 toolbar 挂载后其 hydrate() 会用
// localStorage 历史区间覆盖掉刚设的下钻值,滚动锚点也因 section 未渲染而落空。
// flush:'post' + nextTick 确保这段在 toolbar hydrate() 之后、锚点渲染之后才跑。
let drillApplied = false
function applyDrillLanding() {
  if (drillApplied) return
  const q = route.query
  if (!Object.keys(q).length) { drillApplied = true; return }
  drillApplied = true
  const d = parseDrillQuery(q)
  if (d.l4) {
    cf.clearAll(TABLE_ID)
    cf.setColumnFilter(TABLE_ID, 'l4', [d.l4], cfUniqueValues(empRows.value, 'l4').length)
  }
  if (d.start && d.end) { view.start = d.start; view.end = d.end }
  if (d.scroll) scrollTo(d.scroll === 'neverfilled' ? 'yt-neverfilled' : 'yt-diverging')
  // 只删下钻键,保留落地时 query 上其它非下钻参数(如未来加的分享态)——不整体清空。
  const rest: Record<string, any> = { ...route.query }
  delete rest.dL4; delete rest.dStart; delete rest.dEnd; delete rest.dScroll
  router.replace({ query: rest })
}
watch(ready, (r) => { if (r) nextTick(applyDrillLanding) }, { immediate: true, flush: 'post' })

// 饱和度 TOP10:横向柱 + 基础工时均值参考线
function satTopOption(top: EmpStat[]) {
  const rows = [...top].sort((a, b) => a.hours - b.hours)
  const base = rows[0]?.base ?? 0
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows.map((r) => r.name) },
    series: [{
      type: 'bar', data: rows.map((r) => ({ value: Number(r.hours.toFixed(1)), id: r.id })),
      markLine: { symbol: 'none', data: [{ xAxis: Number(base.toFixed(1)), name: '基础工时' }], label: { formatter: '基础 {c}h' } },
    }],
  }
}

// 加班/欠填发散条形:正=加班(danger),负=欠填(warn);颜色按当前主题挑浅/暗镜像常量
function divergingOption(stats: EmpStat[]) {
  const rows = stats.filter((s) => s.filled).sort((a, b) => a.diff - b.diff)
  const status = pal.value
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v}h` },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows.map((r) => r.name) },
    series: [{
      type: 'bar',
      data: rows.map((r) => ({
        value: Number(r.diff.toFixed(1)),
        itemStyle: { color: r.diff >= 0 ? status.danger : status.warn },
        id: r.id,
      })),
    }],
  }
}

// 饱和度分布散点:x=实际工时,y=饱和度(百分比)。grid 留够边距+containLabel,轴名居中避免被裁。
function scatterOption(stats: EmpStat[]) {
  const pts = stats.filter((s) => s.filled && s.sat !== null).map((s) => [Number(s.hours.toFixed(1)), Number(((s.sat as number) * 100).toFixed(1)), s.name, s.id])
  return {
    tooltip: { formatter: (p: any) => `${p.value[2]}<br/>工时 ${p.value[0]}h · 饱和度 ${p.value[1]}%` },
    grid: { left: 56, right: 40, top: 30, bottom: 48, containLabel: true },
    xAxis: { type: 'value', name: '实际工时(h)', nameLocation: 'middle', nameGap: 28 },
    yAxis: { type: 'value', name: '饱和度(%)', nameLocation: 'middle', nameGap: 42 },
    series: [{ type: 'scatter', symbolSize: 10, data: pts }],
  }
}

const satTopChartOption = computed(() => satTopOption(topStats.value))
const satTopHeight = computed(() => `${Math.max(280, topStats.value.length * 32 + 96)}px`)

const divergingFilledCount = computed(() => stats.value.filter((s) => s.filled).length)
const divergingChartOption = computed(() => divergingOption(stats.value))
const divergingHeight = computed(() => `${Math.max(280, divergingFilledCount.value * 28 + 96)}px`)

const scatterPointCount = computed(() => stats.value.filter((s) => s.filled && s.sat !== null).length)
const scatterChartOption = computed(() => scatterOption(stats.value))

const empCols: DataColumn[] = [
  { key: 'id', label: '工号', width: 100 },
  { key: 'name', label: '姓名', width: 90, sortable: true },
  { key: 'l31', label: 'L3-1', width: 110, sortable: true },
  { key: 'l4', label: 'L4 组织', width: 130, sortable: true },
  { key: 'hoursText', label: '实际工时', width: 110, num: true, sortable: true },
  { key: 'baseText', label: '基础工时', width: 110, num: true },
  { key: 'satText', label: '饱和度', width: 100, num: true, sortable: true },
  { key: 'diffText', label: '差值', width: 100, num: true, sortable: true },
  { key: 'detailAction', label: '明细', width: 70, fixed: 'right' },
]

const shortCols: DataColumn[] = [
  { key: 'name', label: '姓名', width: 90 },
  { key: 'l4', label: 'L4 组织', width: 130 },
  { key: 'hoursText', label: '实际工时', width: 100, num: true },
  { key: 'diffText', label: '差值', width: 100, num: true },
]

const neverCols: DataColumn[] = [
  { key: 'id', label: '工号', width: 100 },
  { key: 'name', label: '姓名', width: 90 },
  { key: 'l31', label: 'L3-1', width: 110 },
  { key: 'l4', label: 'L4 组织', width: 130 },
]

defineExpose({
  empRows, topRows, unfilledRows, neverRows, headcountSegments,
  filtered, paged, currentPage, pageSize,
  drillEmpById, onEmpChartClick, onSegClick, scrollTo, goDetailEmp,
})
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <section class="yt-card">
        <div class="yt-head">
          <h3 class="yt-h">人数结构</h3>
          <span class="yt-sub">共 {{ stats.length }} 人</span>
        </div>
        <HealthSegmentBar :segments="headcountSegments" clickable @seg-click="onSegClick" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">饱和度 TOP10</h3>
        <div v-if="!topStats.length" class="yt-empty">无数据</div>
        <ChartBox v-else :option="satTopChartOption" :height="satTopHeight" @datapoint-click="onEmpChartClick" />
      </section>

      <section id="yt-diverging" class="yt-card">
        <h3 class="yt-h">加班 / 欠填<span class="yt-sub">（正 = 加班，负 = 欠填）</span></h3>
        <div v-if="!divergingFilledCount" class="yt-empty">无数据</div>
        <ChartBox v-else :option="divergingChartOption" :height="divergingHeight" @datapoint-click="onEmpChartClick" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">饱和度分布</h3>
        <div v-if="!scatterPointCount" class="yt-empty">无数据</div>
        <ChartBox v-else :option="scatterChartOption" height="420px" @datapoint-click="onEmpChartClick" />
      </section>

      <div class="yt-grid">
        <section class="yt-card">
          <h3 class="yt-h">饱和度 TOP10</h3>
          <DataTable :columns="shortCols" :rows="topRows" :show-count="false" />
        </section>

        <section id="yt-unfilled" class="yt-card">
          <h3 class="yt-h">未按时填写<span class="yt-sub">（有记录但工时不足）</span></h3>
          <div v-if="!unfilledRows.length" class="yt-empty">无</div>
          <DataTable v-else :columns="shortCols" :rows="unfilledRows" :show-count="false" />
        </section>

        <section id="yt-neverfilled" class="yt-card">
          <h3 class="yt-h">完全未填<span class="yt-sub">（本区间一条记录都没有）</span></h3>
          <div v-if="!neverRows.length" class="yt-empty">无</div>
          <DataTable v-else :columns="neverCols" :rows="neverRows" :show-count="false" />
        </section>
      </div>

      <section id="yt-emp" class="yt-card">
        <div class="yt-head">
          <h3 class="yt-h">员工工时明细</h3>
          <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
        </div>
        <DataTable :columns="empCols" :rows="paged" :show-count="false" sticky-header :max-height-px="560">
          <template v-for="col in empCols" :key="col.key" #[`header-${col.key}`]="{ col: c }">
            <span class="yt-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="empRows" /></span>
          </template>
          <template #cell-detailAction="{ row }">
            <el-link type="primary" :underline="false" @click.stop="goDetailEmp(row)">明细</el-link>
          </template>
        </DataTable>
        <div class="yt-pager">
          <span class="yt-total u-num">共 {{ filtered.length }} 条</span>
          <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
            :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
            layout="sizes, prev, pager, next" size="small" background />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
.yt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--gap-card); }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--gap-stack); flex-wrap: wrap; margin-bottom: var(--gap-stack); }
.yt-head .yt-h { margin-bottom: 0; }
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-sub { font-size: var(--fs-1); font-weight: 400; color: var(--mut); margin-left: var(--sp-2); }
.yt-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
.yt-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
.yt-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.yt-total { font-size: var(--fs-1); color: var(--sub); }
</style>
