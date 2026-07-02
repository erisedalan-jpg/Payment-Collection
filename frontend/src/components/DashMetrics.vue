<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { payDashSummary } from '@/lib/payDashboard'
import { fmtWan, pct } from '@/lib/format'

const data = useDataStore()
const filter = useFilterStore()
const router = useRouter()

const summary = computed(() =>
  payDashSummary(
    filter.filteredPayNodes,
    data.data?.projects ?? [],
    { excludeActive: filter.excludeOn, excludedIds: filter.excludedIds, viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM },
    filter.payRecordsAll,
    data.data?.paymentNodes,
    filter.dateStart,
    filter.dateEnd,
  ),
)

const metrics = computed(() => {
  const s = summary.value
  return [
    { k: '项目数', v: String(s.totalAll), cls: '', sub: `${s.noStageCount} 个项目无回款阶段`, action: 'projects' },
    { k: '回款节点数', v: String(s.relatedNodeCount), cls: '', action: 'nodes' },
    { k: '已回款(万)', v: fmtWan(s.totalActual), cls: 'paid' },
    { k: '待回款(万)', v: fmtWan(s.totalRemaining), cls: 'remain' },
    { k: '完成率', v: pct(s.rate), cls: s.rate >= 0.8 ? 'paid' : s.rate >= 0.5 ? 'pending' : 'danger' },
    { k: '延期项目数', v: String(s.delayedProjects), cls: 'danger', action: 'delayed' },
  ]
})

function onCard(action?: string) {
  if (action === 'nodes') router.push('/payment/nodes')
  else if (action === 'delayed') router.push('/projects?riskCategory=回款延期')
  else if (action === 'projects') router.push('/projects')
}
</script>

<template>
  <div class="dash-metrics u-grid-auto">
    <div v-for="m in metrics" :key="m.k" class="dm-card" :class="{ 'dm-card--link': m.action }"
      :data-test="m.action === 'nodes' ? 'pay-nodes-card' : m.action === 'delayed' ? 'pay-delayed-card' : m.action === 'projects' ? 'pay-projects-card' : undefined"
      @click="onCard(m.action)">
      <div class="dm-k">{{ m.k }}</div>
      <div class="dm-v u-num" :class="m.cls">{{ m.v }}</div>
      <span v-if="m.sub" class="dm-sub">{{ m.sub }} →</span>
    </div>
  </div>
</template>

<style scoped>
.dash-metrics { --col-min: 130px; }
.dm-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.dm-card--link { cursor: pointer; }
.dm-card--link:hover { background: var(--hover-tint); }
.dm-k { font-size: var(--fs-1); color: var(--mut); }
.dm-v { font-size: var(--fs-5); font-weight: 800; margin-top: 4px; color: var(--txt); }
.dm-v.paid { color: var(--c-paid); }
.dm-v.remain { color: var(--c-remaining); }
.dm-v.pending { color: var(--c-pending); }
.dm-v.danger { color: var(--danger); }
.dm-sub { display: block; color: var(--accent); font-size: var(--fs-1); padding: 4px 0 0; }
</style>
