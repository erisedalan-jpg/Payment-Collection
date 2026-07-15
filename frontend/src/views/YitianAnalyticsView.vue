<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ChartBox from '@/charts/ChartBox.vue'
import HealthSegmentBar from '@/components/HealthSegmentBar.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { empStats, saturationTop, unfilledList, neverFilledList, type EmpStat } from '@/lib/yitian/metrics'
import { STATUS_LIGHT } from '@/charts/echartsTheme'

const store = useYitianStore()
const view = useYitianViewStore()

onMounted(() => { store.load() })

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
  store.data ? empStats(store.data, view.start, view.end, view.l4s) : [])

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
      type: 'bar', data: rows.map((r) => Number(r.hours.toFixed(1))),
      markLine: { symbol: 'none', data: [{ xAxis: Number(base.toFixed(1)), name: '基础工时' }], label: { formatter: '基础 {c}h' } },
    }],
  }
}

// 加班/欠填发散条形:正=加班(danger),负=欠填(warn)
function divergingOption(stats: EmpStat[]) {
  const rows = stats.filter((s) => s.filled).sort((a, b) => a.diff - b.diff)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v}h` },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows.map((r) => r.name) },
    series: [{
      type: 'bar',
      data: rows.map((r) => ({
        value: Number(r.diff.toFixed(1)),
        itemStyle: { color: r.diff >= 0 ? STATUS_LIGHT.danger : STATUS_LIGHT.warn },
      })),
    }],
  }
}

// 饱和度分布散点:x=实际工时,y=饱和度(百分比)
function scatterOption(stats: EmpStat[]) {
  const pts = stats.filter((s) => s.filled && s.sat !== null).map((s) => [Number(s.hours.toFixed(1)), Number(((s.sat as number) * 100).toFixed(1)), s.name])
  return {
    tooltip: { formatter: (p: any) => `${p.value[2]}<br/>工时 ${p.value[0]}h · 饱和度 ${p.value[1]}%` },
    grid: { left: 48, right: 24, top: 16, bottom: 40 },
    xAxis: { type: 'value', name: '实际工时(h)' },
    yAxis: { type: 'value', name: '饱和度(%)' },
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

defineExpose({ empRows, topRows, unfilledRows, neverRows, headcountSegments })
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
        <HealthSegmentBar :segments="headcountSegments" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">饱和度 TOP10</h3>
        <div v-if="!topStats.length" class="yt-empty">无数据</div>
        <ChartBox v-else :option="satTopChartOption" :height="satTopHeight" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">加班 / 欠填<span class="yt-sub">（正 = 加班，负 = 欠填）</span></h3>
        <div v-if="!divergingFilledCount" class="yt-empty">无数据</div>
        <ChartBox v-else :option="divergingChartOption" :height="divergingHeight" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">饱和度分布</h3>
        <div v-if="!scatterPointCount" class="yt-empty">无数据</div>
        <ChartBox v-else :option="scatterChartOption" height="420px" />
      </section>

      <div class="yt-grid">
        <section class="yt-card">
          <h3 class="yt-h">饱和度 TOP10</h3>
          <DataTable :columns="shortCols" :rows="topRows" :show-count="false" />
        </section>

        <section class="yt-card">
          <h3 class="yt-h">未按时填写<span class="yt-sub">（有记录但工时不足）</span></h3>
          <div v-if="!unfilledRows.length" class="yt-empty">无</div>
          <DataTable v-else :columns="shortCols" :rows="unfilledRows" :show-count="false" />
        </section>

        <section class="yt-card">
          <h3 class="yt-h">完全未填<span class="yt-sub">（本区间一条记录都没有）</span></h3>
          <div v-if="!neverRows.length" class="yt-empty">无</div>
          <DataTable v-else :columns="neverCols" :rows="neverRows" :show-count="false" />
        </section>
      </div>

      <section class="yt-card">
        <h3 class="yt-h">员工工时明细</h3>
        <DataTable :columns="empCols" :rows="empRows" sticky-header />
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
</style>
