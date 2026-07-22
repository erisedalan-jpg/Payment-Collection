<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import YitianToolbar from '@/components/YitianToolbar.vue'
import SegToggle from '@/components/SegToggle.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useYitianStore } from '@/stores/yitian'
import { useScopedYitian } from '@/composables/useScopedData'
import { useYitianViewStore } from '@/stores/yitianView'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { weekBuckets, monthBuckets, quarterBuckets, type WeekBucket } from '@/lib/yitian/calendar'
import { selectEntries, empStats, complianceRate, isIncluded, unfilledList, neverFilledList } from '@/lib/yitian/metrics'
import { buildDrillQuery } from '@/lib/yitian/drill'

const store = useYitianStore()
const scopedYitian = useScopedYitian()
const view = useYitianViewStore()
const settings = useYitianSettingsStore()
const router = useRouter()

onMounted(() => { store.load(); settings.load() })

const ready = computed(() => !!store.data)

/** 趋势粒度:局部 ref,不入 store——只影响本页分桶,不影响其他页的周口径(calc/iso 仍走 view.weekMode)。 */
const gran = ref<'week' | 'month' | 'quarter'>('week')
const GRAN_OPTS = [
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季' },
]

/** 当前粒度(周/月/季)的分桶列表——趋势图 X 轴与「桶 key → 起止日期」下钻查找的唯一同源。 */
const bucketsList = computed<WeekBucket[]>(() => {
  const data = store.data
  if (!data) return []
  return gran.value === 'month' ? monthBuckets(data.days, view.start, view.end)
    : gran.value === 'quarter' ? quarterBuckets(data.days, view.start, view.end)
    : weekBuckets(data.days, view.start, view.end, view.weekMode)
})

/** 按 gran(周/月/季)分桶,逐桶重算各指标。桶内区间 = [bucket.start, bucket.end],口径与总览页完全同源。 */
const series = computed(() => {
  const data = scopedYitian.value
  const empty = {
    weeks: [] as string[], issues: [] as number[], okRate: [] as (number | null)[],
    hours: [] as number[], overtime: [] as number[], sat: [] as (number | null)[],
    unfilled: [] as number[], typeStack: [] as { name: string; data: number[] }[],
  }
  if (!data) return empty

  const buckets = bucketsList.value
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

  out.typeStack = types.map((t: string) => ({
    name: t,
    data: (typeAcc[t] ?? []).map((v: number) => Number((v ?? 0).toFixed(1))),
  }))
  return out
})

/** 单指标折线:加均值线/峰谷标记/缩放条。markLine/markPoint 不显式设色,继承系列色以保证暗色正确。 */
function lineOption(name: string, data: (number | null)[], unit = '') {
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v}${unit}` },
    grid: { left: 48, right: 16, top: 24, bottom: 56 },
    xAxis: { type: 'category', data: series.value.weeks },
    yAxis: { type: 'value' },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 20 }],
    series: [{
      name, type: 'line', smooth: true, data,
      markPoint: { data: [{ type: 'max', name: '峰' }, { type: 'min', name: '谷' }], symbolSize: 36 },
      markLine: { symbol: 'none', data: [{ type: 'average', name: '均值' }] },
    }],
  }
}

/** 总工时 + 合规率合成双轴(减一张卡)。合规率轴锁 0~100%,两指标量纲不同不能共轴。 */
const hoursOkRateOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { bottom: 0 },
  grid: { left: 48, right: 48, top: 24, bottom: 56 },
  xAxis: { type: 'category', data: series.value.weeks },
  yAxis: [{ type: 'value', name: 'h' }, { type: 'value', name: '%', max: 100 }],
  dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 20 }],
  series: [
    { name: '总工时', type: 'line', smooth: true, yAxisIndex: 0, data: series.value.hours },
    // connectNulls:false——假期桶合规率为 null 必须断线,不能连成一条假趋势线(与 KPI 卡 '-' 口径一致)
    { name: '合规率', type: 'line', smooth: true, yAxisIndex: 1, connectNulls: false, data: series.value.okRate },
  ],
}))

/** 工时类型占比:逐桶归一到 100%,看结构变化而非绝对量。 */
const typePercentOption = computed(() => {
  const stacks = series.value.typeStack
  const weeks = series.value.weeks
  const totals = weeks.map((_, bi) => stacks.reduce((s, st) => s + (st.data[bi] ?? 0), 0))
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 48, right: 16, top: 24, bottom: 56 },
    xAxis: { type: 'category', data: weeks },
    yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    series: stacks.map((st) => ({
      name: st.name, type: 'bar', stack: 'total',
      data: st.data.map((v, bi) => (totals[bi] > 0 ? Number(((v / totals[bi]) * 100).toFixed(1)) : 0)),
    })),
  }
})

const charts = computed(() => [
  { title: '合规问题数趋势', option: lineOption('问题数', series.value.issues, ' 条'), drill: true },
  { title: '总工时 / 合规率趋势', option: hoursOkRateOption.value, drill: true },
  { title: '加班工时趋势', option: lineOption('加班工时', series.value.overtime, ' h'), drill: true },
  { title: '平均饱和度趋势', option: lineOption('饱和度', series.value.sat, '%'), drill: true },
  { title: '未填人数趋势', option: lineOption('未填人数', series.value.unfilled, ' 人'), drill: true },
  // 百分比堆叠柱:系列名为工时类型(项目类/售前类…),非指标名,无对应明细页可下钻——不挂点击。
  { title: '工时类型占比趋势（百分比）', option: typePercentOption.value, drill: false },
])

/** 桶 key(X 轴 category,即折线/双轴点击回调的 params.name)→ 起止日期,与 series 计算同源(bucketsList)。 */
function bucketRangeByKey(key: string): { start: string; end: string } | null {
  const b = bucketsList.value.find((x) => x.key === key)
  return b ? { start: b.start, end: b.end } : null
}

/** 时间点跨页下钻:问题数/合规率→治理页(compliance);工时/饱和度/未填/总工时→工时明细页(analytics)。
 *  非时间点(如图例)点击 params.name 对不上任何桶 key,直接忽略。 */
function onTrendClick(p: any) {
  const r = bucketRangeByKey(String(p?.name ?? ''))
  if (!r) return
  const toCompliance = p?.seriesName === '问题数' || p?.seriesName === '合规率'
  const q = buildDrillQuery({ start: r.start, end: r.end })
  router.push({ path: toCompliance ? '/yitian/compliance' : '/yitian/analytics', query: q })
}

defineExpose({ series })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />
    <SegToggle v-if="ready" v-model="gran" :options="GRAN_OPTS" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <div v-if="ready" class="yt-grid">
      <section v-for="c in charts" :key="c.title" class="yt-card">
        <h3 class="yt-h">{{ c.title }}</h3>
        <ChartBox :option="c.option" height="280px" v-on="c.drill ? { 'datapoint-click': onTrendClick } : {}" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
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
