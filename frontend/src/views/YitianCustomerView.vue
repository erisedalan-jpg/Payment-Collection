<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { top1000ByL4, bgSupport, top1000TotalsRow, topCustomers, bgSupportByL4 } from '@/lib/yitian/customer'
import { NO_L4 } from '@/lib/yitian/metrics'

const store = useYitianStore()
const view = useYitianViewStore()

onMounted(() => { store.load() })

const ready = computed(() => !!store.data)

function hrs(v: number): string {
  return v.toFixed(1)
}
function pct(v: number): string {
  return (v * 100).toFixed(1) + '%'
}

const topRowsRaw = computed(() => {
  if (!store.data) return []
  // 去掉「未分配L4」行(部门负责人,无客户支持归属)
  return top1000ByL4(store.data, view.start, view.end, view.l4s).filter((r) => r.l4 !== NO_L4)
})

const topRows = computed(() => topRowsRaw.value.map((r) => ({
  ...r, hoursText: hrs(r.hours), topHoursText: hrs(r.topHours), pctText: pct(r.pct),
})))

// TOP1000 vs 其余:各 L4 横向堆叠柱
function top1000StackOption(rows: { l4: string; hours: number; topHours: number }[]) {
  const rs = [...rows].sort((a, b) => a.hours - b.hours)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0 },
    grid: { left: 8, right: 24, top: 8, bottom: 40, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rs.map((r) => r.l4) },
    series: [
      { name: 'TOP1000', type: 'bar', stack: 'x', data: rs.map((r) => Number(r.topHours.toFixed(1))) },
      { name: '其余客户', type: 'bar', stack: 'x', data: rs.map((r) => Number((r.hours - r.topHours).toFixed(1))) },
    ],
  }
}

// TOP 客户排行:横向柱
function topCustOption(list: { name: string; hours: number }[]) {
  const rs = [...list].sort((a, b) => a.hours - b.hours)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v}h` },
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rs.map((r) => r.name) },
    series: [{ type: 'bar', data: rs.map((r) => Number(r.hours.toFixed(1))) }],
  }
}

const top1000ChartOption = computed(() => top1000StackOption(topRowsRaw.value))
const top1000Height = computed(() => `${Math.max(240, topRowsRaw.value.length * 36 + 80)}px`)

const topCols: DataColumn[] = [
  { key: 'l4', label: 'L4 组织', width: 150 },
  { key: 'hoursText', label: '客户类总工时', width: 130, num: true, sortable: true },
  { key: 'topHoursText', label: 'TOP1000 工时', width: 130, num: true, sortable: true },
  { key: 'pctText', label: 'TOP1000 占比', width: 130, num: true, sortable: true },
  { key: 'topCustomers', label: 'TOP1000 客户数', width: 140, num: true, sortable: true },
]

function topSummaryMethod({ columns }: { columns: { property: string }[] }): string[] {
  if (!store.data) return columns.map(() => '')
  const t = top1000TotalsRow(store.data, view.start, view.end, view.l4s, topRowsRaw.value)
  const disp: Record<string, string> = {
    l4: '合计',
    hoursText: hrs(t.hours),
    topHoursText: hrs(t.topHours),
    pctText: pct(t.pct),
    topCustomers: String(t.topCustomers),
  }
  return columns.map((c) => disp[c.property] ?? '')
}

const bg = computed(() =>
  store.data ? bgSupport(store.data, view.start, view.end, view.l4s)
             : { thisBg: 0, crossBg: 0, thisPct: 0, crossPct: 0, total: 0 })

const bgMetrics = computed(() => [
  { k: '本 BG 工时', v: hrs(bg.value.thisBg), sub: pct(bg.value.thisPct) },
  { k: '跨 BG 工时', v: hrs(bg.value.crossBg), sub: pct(bg.value.crossPct), cls: 'warn' },
  { k: '合计（项目类+售前类）', v: hrs(bg.value.total) },
])

const bgOption = computed(() => ({
  tooltip: { trigger: 'item', valueFormatter: (v: number) => `${v} h` },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    data: [
      { name: '本 BG', value: Number(bg.value.thisBg.toFixed(1)) },
      { name: '跨 BG', value: Number(bg.value.crossBg.toFixed(1)) },
    ],
    label: { formatter: '{b} {d}%' },
  }],
}))

// 本/跨 BG × L4 分组柱:与 bgSupport 同口径(仅项目类/售前类工时),按 L4 拆分;
// 未分配 L4(部门负责人)与 TOP1000 表一致予以剔除。聚合逻辑下沉到 lib/yitian/customer.ts(bgSupportByL4)。
const bgByL4Rows = computed(() =>
  store.data ? bgSupportByL4(store.data, view.start, view.end, view.l4s) : [])

function bgByL4Option(rows: { l4: string; thisBg: number; crossBg: number }[]) {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v}h` },
    legend: { bottom: 0 },
    grid: { left: 8, right: 24, top: 8, bottom: 40, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows.map((r) => r.l4) },
    series: [
      { name: '本 BG', type: 'bar', data: rows.map((r) => Number(r.thisBg.toFixed(1))) },
      { name: '跨 BG', type: 'bar', data: rows.map((r) => Number(r.crossBg.toFixed(1))) },
    ],
  }
}

const bgByL4ChartOption = computed(() => bgByL4Option(bgByL4Rows.value))
const bgByL4Height = computed(() => `${Math.max(240, bgByL4Rows.value.length * 36 + 80)}px`)

// TOP 客户排行
const topCustList = computed(() =>
  store.data ? topCustomers(store.data, view.start, view.end, view.l4s, 10) : [])
const topCustChartOption = computed(() => topCustOption(topCustList.value))
const topCustHeight = computed(() => `${Math.max(240, topCustList.value.length * 28 + 96)}px`)

defineExpose({ topRows, bg, topCustList, bgByL4Rows })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <section class="yt-card">
        <h3 class="yt-h">TOP1000 大客户支持</h3>
        <p class="yt-note">仅统计项目类 / 售前类 / 售后类工时；客户数按客户去重。</p>
        <div v-if="!topRowsRaw.length" class="yt-empty">无数据</div>
        <ChartBox v-else :option="top1000ChartOption" :height="top1000Height" />
        <DataTable :columns="topCols" :rows="topRows" :show-count="false"
          :show-summary="true" :summary-method="topSummaryMethod" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">跨 BG 支持</h3>
        <p class="yt-note">仅统计项目类 / 售前类工时；本 BG 按销售 L2 组织判定。</p>
        <MetricGrid :items="bgMetrics" col-min="200px" />
        <div class="yt-grid">
          <ChartBox :option="bgOption" height="280px" />
          <div v-if="!bgByL4Rows.length" class="yt-empty">无数据</div>
          <ChartBox v-else :option="bgByL4ChartOption" :height="bgByL4Height" />
        </div>
      </section>

      <section class="yt-card">
        <h3 class="yt-h">TOP 客户排行</h3>
        <p class="yt-note">按客户汇总工时（不限工时类型，只看挂了客户的记录），取前 10。</p>
        <div v-if="!topCustList.length" class="yt-empty">无数据</div>
        <ChartBox v-else :option="topCustChartOption" :height="topCustHeight" />
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
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-note { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--gap-stack); }
.yt-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
</style>
