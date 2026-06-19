<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useFilterStore } from '@/stores/filter'
import { useDataStore } from '@/stores/data'
import { payOrgRanking } from '@/lib/payDashboard'
import { filterProjects } from '@/lib/paymentPmis'
import { goBoard } from '@/lib/navContext'
import { fmtWan, pct } from '@/lib/format'
import SegToggle from './SegToggle.vue'

const filter = useFilterStore()
const data = useDataStore()
const router = useRouter()
const sortBy = ref('actualTotal')
const SORT_OPTS = [
  { value: 'actualTotal', label: '已回款' },
  { value: 'achievementRate', label: '达成率' },
]

const ranked = computed(() => {
  const projects = filterProjects(data.data?.projects ?? [], {
    viewMode: filter.viewMode,
    viewL4: filter.viewL4,
    viewPM: filter.viewPM,
    excludeActive: filter.excludeOn,
    excludedIds: filter.excludedIds,
  })
  return payOrgRanking(
    projects,
    data.data?.paymentNodes,
    filter.payRecordsAll,
    filter.dateStart,
    filter.dateEnd,
    sortBy.value as 'actualTotal' | 'achievementRate',
  ).slice(0, 8)
})
const maxActual = computed(() => Math.max(1, ...ranked.value.map((o) => o.actualTotal)))

function rateColor(r: number): string {
  return r >= 0.45 ? 'var(--c-paid)' : r >= 0.3 ? 'var(--c-pending)' : 'var(--danger)'
}
</script>

<template>
  <div class="org-ranking">
    <div class="or-head">
      <h3 class="or-title">服务组达成排名</h3>
      <SegToggle v-model="sortBy" :options="SORT_OPTS" />
    </div>
    <div
      v-for="(o, i) in ranked"
      :key="o.org"
      v-activate
      class="rank-item"
      @click="goBoard(router, 'orgL4')"
    >
      <span class="rank-no">{{ i + 1 }}</span>
      <span class="rank-name" :title="o.org">{{ o.org }}</span>
      <span class="rank-bar-wrap">
        <span class="rank-bar" :style="{ width: ((o.actualTotal / maxActual) * 100).toFixed(1) + '%', background: rateColor(o.achievementRate) }" />
      </span>
      <span class="rank-amount">{{ fmtWan(o.actualTotal) }} 万</span>
      <span class="rank-rate" :style="{ color: rateColor(o.achievementRate) }">{{ pct(o.achievementRate) }}</span>
    </div>
    <div v-if="!ranked.length" class="or-empty">暂无数据</div>
  </div>
</template>

<style scoped>
.org-ranking { }
.or-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.or-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
.rank-item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; font-size: var(--fs-2); cursor: pointer; border-radius: 6px; }
.rank-item:hover { background: var(--card2); }
.rank-no { width: 20px; text-align: center; color: var(--mut); }
.rank-name { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt); }
.rank-bar-wrap { flex: 1; background: var(--card2); border-radius: 4px; height: 10px; overflow: hidden; }
.rank-bar { display: block; height: 10px; border-radius: 4px; }
.rank-amount { width: 90px; text-align: right; color: var(--sub); }
.rank-rate { width: 56px; text-align: right; font-weight: 600; }
.or-empty { color: var(--mut); padding: 12px; text-align: center; }
</style>
