<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import YitianToolbar from '@/components/YitianToolbar.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ChartBox from '@/charts/ChartBox.vue'
import RatioRing from '@/components/RatioRing.vue'
import { useYitianStore } from '@/stores/yitian'
import { useScopedYitian } from '@/composables/useScopedData'
import { useYitianViewStore } from '@/stores/yitianView'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { kpi, typeHours, orgSummary, selectEntries, orgL4SummaryRow, NO_L4 } from '@/lib/yitian/metrics'
import { buildDrillQuery } from '@/lib/yitian/drill'
import { buildDetailDrill } from '@/lib/yitian/detailDrill'

const store = useYitianStore()
const scopedYitian = useScopedYitian()
const view = useYitianViewStore()
const settings = useYitianSettingsStore()
const router = useRouter()

// 跨页下钻:总览→统计分析(带 L4/滚动锚点)、总览→合规检查(点合规率环)。
function goAnalytics(q: Record<string, string> = {}) {
  router.push({ path: '/yitian/analytics', query: q })
}
function onOrgBarClick(p: any) {
  if (p?.name) goAnalytics(buildDrillQuery({ l4: p.name }))
}
function onOrgRow(row: any) {
  if (row?.name) goAnalytics(buildDrillQuery({ l4: row.name }))
}
function onKpiClick(i: number) {
  const kk = metrics.value[i]?.k ?? ''
  if (kk.includes('未填')) goAnalytics(buildDrillQuery({ scroll: 'neverfilled' }))
  else if (kk.includes('加班')) goAnalytics(buildDrillQuery({ scroll: 'diverging' }))
  else goAnalytics()
}
function goCompliance() {
  router.push('/yitian/compliance')
}
function goDetailL4(row: { name: string }) {
  if (row?.name) router.push({ path: '/yitian/detail', query: buildDetailDrill({ l4: row.name }) })
}

onMounted(() => { store.load(); settings.load() })

const ready = computed(() => !!store.data)

const k = computed(() => (scopedYitian.value
  ? kpi(scopedYitian.value, view.start, view.end, view.l4s, settings.settings.excludedTypes)
  : null))

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '-' : (v * 100).toFixed(1) + '%'
}
function hrs(v: number): string {
  return v.toFixed(1)
}

// 顶部 KPI 带:4 项文本卡走 MetricGrid;「合规率」值域天然 0-1,改用 RatioRing 单独一卡(见下)。
const metrics = computed(() => {
  const x = k.value
  if (!x) return []
  return [
    { k: '总工时', v: hrs(x.totalHours), sub: `人均基础 ${x.baseHours}h`, clickable: true },
    { k: '平均饱和度', v: pct(x.avgSat), sub: `补全后 ${pct(x.avgSatFilled)}`, clickable: true },
    { k: '未填人数', v: String(x.unfilledCount), sub: `其中一条未填 ${x.neverFilledCount} 人`,
      cls: x.unfilledCount > 0 ? 'danger' : undefined, clickable: true },
    { k: '加班人数', v: String(x.overtimeCount), sub: `累计 ${hrs(x.overtimeHours)}h`, clickable: true },
  ]
})
const complianceRatio = computed(() => k.value?.complianceRate ?? null)
const complianceIssueCount = computed(() => k.value?.issueCount ?? 0)
// 合规率环按阈值上色(与合规页同口径):≥90% 达标绿,<90% 警示黄,null 交给 RatioRing 默认(mut)。
const complianceRingColor = computed(() => {
  const r = complianceRatio.value
  return r == null ? undefined : (r >= 0.9 ? 'var(--ok)' : 'var(--warn)')
})

const typeRows = computed(() =>
  scopedYitian.value ? typeHours(scopedYitian.value, selectEntries(scopedYitian.value, view.start, view.end, view.l4s)) : [])

const typeOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    data: typeRows.value.map((t) => ({ name: t.type, value: Number(t.hours.toFixed(1)) })),
    label: { formatter: '{b} {d}%' },
  }],
}))

const orgCols: DataColumn[] = [
  { key: 'name', label: 'L4 组织', width: 160, sortable: true },
  { key: 'parent', label: '上级组织', width: 140, sortable: true },
  { key: 'people', label: '人数', width: 90, num: true, sortable: true },
  { key: 'hoursText', label: '实际工时', width: 110, num: true, sortable: true },
  { key: 'baseText', label: '基础工时', width: 110, num: true },
  { key: 'satText', label: '饱和度', width: 110, num: true, sortable: true },
  { key: 'detailAction', label: '明细', width: 70, fixed: 'right' },
]

// 只展示 L4 层,并剔除「未分配L4」(花名册里 L4 为空的部门负责人)。
// 合计行同样只统计这里的可见行 —— 表里看到什么,合计就是什么之和,不会对不上。
const l4Rows = computed(() =>
  scopedYitian.value
    ? orgSummary(scopedYitian.value, view.start, view.end, view.l4s)
        .filter((r) => r.level === 'l4' && r.name !== NO_L4)
    : [])

const orgRows = computed(() => l4Rows.value.map((r) => ({
  ...r,
  hoursText: hrs(r.hours),
  baseText: hrs(r.base),
  satText: pct(r.sat),
})))

/** L4 组织工时:实际 vs 基础分组柱,与「分层汇总」表同源(l4Rows,已剔除未分配L4)。
 *  横向柱自下而上,按实际工时升序排列读得顺。 */
function orgBarOption(l4RowsIn: { name: string; hours: number; base: number }[]) {
  const rows = [...l4RowsIn].sort((a, b) => a.hours - b.hours)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0 },
    grid: { left: 8, right: 24, top: 16, bottom: 40, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows.map((r) => r.name) },
    series: [
      { name: '实际工时', type: 'bar', data: rows.map((r) => Number(r.hours.toFixed(1))) },
      { name: '基础工时', type: 'bar', data: rows.map((r) => Number(r.base.toFixed(1))) },
    ],
  }
}
const orgBarChartOption = computed(() => orgBarOption(l4Rows.value))
// L4 多时按行数放大高度,少时不小于 360px。
const orgBarHeight = computed(() => `${Math.max(360, l4Rows.value.length * 32 + 96)}px`)

/** 固定汇总行(el-table 原生 show-summary,恒在表底、不随排序移动)。 */
function orgSummaryMethod({ columns }: { columns: { property: string }[] }): string[] {
  const t = orgL4SummaryRow(l4Rows.value)
  const disp: Record<string, string> = {
    name: '合计',
    parent: '',
    people: String(t.people),
    hoursText: hrs(t.hours),
    baseText: hrs(t.base),
    satText: pct(t.sat),
  }
  return columns.map((c) => disp[c.property] ?? '')
}

defineExpose({ typeOption, typeRows, orgRows, orgSummaryMethod, orgBarChartOption, complianceRatio, complianceIssueCount, complianceRingColor, metrics, onOrgBarClick, onOrgRow, onKpiClick, goCompliance, goDetailL4 })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <div class="yt-kpi-row">
        <MetricGrid :items="metrics" col-min="180px" class="yt-kpi-grid" @item-click="onKpiClick" />
        <div class="yt-ring-card u-lift u-focus-ring" tabindex="0" role="button"
          @click="goCompliance" @keydown.enter.prevent="goCompliance" @keydown.space.prevent="goCompliance">
          <RatioRing :ratio="complianceRatio" label="合规率" :size="96" :color="complianceRingColor" />
          <div class="yt-ring-sub u-num">问题 {{ complianceIssueCount }} 条</div>
        </div>
      </div>

      <div class="yt-grid">
        <section class="yt-card">
          <h3 class="yt-h">工时类型占比</h3>
          <ChartBox :option="typeOption" height="300px" />
        </section>

        <section class="yt-card">
          <h3 class="yt-h">L4 组织工时</h3>
          <ChartBox :option="orgBarChartOption" :height="orgBarHeight" @datapoint-click="onOrgBarClick" />
          <h3 class="yt-h yt-h--sub">分层汇总</h3>
          <DataTable :columns="orgCols" :rows="orgRows" :show-count="false" clickable
            :show-summary="true" :summary-method="orgSummaryMethod" @row-click="onOrgRow">
            <template #cell-detailAction="{ row }">
              <el-link type="primary" :underline="false" @click.stop="goDetailL4(row)">明细</el-link>
            </template>
          </DataTable>
        </section>
      </div>
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
  min-width: 180px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--card-pad);
  cursor: pointer;
}
.yt-ring-sub { font-size: var(--fs-1); color: var(--mut); }
.yt-grid { display: grid; grid-template-columns: minmax(320px, 1fr) minmax(480px, 2fr); gap: var(--gap-card); }
@media (max-width: 1200px) { .yt-grid { grid-template-columns: 1fr; } }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-h--sub { margin-top: var(--gap-card); }
</style>
