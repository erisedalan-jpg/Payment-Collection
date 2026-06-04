<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import ChartBox from '@/charts/ChartBox.vue'
import CompareCards from '@/components/CompareCards.vue'
import { fmtYuan, pct } from '@/lib/format'
import {
  compareTierStats,
  compareProgressSeries,
  compareStatusSeries,
  compareTrendSeries,
  compareOrgRanks,
  COMPARE_TIERS,
  COMPARE_TIER_COLORS,
  COMPARE_STATUSES,
  COMPARE_STATUS_COLORS,
} from '@/lib/compare'

const data = useDataStore()
onMounted(() => {
  if (!data.data) data.load()
})

const summary = computed(() => (data.data?.summary ?? {}) as Record<string, any>)
const rawNodes = computed(() => (data.data?.rawNodes ?? []) as any[])
const orgRanking = computed(() => ((data.data?.dashboard as any)?.orgRanking ?? []) as any[])

const stats = computed(() => compareTierStats(summary.value, rawNodes.value))

// 图1：回款进度对比（分组柱：已回款/待回款/延期金额）
const progressOption = computed(() => {
  const p = compareProgressSeries(stats.value)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['已回款', '待回款', '延期金额'] },
    grid: { left: 60, right: 30, top: 30, bottom: 55 },
    xAxis: { type: 'category', data: p.categories },
    yAxis: { type: 'value', name: '金额(万)' },
    series: [
      { name: '已回款', type: 'bar', data: p.paid, itemStyle: { color: '#10B981' }, barWidth: 38, barCategoryGap: '19%' },
      { name: '待回款', type: 'bar', data: p.pending, itemStyle: { color: '#F59E0B' } },
      { name: '延期金额', type: 'bar', data: p.delayed, itemStyle: { color: '#EF4444', borderRadius: [4, 4, 0, 0] } },
    ],
  }
})

// 图2：状态分布对比（堆叠柱）
const statusOption = computed(() => {
  const ser = compareStatusSeries(summary.value)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: [...COMPARE_STATUSES], bottom: 0 },
    grid: { left: 60, right: 30, top: 25, bottom: 60 },
    xAxis: { type: 'category', data: [...COMPARE_TIERS] },
    yAxis: { type: 'value', name: '节点数' },
    series: ser.map((s, si) => ({
      name: s.name,
      type: 'bar',
      stack: 'a',
      data: s.data,
      itemStyle:
        si === ser.length - 1
          ? { color: COMPARE_STATUS_COLORS[si], borderRadius: [4, 4, 0, 0] }
          : { color: COMPARE_STATUS_COLORS[si] },
    })),
  }
})

// 图3：月度回款趋势对比（折线）
const trendOption = computed(() => {
  const t = compareTrendSeries(summary.value)
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: [...COMPARE_TIERS], bottom: 0 },
    grid: { left: 60, right: 30, top: 25, bottom: 60 },
    xAxis: { type: 'category', data: t.months, axisLabel: { rotate: t.months.length > 12 ? 30 : 0 } },
    yAxis: { type: 'value', name: '金额(万)' },
    series: t.series.map((s) => ({
      name: s.tier,
      type: 'line',
      smooth: true,
      data: s.data,
      itemStyle: { color: COMPARE_TIER_COLORS[s.tier] },
      lineStyle: { width: 2 },
    })),
  }
})

// 图4：服务组 TOP5/BOTTOM5 HTML 排名榜
const ranks = computed(() => compareOrgRanks(orgRanking.value))
function barColor(r: number): string {
  return r >= 0.45 ? 'linear-gradient(90deg,#10B981,#34D399)' : r >= 0.3 ? 'linear-gradient(90deg,#F59E0B,#FBBF24)' : 'linear-gradient(90deg,#EF4444,#F87171)'
}
function rateColor(r: number): string {
  return r >= 0.45 ? '#10b981' : r >= 0.3 ? '#f59e0b' : '#ef4444'
}
function clip(name: string): string {
  return name && name.length > 8 ? name.slice(0, 8) + '…' : name
}
</script>

<template>
  <div class="compare-view">
    <div class="cv-card">
      <div class="cv-head">回款达成对比看板</div>
      <div class="cv-body"><CompareCards :stats="stats" /></div>
    </div>

    <div class="cv-two-col">
      <div class="cv-card">
        <div class="cv-head">回款进度对比</div>
        <div class="cv-body"><ChartBox :option="progressOption" height="320px" /></div>
      </div>
      <div class="cv-card">
        <div class="cv-head">状态分布对比</div>
        <div class="cv-body"><ChartBox :option="statusOption" height="320px" /></div>
      </div>
    </div>

    <div class="cv-card">
      <div class="cv-head">月度回款趋势对比</div>
      <div class="cv-body"><ChartBox :option="trendOption" height="360px" /></div>
    </div>

    <div class="cv-card">
      <div class="cv-head">服务组达成率排名</div>
      <div class="cv-body">
        <div class="cv-ranks">
          <div class="cv-rank-col">
            <div class="cv-rank-title" style="color:#10b981">TOP5</div>
            <div v-for="(v, i) in ranks.top5" :key="'t' + v.org" class="cv-rank-item">
              <span class="cv-rank-no">{{ i + 1 }}</span>
              <span class="cv-rank-name" :title="v.org">{{ clip(v.org) }}</span>
              <span class="cv-rank-bar-wrap"><span class="cv-rank-bar" :style="{ width: (v.actualTotal / ranks.max * 100).toFixed(1) + '%', background: barColor(v.achievementRate) }" /></span>
              <span class="cv-rank-amount">{{ fmtYuan(v.actualTotalWan) }}</span>
              <span class="cv-rank-rate" :style="{ color: rateColor(v.achievementRate) }">{{ pct(v.achievementRate) }}</span>
            </div>
          </div>
          <div class="cv-rank-col">
            <div class="cv-rank-title" style="color:#ef4444">BOTTOM5</div>
            <div v-for="(v, i) in ranks.bottom5" :key="'b' + v.org" class="cv-rank-item">
              <span class="cv-rank-no">{{ i + 1 }}</span>
              <span class="cv-rank-name" :title="v.org">{{ clip(v.org) }}</span>
              <span class="cv-rank-bar-wrap"><span class="cv-rank-bar" :style="{ width: (v.actualTotal / ranks.max * 100).toFixed(1) + '%', background: barColor(v.achievementRate) }" /></span>
              <span class="cv-rank-amount">{{ fmtYuan(v.actualTotalWan) }}</span>
              <span class="cv-rank-rate" :style="{ color: rateColor(v.achievementRate) }">{{ pct(v.achievementRate) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compare-view { padding: 16px; }
.cv-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; }
.cv-head { font-weight: 700; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; color: #2563eb; }
.cv-body { padding: 16px; }
.cv-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.cv-two-col .cv-card { margin-bottom: 14px; }
.cv-ranks { display: flex; gap: 24px; }
.cv-rank-col { flex: 1; min-width: 0; }
.cv-rank-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; padding-left: 4px; }
.cv-rank-item { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 13px; }
.cv-rank-no { width: 20px; text-align: center; color: #64748b; }
.cv-rank-name { width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-rank-bar-wrap { flex: 1; background: #f1f5f9; border-radius: 4px; height: 10px; }
.cv-rank-bar { display: block; height: 10px; border-radius: 4px; }
.cv-rank-amount { width: 80px; text-align: right; color: #334155; }
.cv-rank-rate { width: 56px; text-align: right; font-weight: 600; }
</style>
