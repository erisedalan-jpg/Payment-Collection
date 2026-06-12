<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import type { Event, PeriodCompare, PeriodCompareEntry } from '@/types/analysis'
import { filterEvents, type ActivityFilters } from '@/lib/activity'
import { fmtWan } from '@/lib/format'
import SegToggle from '@/components/SegToggle.vue'
import EventTimeline from '@/components/EventTimeline.vue'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

// —— 周期对比(spec 4.4 顶部卡条;基线不足置灰) ——
const BASELINES = [
  { value: 'lastSync', label: '上次同步' },
  { value: 'lastWeek', label: '上周' },
  { value: 'lastMonth', label: '上月' },
]
const baseline = ref('lastSync')
const entry = computed<PeriodCompareEntry | null>(() => {
  const pc = data.data?.periodCompare
  return (pc?.[baseline.value as keyof PeriodCompare] ?? null) as PeriodCompareEntry | null
})
const compareCards = computed(() => {
  const e = entry.value
  if (!e) return []
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n))
  return [
    { k: '阶段推进', v: `${e.advancedProjects ?? 0} 项` },
    { k: '新增延期节点', v: String(e.newDelayedNodes ?? 0) },
    { k: '回款新增(万)', v: fmtWan(e.paymentGained) },
    { k: '风险净增', v: sign(e.riskNetChange ?? 0) },
    { k: '新超支项目', v: String(e.newOverspendProjects ?? 0) },
    { k: '回款达成率', v: e.paymentRatioChange == null ? '-' : `${sign(e.paymentRatioChange)}pp` },
  ]
})

// —— 时间线 ——
const events = computed(() => (data.data?.events ?? []) as Event[])
const DOMAINS = [
  { value: '', label: '全部' },
  { value: 'project', label: '项目类' },
  { value: 'payment', label: '回款类' },
]
const filters = reactive<ActivityFilters>({ domain: '', query: '' })
const filtered = computed(() => filterEvents(events.value, filters))
</script>

<template>
  <div class="activity-view">
    <h2 class="av-title">项目动态</h2>

    <div class="av-compare">
      <div class="av-compare-head">
        <span class="av-compare-label">周期对比</span>
        <SegToggle v-model="baseline" :options="BASELINES" />
        <span v-if="entry" class="av-base-date">对比 {{ entry.baseDate }}</span>
      </div>
      <div v-if="entry" class="av-cards">
        <div v-for="c in compareCards" :key="c.k" class="av-card">
          <div class="av-card-v u-num">{{ c.v }}</div>
          <div class="av-card-k">{{ c.k }}</div>
        </div>
      </div>
      <div v-else class="av-insufficient">快照不足，该基线暂无对比数据。</div>
    </div>

    <div class="av-toolbar">
      <SegToggle v-model="filters.domain" :options="DOMAINS" />
      <el-input v-model="filters.query" size="small" placeholder="搜索 项目/摘要/类型" clearable style="width: 220px" />
    </div>
    <EventTimeline :events="filtered" empty-text="首次同步，暂无变化记录" />
  </div>
</template>

<style scoped>
.activity-view { padding: var(--sp-4); }
.av-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.av-compare { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4); margin-bottom: var(--sp-4); }
.av-compare-head { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.av-compare-label { font-weight: 700; font-size: var(--fs-2); color: var(--txt); }
.av-base-date { font-size: var(--fs-1); color: var(--mut); }
.av-cards { display: flex; flex-wrap: wrap; gap: var(--sp-3); }
.av-card { flex: 1; min-width: 110px; background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); padding: var(--sp-2) var(--sp-3); }
.av-card-v { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
.av-card-k { font-size: var(--fs-1); color: var(--mut); margin-top: 2px; }
.av-insufficient { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-2) 0; opacity: var(--disabled-opacity); }
.av-toolbar { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
</style>
