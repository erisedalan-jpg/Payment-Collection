<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { weekBuckets } from '@/lib/yitian/calendar'
import { selectEntries, empStats, complianceRate, isIncluded, unfilledList, neverFilledList } from '@/lib/yitian/metrics'

const store = useYitianStore()
const view = useYitianViewStore()
const settings = useYitianSettingsStore()

onMounted(() => { store.load(); settings.load() })

const ready = computed(() => !!store.data)

/** 按周口径分桶,逐桶重算各指标。桶内区间 = [bucket.start, bucket.end],口径与总览页完全同源。 */
const series = computed(() => {
  const data = store.data
  const empty = {
    weeks: [] as string[], issues: [] as number[], okRate: [] as (number | null)[],
    hours: [] as number[], overtime: [] as number[], sat: [] as (number | null)[],
    unfilled: [] as number[], typeStack: [] as { name: string; data: number[] }[],
  }
  if (!data) return empty

  const buckets = weekBuckets(data.days, view.start, view.end, view.weekMode)
  const types = data.dims.types
  const typeAcc: Record<string, number[]> = {}
  for (const t of types) typeAcc[t] = []

  const out = { ...empty, weeks: buckets.map((b) => b.key) }
  buckets.forEach((b, bi) => {
    const es = selectEntries(data, b.start, b.end, view.l4s)
    const stats = empStats(data, b.start, b.end, view.l4s)

    out.issues.push(es.filter((e) => isIncluded(data, e, settings.settings.excludedTypes) && e.ok === 2).length)
    const r = complianceRate(data, es, settings.settings.excludedTypes)
    // 假期周(区间内零工作日)没有可检行,complianceRate 正确返回 null;
    // 推 0 会在图上画成「合规率暴跌到 0%」的假象,与 /yitian KPI 卡对同一个 null 显示 '-' 的口径不一致。
    // ECharts 对 null 默认断线,正是要的效果——不能填 0。
    out.okRate.push(r === null ? null : Number((r * 100).toFixed(1)))
    out.hours.push(Number(es.reduce((s, e) => s + e.h, 0).toFixed(1)))
    out.overtime.push(Number(stats.filter((s) => s.diff > 0).reduce((s, x) => s + x.diff, 0).toFixed(1)))

    const sumBase = stats.reduce((s, x) => s + x.base, 0)
    const sumHours = stats.reduce((s, x) => s + x.hours, 0)
    out.sat.push(sumBase > 0 ? Number(((sumHours / sumBase) * 100).toFixed(1)) : null)
    out.unfilled.push(unfilledList(stats).length + neverFilledList(stats).length)

    for (const t of types) typeAcc[t][bi] = 0
    for (const e of es) {
      const name = e.t === null || e.t === undefined ? null : types[e.t]
      if (name && typeAcc[name]) typeAcc[name][bi] += e.h
    }
  })

  out.typeStack = types.map((t) => ({
    name: t,
    data: (typeAcc[t] ?? []).map((v) => Number((v ?? 0).toFixed(1))),
  }))
  return out
})

function lineOption(name: string, data: (number | null)[], unit = '') {
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v}${unit}` },
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    xAxis: { type: 'category', data: series.value.weeks },
    yAxis: { type: 'value' },
    series: [{ name, type: 'line', smooth: true, data }],
  }
}

const charts = computed(() => [
  { title: '合规问题数趋势', option: lineOption('问题数', series.value.issues, ' 条') },
  { title: '合规率趋势', option: lineOption('合规率', series.value.okRate, '%') },
  { title: '总工时趋势', option: lineOption('总工时', series.value.hours, ' h') },
  { title: '加班工时趋势', option: lineOption('加班工时', series.value.overtime, ' h') },
  { title: '平均饱和度趋势', option: lineOption('饱和度', series.value.sat, '%') },
  { title: '未填人数趋势', option: lineOption('未填人数', series.value.unfilled, ' 人') },
  {
    title: '工时类型占比趋势',
    option: {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 48, right: 16, top: 24, bottom: 48 },
      xAxis: { type: 'category', data: series.value.weeks },
      yAxis: { type: 'value' },
      series: series.value.typeStack.map((s) => ({
        name: s.name, type: 'bar', stack: 'total', data: s.data,
      })),
    },
  },
])

defineExpose({ series })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <div v-if="ready" class="yt-grid">
      <section v-for="c in charts" :key="c.title" class="yt-card">
        <h3 class="yt-h">{{ c.title }}</h3>
        <ChartBox :option="c.option" height="280px" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); }
.yt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: var(--gap-card); }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
</style>
