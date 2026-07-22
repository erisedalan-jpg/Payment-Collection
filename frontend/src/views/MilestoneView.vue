<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDataStore } from '@/stores/data'
import { useScopedProjects } from '@/composables/useScopedData'
import { useFilterStore } from '@/stores/filter'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useSettingsStore } from '@/stores/settings'
import type { Project, ProjectPmis, MilestoneItem } from '@/types/analysis'
import {
  buildMilestoneProjects, statusKpis,
  reminderBuckets, deptAbnormalTop15, deptComplianceRate,
  finalAcceptStats, availableYears, nodeDistribution, nodesForDrill,
  milestoneProjectsByStatus,
  type DistSeries, type MilestoneDrillRow, type MilestoneStatus, type MilestoneStatusRow,
} from '@/lib/milestoneAnalytics'
import { STATUS_LIGHT, STATUS_DARK, MUTED_LIGHT, MUTED_DARK, CHART_LIGHT, CHART_DARK } from '@/charts/echartsTheme'
import MetricGrid from '@/components/MetricGrid.vue'
import ChartBox from '@/charts/ChartBox.vue'
import SegToggle from '@/components/SegToggle.vue'
import TagFilterSelect from '@/components/TagFilterSelect.vue'
import MilestoneDrillModal from '@/components/MilestoneDrillModal.vue'
import MilestoneStatusModal from '@/components/MilestoneStatusModal.vue'
import MilestoneDelayedTab from '@/components/MilestoneDelayedTab.vue'
import MilestoneReminderTab from '@/components/MilestoneReminderTab.vue'
import MilestonePlanTab from '@/components/MilestonePlanTab.vue'
import { tagMatch } from '@/lib/tagFilter'
import { useDeferredMount } from '@/lib/useDeferredMount'
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'

defineOptions({ name: 'MilestoneView' })
useViewScrollMemory()

const data = useDataStore()
const scoped = useScopedProjects()
const filter = useFilterStore()
const projectTags = useProjectTagsStore()
const settings = useSettingsStore()
// 延迟渲染:点击进页先出标题/工具栏/KPI,下一两帧再挂 6 图 + 明细 tab,消除跨页点击冻结。
const { ready } = useDeferredMount()

onMounted(() => {
  if (!data.data) data.load()
  if (!projectTags.loaded) projectTags.load()
})

const dark = computed(() => settings.theme === 'dark')
const sc = computed(() => (dark.value ? STATUS_DARK : STATUS_LIGHT))
const muted = computed(() => (dark.value ? MUTED_DARK : MUTED_LIGHT))

// 域：主域 ∩ 全局标签剔除
const mps = computed(() => buildMilestoneProjects(
  (scoped.value?.projects ?? []) as Project[],
  (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
  (scoped.value?.projectMilestones ?? {}) as Record<string, MilestoneItem[]>,
  { excludeOn: filter.excludeOn, excludedIds: filter.excludedIds },
))

// 剔除控件（镜像 /data：开关 + 标签多选，写 filter.setExclude，全局持久化）
const excludeOn = computed({ get: () => filter.excludeOn, set: (v: boolean) => filter.setExclude(v, filter.excludeTags) })
const excludeTags = computed({ get: () => filter.excludeTags, set: (v: string[]) => filter.setExclude(filter.excludeOn, v) })

// 下方三表标签筛选（含无标签）：仅作用于三表，不影响 KPI/6 图（均仍读 mps）
const selectedTags = ref<string[]>([])
const mpsFiltered = computed(() => mps.value.filter((m) => tagMatch(projectTags.tagsOf(m.projectId), selectedTags.value)))

// KPI
const kpi = computed(() => statusKpis(mps.value))
const kpiItems = computed(() => {
  const k = kpi.value
  const p = (n: number) => (k.total > 0 ? (n / k.total * 100).toFixed(1) + '%' : '-')
  return [
    { k: '项目总数', v: String(k.total), clickable: true },
    { k: '正常', v: String(k.normal), sub: p(k.normal), cls: 'ok', clickable: true },
    { k: '延期', v: String(k.delayed), sub: p(k.delayed), cls: 'warn', clickable: true },
    { k: '严重延期', v: String(k.severe), sub: p(k.severe), cls: 'danger', clickable: true },
    { k: '未发布', v: String(k.unpublished), sub: p(k.unpublished), cls: 'mut', clickable: true },
  ]
})

const dataLabel = { show: true, formatter: (p: any) => p.value || '' }

// A 到期提醒（横向堆叠条）
const reminderOption = computed(() => {
  const w = reminderBuckets(mps.value, new Date()).windows
  const keys = ['7d', '30d', 'quarter'] as const
  const s = sc.value
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['高优先级', '中优先级', '低优先级'], bottom: 0 },
    grid: { left: 80, right: 20, top: 10, bottom: 40 },
    xAxis: { type: 'value', name: '节点数' },
    yAxis: { type: 'category', data: ['未来7天', '未来30天', '本季度'] },
    series: [
      { name: '高优先级', type: 'bar', stack: 't', color: s.danger, label: dataLabel, data: keys.map((k) => w[k].high) },
      { name: '中优先级', type: 'bar', stack: 't', color: s.warn, label: dataLabel, data: keys.map((k) => w[k].mid) },
      { name: '低优先级', type: 'bar', stack: 't', color: s.ok, label: dataLabel, data: keys.map((k) => w[k].low) },
    ],
  }
})

// C/D 部门（同序 Top15）
function wrapDept(s: string): string { return s.replace(/(服务组|一部|二部|三部|四部)/, '\n$1') }
const deptTop = computed(() => deptAbnormalTop15(mps.value))
const deptOrder = computed(() => deptTop.value.map((d) => d.orgL4))
const deptAbnormalOption = computed(() => {
  const d = deptTop.value, s = sc.value
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['延期', '严重延期', '未发布'], bottom: 0 },
    grid: { left: 56, right: 20, top: 10, bottom: 70 },
    xAxis: { type: 'category', data: d.map((x) => wrapDept(x.orgL4)), axisLabel: { interval: 0, fontSize: 11 } },
    yAxis: { type: 'value', name: '异常项目数', nameLocation: 'middle', nameGap: 38, nameRotate: 90 },
    series: [
      { name: '延期', type: 'bar', stack: 'ab', color: s.warn, label: dataLabel, data: d.map((x) => x.delayed) },
      { name: '严重延期', type: 'bar', stack: 'ab', color: s.danger, label: dataLabel, data: d.map((x) => x.severe) },
      { name: '未发布', type: 'bar', stack: 'ab', color: muted.value, label: dataLabel, data: d.map((x) => x.unpublished) },
    ],
  }
})
const complianceOption = computed(() => {
  const c = deptComplianceRate(mps.value, deptOrder.value), s = sc.value
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 20, top: 20, bottom: 70 },
    xAxis: { type: 'category', data: c.map((x) => wrapDept(x.orgL4)), axisLabel: { interval: 0, fontSize: 11 } },
    yAxis: { type: 'value', name: '合规率(%)', min: 0, max: 100, nameLocation: 'middle', nameGap: 40, nameRotate: 90 },
    series: [{
      name: '里程碑合规率', type: 'line', smooth: true, color: s.ok, areaStyle: { opacity: 0.08 },
      label: { show: true, formatter: (p: any) => p.value + '%', color: (p: any) => (p.value < 100 ? s.danger : s.ok) },
      labelLayout: { moveOverlap: 'shiftY' },
      data: c.map((x) => x.rate),
    }],
  }
})

const chart = computed(() => (dark.value ? CHART_DARK : CHART_LIGHT))
const topLabel = { show: true, position: 'top', formatter: (p: any) => p.value || '' }

// B 终验完成情况（双图：项目数 + 金额万元）
const faGran = ref<'quarter' | 'month'>('quarter')
const faYear = ref<number | null>(null)
const GRAN_OPTS = [{ value: 'quarter', label: '按季度' }, { value: 'month', label: '按月度' }]
const faYearOpts = computed(() => availableYears(mps.value, 'finalAccept'))
const fa = computed(() => finalAcceptStats(mps.value, faGran.value, faYear.value))
const faCountOption = computed(() => {
  const c = chart.value
  return {
    tooltip: { trigger: 'axis' }, legend: { data: ['计划项目数', '实际完成数'], bottom: 0 },
    grid: { left: 56, right: 20, top: 10, bottom: 40 },
    xAxis: { type: 'category', data: fa.value.periods }, yAxis: { type: 'value', name: '项目数', nameLocation: 'middle', nameGap: 36, nameRotate: 90 },
    series: [
      { name: '计划项目数', type: 'bar', barWidth: '40%', color: c[5], label: topLabel, data: fa.value.planCount },
      { name: '实际完成数', type: 'bar', barWidth: '22%', barGap: '-55%', color: c[2], label: topLabel, data: fa.value.actualCount },
    ],
  }
})
const faAmountOption = computed(() => {
  const c = chart.value
  return {
    tooltip: { trigger: 'axis' }, legend: { data: ['计划金额', '实际完成金额'], bottom: 0 },
    grid: { left: 56, right: 20, top: 10, bottom: 40 },
    xAxis: { type: 'category', data: fa.value.periods }, yAxis: { type: 'value', name: '金额(万)', nameLocation: 'middle', nameGap: 38, nameRotate: 90 },
    series: [
      { name: '计划金额', type: 'bar', barWidth: '40%', color: c[3], label: topLabel, data: fa.value.planAmountWan },
      { name: '实际完成金额', type: 'bar', barWidth: '22%', barGap: '-55%', color: c[1], label: topLabel, data: fa.value.actualAmountWan },
    ],
  }
})

// E 关键节点分布（多线按月，年份过滤，点击下钻）
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const SERIES_KEY: Record<string, DistSeries> = {
  '到货(关联回款)': 'arrival', '初验(关联回款)': 'firstAccept', '终验': 'finalAccept', '服务完成': 'serviceDone',
}
const nodeYear = ref<number | null>(null)
const nodeYearOpts = computed(() => availableYears(mps.value, 'node'))
// 默认当年(缺则取最新可用年);仅首次自动设,用户清空/改选后不覆盖
watch(nodeYearOpts, (opts) => {
  if (nodeYear.value != null || !opts.length) return
  const cur = new Date().getFullYear()
  nodeYear.value = opts.includes(cur) ? cur : opts[opts.length - 1]
}, { immediate: true })
const nd = computed(() => nodeDistribution(mps.value, nodeYear.value))
const lineLabel = { show: true, formatter: (p: any) => p.value || '', }
const nodeDistOption = computed(() => {
  const c = chart.value, s = sc.value
  const line = (name: string, color: string, d: number[]) => ({ name, type: 'line', smooth: true, color, label: lineLabel, labelLayout: { moveOverlap: 'shiftY' }, data: d })
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['到货(关联回款)', '初验(关联回款)', '终验', '服务完成'], bottom: 0 },
    grid: { left: 56, right: 20, top: 10, bottom: 50 },
    xAxis: { type: 'category', data: MONTH_LABELS }, yAxis: { type: 'value', name: '节点数', nameLocation: 'middle', nameGap: 36, nameRotate: 90 },
    series: [
      line('到货(关联回款)', c[0], nd.value.arrival),
      line('初验(关联回款)', c[2], nd.value.firstAccept),
      line('终验', s.warn, nd.value.finalAccept),
      line('服务完成', s.danger, nd.value.serviceDone),
    ],
  }
})

const drillOpen = ref(false)
const drillTitle = ref('')
const drillRows = ref<MilestoneDrillRow[]>([])

const KPI_STATUS: (MilestoneStatus | null)[] = [null, '正常', '延期', '严重延期', '未发布']
const statusOpen = ref(false)
const statusTitle = ref('')
const statusRows = ref<MilestoneStatusRow[]>([])
function onKpiClick(i: number) {
  statusRows.value = milestoneProjectsByStatus(mps.value, KPI_STATUS[i])
  statusTitle.value = kpiItems.value[i].k
  statusOpen.value = true
}
function onNodeClick(params: any) {
  const key = SERIES_KEY[params?.seriesName]
  if (!key) return
  drillRows.value = nodesForDrill(mps.value, key, params.dataIndex, nodeYear.value)
  drillTitle.value = `${params.seriesName} · ${MONTH_LABELS[params.dataIndex]}`
  drillOpen.value = true
}
const now = new Date()
const detailTab = ref<'delayed' | 'reminder' | 'plan'>('delayed')
const DETAIL_TABS = [
  { value: 'delayed', label: '延期项目清单' },
  { value: 'reminder', label: '到期提醒' },
  { value: 'plan', label: '在建里程碑计划' },
]
defineExpose({ faGran, onNodeClick, nodeYear, mps, mpsFiltered, selectedTags })
</script>

<template>
  <div class="mv-view">
    <h2 class="mv-title">里程碑管理</h2>

    <div class="mv-toolbar">
      <span class="mv-ex-label">按标签排除</span>
      <el-switch data-test="ms-exclude-switch" v-model="excludeOn" />
      <el-select v-model="excludeTags" size="small" multiple collapse-tags clearable placeholder="选要排除的标签" style="width: 220px">
        <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
      </el-select>
    </div>

    <div v-if="!mps.length" class="mv-empty">暂无主域里程碑数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>

    <template v-else>
      <MetricGrid :items="kpiItems" @item-click="onKpiClick" />

      <div v-if="!ready" class="mv-defer"><el-skeleton :rows="10" animated /></div>
      <template v-else>
      <div class="mv-card">
        <div class="mv-card-h">
          项目终验完成情况
          <span class="mv-card-tools">
            <el-select v-model="faYear" size="small" clearable placeholder="全部年份" style="width: 120px">
              <el-option v-for="y in faYearOpts" :key="y" :value="y" :label="y + '年'" />
            </el-select>
            <SegToggle v-model="faGran" :options="GRAN_OPTS" />
          </span>
        </div>
        <div class="mv-grid2-half">
          <ChartBox :option="faCountOption" height="240px" />
          <ChartBox :option="faAmountOption" height="240px" />
        </div>
      </div>

      <div class="mv-grid2">
        <div class="mv-card"><div class="mv-card-h">里程碑到期提醒</div><ChartBox :option="reminderOption" height="300px" /></div>
        <div class="mv-card"><div class="mv-card-h">部门异常项目分布(Top15)</div><ChartBox :option="deptAbnormalOption" height="300px" /></div>
        <div class="mv-card"><div class="mv-card-h">部门里程碑合规率</div><ChartBox :option="complianceOption" height="300px" /></div>
      </div>

      <div class="mv-card">
        <div class="mv-card-h">
          关键里程碑节点分布
          <span class="mv-card-tools">
            <el-select v-model="nodeYear" size="small" clearable placeholder="全部年份" style="width: 120px">
              <el-option v-for="y in nodeYearOpts" :key="y" :value="y" :label="y + '年'" />
            </el-select>
          </span>
        </div>
        <ChartBox :option="nodeDistOption" height="280px" @datapoint-click="onNodeClick" />
      </div>

      <MilestoneDrillModal v-model="drillOpen" :title="drillTitle" :rows="drillRows" />
      <MilestoneStatusModal v-model="statusOpen" :title="statusTitle" :rows="statusRows" />

      <div class="mv-detail">
        <div class="mv-detail-tools">
          <SegToggle v-model="detailTab" :options="DETAIL_TABS" />
          <TagFilterSelect v-model="selectedTags" />
        </div>
        <MilestoneDelayedTab v-if="detailTab === 'delayed'" :projects="mpsFiltered" :now="now" />
        <MilestoneReminderTab v-else-if="detailTab === 'reminder'" :projects="mpsFiltered" :now="now" />
        <MilestonePlanTab v-else :projects="mpsFiltered" />
      </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.mv-view { padding: var(--sp-4); }
.mv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.mv-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mv-ex-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.mv-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: var(--gap-card); }
.mv-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3); margin-bottom: var(--sp-3); }
.mv-card-h { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-2); }
.mv-card-tools { display: inline-flex; align-items: center; gap: var(--sp-2); }
.mv-grid2-half { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-card); }
.mv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.mv-defer { padding: var(--sp-4); background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); min-height: 360px; }
.mv-detail { margin-top: var(--sp-4); }
.mv-detail-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--sp-2); margin-bottom: var(--sp-3); }
</style>
