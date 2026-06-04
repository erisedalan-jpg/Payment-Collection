<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import {
  followupDeptStats,
  followupTotals,
  followupQuarters,
  cycleLabel,
} from '@/lib/followup'
import { fmtWan } from '@/lib/format'
import { useFuDataStore } from '@/stores/fuData'
import FollowupSignalRow from '@/components/FollowupSignalRow.vue'
import FollowupExpandModal from '@/components/FollowupExpandModal.vue'

const data = useDataStore()
const filter = useFilterStore()
const fu = useFuDataStore()
onMounted(() => {
  if (!data.data) data.load()
})

const search = ref('')

const relatedNodes = computed(
  () => filter.filteredNodes.filter((n) => (n as Record<string, any>).isPaymentRelated) as Record<string, any>[],
)
const stats = computed(() => followupDeptStats(relatedNodes.value as any, fu.data, new Date()))
const totals = computed(() => followupTotals(stats.value))
const quarters = computed(() => followupQuarters(relatedNodes.value as any))
const prefix = computed(() => cycleLabel(filter.filterYear, new Date().getFullYear()))

const filteredStats = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? stats.value.filter((d) => d.name.toLowerCase().includes(q)) : stats.value
})
const max = computed(() => ({
  d7: Math.max(1, ...filteredStats.value.map((d) => d.d7)),
  d15: Math.max(1, ...filteredStats.value.map((d) => d.d15)),
  d30: Math.max(1, ...filteredStats.value.map((d) => d.d30)),
  delay: Math.max(1, ...filteredStats.value.map((d) => d.delay)),
}))

const expandOpen = ref(false)
const expandDept = ref('')
const expandWin = ref('')
function onExpand(e: { dept: string; timeWin: string }) {
  expandDept.value = e.dept
  expandWin.value = e.timeWin
  expandOpen.value = true
}

const STAT_CARDS = computed(() => [
  { label: '7天内待回款', value: totals.value.urgent, color: '#f97316' },
  { label: '8~15天内待回款', value: totals.value.d15, color: '#f59e0b' },
  { label: '16~30天内待回款', value: totals.value.d30, color: '#3b82f6' },
  { label: '延期', value: totals.value.delayed, color: '#dc2626' },
  { label: '已跟进', value: totals.value.totalFlw, color: '#10b981' },
  { label: '待跟进', value: totals.value.totalNotFlw, color: '#8c8c9e' },
])
</script>

<template>
  <div class="fu-view">
    <h2 class="fu-title">临期跟进</h2>

    <div class="fu-quarters-card">
      <div class="fu-q-header">季度回款概览（{{ prefix }}）</div>
      <div class="fu-q-row">
        <div v-for="q in quarters" :key="q.quarter" class="fu-q-cell">
          <div class="fu-q-name">{{ prefix }}-Q{{ q.quarter }}季度汇总</div>
          <div class="fu-q-sub">节点 / 项目</div>
          <div class="fu-q-main">{{ q.nodeCount }} / {{ q.projectCount }}</div>
          <div class="fu-q-amts">
            <div><div class="fu-q-amt-label">待回款</div><div class="fu-q-amt red">{{ fmtWan(q.expected - q.actual) }}万</div></div>
            <div><div class="fu-q-amt-label">已回款</div><div class="fu-q-amt green">{{ fmtWan(q.actual) }}万</div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="fu-cards">
      <div v-for="c in STAT_CARDS" :key="c.label" class="fu-card">
        <div class="fu-card-label">{{ c.label }}</div>
        <div class="fu-card-val" :style="{ color: c.color }">{{ c.value }}</div>
      </div>
    </div>

    <div class="fu-search">
      <el-input v-model="search" size="small" placeholder="搜索 L4 部门..." clearable style="width: 240px" />
    </div>

    <div class="fu-board">
      <div class="fu-board-header">
        临期回款进度跟进
        <span class="fu-board-hint">橙色7天 黄色8~15天 蓝色16~30天 红色延期</span>
      </div>
      <div class="fu-board-cols">
        <div class="bc-rank">序号</div>
        <div class="bc-dept">L4部门</div>
        <div class="bc-bars">
          <span>7天内待回款项目</span><span>8~15天内待回款项目</span><span>16~30天内待回款项目</span><span>延期项目</span>
        </div>
        <div class="bc-rate">跟进率</div>
      </div>
      <FollowupSignalRow
        v-for="(d, i) in filteredStats"
        :key="d.name"
        :index="i"
        :stat="d"
        :max="max"
        @expand="onExpand"
      />
      <div v-if="!filteredStats.length" class="fu-empty">暂无数据</div>
    </div>

    <FollowupExpandModal
      v-model="expandOpen"
      :dept="expandDept"
      :time-win="expandWin"
      :related-nodes="relatedNodes as Record<string, any>[]"
    />
  </div>
</template>

<style scoped>
.fu-view { padding: 16px; }
.fu-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 14px; }
.fu-quarters-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; }
.fu-q-header { font-weight: 700; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; color: #6366f1; }
.fu-q-row { display: flex; gap: 12px; padding: 10px 16px; flex-wrap: wrap; }
.fu-q-cell { flex: 1; min-width: 180px; text-align: center; padding: 10px 6px; background: #fafbfc; border-radius: 8px; border: 1px solid #ebe7e2; }
.fu-q-name { font-size: 13px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
.fu-q-sub { font-size: 10px; color: #8c8c9e; }
.fu-q-main { font-size: 20px; font-weight: 800; color: #3b82f6; }
.fu-q-amts { display: flex; gap: 8px; margin-top: 4px; justify-content: center; }
.fu-q-amt-label { font-size: 9px; color: #8c8c9e; }
.fu-q-amt { font-size: 12px; font-weight: 700; }
.fu-q-amt.red { color: #ef4444; }
.fu-q-amt.green { color: #10b981; }
.fu-cards { display: flex; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
.fu-card { flex: 1; min-width: 120px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; padding: 18px 14px; }
.fu-card-label { font-size: 11px; color: #8c8c9e; margin-bottom: 4px; }
.fu-card-val { font-size: 28px; font-weight: 800; }
.fu-search { margin-bottom: 12px; }
.fu-board { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.fu-board-header { font-weight: 700; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
.fu-board-hint { font-size: 10px; color: #8c8c9e; font-weight: 400; margin-left: 12px; }
.fu-board-cols { display: grid; grid-template-columns: 40px 160px 1fr 70px; gap: 12px; padding: 8px 14px; font-size: 12px; color: #8c8c9e; font-weight: 600; background: #fafbfc; }
.bc-rank, .bc-rate { text-align: center; }
.bc-bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.bc-bars span { white-space: nowrap; }
.fu-empty { padding: 30px; text-align: center; color: #94a3b8; }
</style>
