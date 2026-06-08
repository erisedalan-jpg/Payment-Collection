<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { DIMENSIONS, groupByDims, type PivotGroup } from '@/lib/pivot'
import { fmtWan, pct } from '@/lib/format'
import ChartBox from '@/charts/ChartBox.vue'
import SegToggle from '@/components/SegToggle.vue'
import BoardDrilldownModal from '@/components/BoardDrilldownModal.vue'

const route = useRoute()
const data = useDataStore()
const filter = useFilterStore()

const DIM_OPTS = DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))
const SORT_OPTS = [
  { value: 'actualAmount', label: '已回款' },
  { value: 'completionRate', label: '完成率' },
  { value: 'projectCount', label: '项目数' },
  { value: 'delayedCount', label: '延期数' },
]

const initDim = typeof route.query.dim === 'string' && DIMENSIONS.some((d) => d.key === route.query.dim)
  ? (route.query.dim as string)
  : 'orgL4'
const dimKey = ref(initDim)
const sortKey = ref('actualAmount')

const groups = computed<PivotGroup[]>(() => {
  const gs = groupByDims(filter.filteredNodes, [dimKey.value])
  const k = sortKey.value as keyof PivotGroup
  return [...gs].sort((a, b) => (b[k] as number) - (a[k] as number))
})

const top = computed(() => groups.value.slice(0, 15))

const chartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['已回款', '待回款'], top: 0 },
  grid: { left: 60, right: 20, top: 30, bottom: 60 },
  xAxis: { type: 'category', data: top.value.map((g) => g.key), axisLabel: { interval: 0, rotate: 30 } },
  yAxis: { type: 'value', name: '金额(万)' },
  series: [
    { name: '已回款', type: 'bar', stack: 'a', data: top.value.map((g) => +(g.actualAmount / 10000).toFixed(2)), itemStyle: { color: '#10B981' } },
    { name: '待回款', type: 'bar', stack: 'a', data: top.value.map((g) => +(g.remainingAmount / 10000).toFixed(2)), itemStyle: { color: '#F59E0B' } },
  ],
}))

const drillOpen = ref(false)
const drillGroup = ref<PivotGroup | null>(null)
function openDrill(g: PivotGroup) {
  drillGroup.value = g
  drillOpen.value = true
}
defineExpose({ drillOpen })
</script>

<template>
  <div class="board-view">
    <p v-if="!data.data" class="bv-hint">暂无数据，请先在数据管理中同步/导入。</p>
    <template v-else>
      <div class="bv-toolbar">
        <div class="bv-ctl">
          <span class="bv-ctl-label">维度</span>
          <SegToggle v-model="dimKey" :options="DIM_OPTS" />
        </div>
        <div class="bv-ctl">
          <span class="bv-ctl-label">排序</span>
          <SegToggle v-model="sortKey" :options="SORT_OPTS" />
        </div>
      </div>

      <section class="bv-card">
        <h3 class="bv-title">已回款 / 待回款对比（Top {{ top.length }}）</h3>
        <ChartBox :option="chartOption" height="320px" />
      </section>

      <section class="bv-card">
        <h3 class="bv-title">分组排名（点击行下钻该组项目）</h3>
        <div class="bv-table">
          <div class="bv-row bv-head">
            <span class="bv-c-name">{{ DIM_OPTS.find((d) => d.value === dimKey)?.label }}</span>
            <span>项目数</span><span>计划回款(万)</span><span>已回款(万)</span><span>待回款(万)</span>
            <span>完成率</span><span>延期</span><span>延期率</span>
          </div>
          <div
            v-for="g in groups"
            :key="g.key"
            v-activate
            class="bv-row bv-body"
            @click="openDrill(g)"
          >
            <span class="bv-c-name" :title="g.key">{{ g.key }}</span>
            <span>{{ g.projectCount }}</span>
            <span>{{ fmtWan(g.expectedAmount) }}</span>
            <span class="bv-paid">{{ fmtWan(g.actualAmount) }}</span>
            <span class="bv-remain">{{ fmtWan(g.remainingAmount) }}</span>
            <span>{{ pct(g.completionRate) }}</span>
            <span :class="{ 'bv-danger': g.delayedCount > 0 }">{{ g.delayedCount }}</span>
            <span>{{ pct(g.delayRate) }}</span>
          </div>
          <div v-if="!groups.length" class="bv-empty">暂无数据</div>
        </div>
      </section>

      <BoardDrilldownModal
        v-model="drillOpen"
        :title="drillGroup?.key || ''"
        :projects="drillGroup?.projects || []"
      />
    </template>
  </div>
</template>

<style scoped>
.board-view { padding: 16px; }
.bv-hint { padding: 24px; color: var(--mut); }
.bv-toolbar { display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 12px; }
.bv-ctl { display: flex; align-items: center; gap: 8px; }
.bv-ctl-label { font-size: var(--fs-1); color: var(--mut); }
.bv-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
.bv-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.bv-table { font-size: var(--fs-2); }
.bv-row { display: grid; grid-template-columns: 1.6fr repeat(7, 1fr); gap: 8px; align-items: center; padding: 7px 8px; }
.bv-row > span:not(.bv-c-name) { text-align: right; }
.bv-head { color: var(--mut); font-size: var(--fs-1); border-bottom: 1px solid var(--line); }
.bv-body { border-top: 1px solid var(--line); cursor: pointer; border-radius: 6px; }
.bv-body:hover { background: var(--card2); }
.bv-c-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt); }
.bv-paid { color: var(--c-paid); }
.bv-remain { color: var(--c-pending); }
.bv-danger { color: var(--danger); font-weight: 700; }
.bv-empty { color: var(--mut); padding: 16px; text-align: center; }
</style>
