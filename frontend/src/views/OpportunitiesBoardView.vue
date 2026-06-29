<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { buildRankingOption } from '@/lib/chartOptions'
import {
  boardKpis, aiKpis, groupBy, customerTierAgg, monthlyTrendByTeam, expectedDateStack,
  buildMultiLineOption, buildCustomerTierOption, buildStackedAmountOption, buildHorizontalBarOption,
  isAiRow, FORECAST_ORDER,
} from '@/lib/opportunityBoard'
import { L4_OPTIONS } from '@/lib/opportunityColumns'
import ChartBox from '@/charts/ChartBox.vue'

const opps = useOpportunitiesStore()
onMounted(() => { if (!opps.loaded) opps.load() })

const now = new Date()
const rows = computed(() => opps.rows)
const keyRows = computed(() => rows.value.filter((r) => String(r.keyOpp ?? '').trim() === '是'))
const aiRows = computed(() => rows.value.filter(isAiRow))

const fmtInt = (n: number) => Math.round(n).toLocaleString('zh-CN')

// 顶部 4 KPI
const kpi = computed(() => boardKpis(rows.value, now))
const topCards = computed(() => [
  { k: '本周新增/更新商机数', main: fmtInt(kpi.value.weekCount), sub: '记录总数' },
  { k: '本周新增/更新商机金额', main: fmtInt(kpi.value.weekAmountWan), sub: '商机金额(万元)' },
  { k: '商机总数', main: fmtInt(kpi.value.totalCount), sub: '商机总数' },
  { k: '商机总额', main: fmtInt(kpi.value.totalAmountWan), sub: '商机金额(万元)' },
])
// 底部 2 AI KPI
const ai = computed(() => aiKpis(rows.value))
const aiCards = computed(() => [
  { k: 'AI相关商机数', main: fmtInt(ai.value.count), sub: '记录总数' },
  { k: 'AI相关商机金额', main: fmtInt(ai.value.amountWan), sub: '商机金额(万元)' },
])

// —— 简单柱/饼(复用 buildRankingOption) ——
function pieAmount(field: string, order?: string[]) {
  const g = groupBy(rows.value, field, { skipEmpty: true, order })
  return buildRankingOption('pie', {
    categories: g.map((x) => x.category), values: g.map((x) => x.amountWan),
    metricLabel: '预估金额(万元)', valueKind: 'wan',
  })
}
function teamBar(src: () => typeof rows.value, kind: 'amount' | 'count') {
  const g = groupBy(src(), 'l4', { order: L4_OPTIONS, skipEmpty: true })
  return buildRankingOption('bar', {
    categories: g.map((x) => x.category),
    values: g.map((x) => (kind === 'amount' ? x.amountWan : x.count)),
    metricLabel: kind === 'amount' ? '预估金额(万元)' : '计数',
    valueKind: kind === 'amount' ? 'wan' : 'count',
  })
}

const productCoverOption = computed(() => {
  const g = groupBy(rows.value, 'productCategory', { skipEmpty: true, topN: 10 })
  return buildHorizontalBarOption(g.map((x) => x.category), g.map((x) => x.amountWan), '预估金额(万元)')
})
const forecastPie = computed(() => pieAmount('forecast', FORECAST_ORDER))
const stagePie = computed(() => pieAmount('status'))
const teamAmount = computed(() => teamBar(() => rows.value, 'amount'))
const teamKeyAmount = computed(() => teamBar(() => keyRows.value, 'amount'))
const teamCount = computed(() => teamBar(() => rows.value, 'count'))
const teamKeyCount = computed(() => teamBar(() => keyRows.value, 'count'))

// —— 多系列折线趋势 ——
const trend = computed(() => monthlyTrendByTeam(rows.value))
const trendCountOption = computed(() => buildMultiLineOption(trend.value.months, trend.value.teams, trend.value.countMatrix, '商机数量', 'count'))
const trendAmountOption = computed(() => buildMultiLineOption(trend.value.months, trend.value.teams, trend.value.amountMatrix, '预估金额(万元)', 'wan'))

// —— 双轴 / 堆叠 ——
const tierOption = computed(() => buildCustomerTierOption(customerTierAgg(rows.value)))
const expectedStack = computed(() => expectedDateStack(rows.value))
const expectedOption = computed(() => buildStackedAmountOption(expectedStack.value.months, expectedStack.value.series, expectedStack.value.matrix))

// —— AI 两饼 ——
const aiCountPie = computed(() => {
  const g = groupBy(aiRows.value, 'productCategory', { skipEmpty: true })
  return buildRankingOption('pie', { categories: g.map((x) => x.category), values: g.map((x) => x.count), metricLabel: '记录数', valueKind: 'count' })
})
const aiAmountPie = computed(() => {
  const g = groupBy(aiRows.value, 'productCategory', { skipEmpty: true })
  return buildRankingOption('pie', { categories: g.map((x) => x.category), values: g.map((x) => x.amountWan), metricLabel: '预估金额(万元)', valueKind: 'wan' })
})
</script>

<template>
  <div class="ob-view">
    <!-- 顶部 KPI -->
    <div class="ob-cards">
      <div v-for="c in topCards" :key="c.k" class="ob-card">
        <div class="ob-card-k">{{ c.k }}</div>
        <div class="ob-card-main u-num">{{ c.main }}</div>
        <div class="ob-card-sub">{{ c.sub }}</div>
      </div>
    </div>

    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">商机覆盖产品</h3><ChartBox :option="productCoverOption" height="320px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">商机主观预测</h3><ChartBox :option="forecastPie" height="320px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">商机阶段分布</h3><ChartBox :option="stagePie" height="320px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">各团队商机金额</h3><ChartBox :option="teamAmount" height="300px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">各团队【重点】商机金额</h3><ChartBox :option="teamKeyAmount" height="300px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">各团队商机数量</h3><ChartBox :option="teamCount" height="300px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">各团队【重点】商机数量</h3><ChartBox :option="teamKeyCount" height="300px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">商机数量月变化趋势</h3><ChartBox :option="trendCountOption" height="320px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">商机金额月变化趋势</h3><ChartBox :option="trendAmountOption" height="320px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">各级别客户商机数及商机金额</h3><ChartBox :option="tierOption" height="340px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">预估落单时间分布</h3><ChartBox :option="expectedOption" height="340px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">AI相关商机数</h3><ChartBox :option="aiCountPie" height="320px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">AI相关商机金额</h3><ChartBox :option="aiAmountPie" height="320px" /></div>
    </div>
    <div class="ob-cards">
      <div v-for="c in aiCards" :key="c.k" class="ob-card">
        <div class="ob-card-k">{{ c.k }}</div>
        <div class="ob-card-main u-num">{{ c.main }}</div>
        <div class="ob-card-sub">{{ c.sub }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ob-view { display: flex; flex-direction: column; gap: var(--gap-section); }
.ob-cards { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.ob-card {
  flex: 1 1 200px; min-width: 180px; background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r-md); padding: var(--card-pad); display: flex; flex-direction: column; gap: var(--gap-stack);
}
.ob-card-k { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.ob-card-main { font-size: var(--fs-5); font-weight: 700; color: var(--accent); }
.ob-card-sub { font-size: var(--fs-2); color: var(--mut); }
.ob-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.ob-chart { flex: 1 1 420px; min-width: 320px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.ob-h3 { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-2); }
</style>
