<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { usePaymentFilterStore } from '@/stores/paymentFilter'
import { useExcludeStore } from '@/stores/exclude'
import { payDashSummary } from '@/lib/payDashboard'
import { fmtWan, pct } from '@/lib/format'
import AppCard from './AppCard.vue'

const data = useDataStore()
const filter = usePaymentFilterStore()
const exclude = useExcludeStore()
const router = useRouter()

const summary = computed(() =>
  payDashSummary(
    filter.filteredPayNodes,
    data.data?.projects ?? [],
    { excludeActive: exclude.excludeOn, excludedIds: exclude.excludedIds, viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM },
    filter.payRecordsAll,
    data.data?.paymentNodes,
    filter.dateStart,
    filter.dateEnd,
  ),
)

const metrics = computed(() => {
  const s = summary.value
  return [
    // 口径:只数【有合同却无收款阶段】的。合同=0 的项目本来就不该有收款阶段,
    // 算进来这个数就成了噪音(2026-08-31 审查实测:生产 75 vs 31)。下钻清单仍是全量。
    { k: '项目数', v: String(s.totalAll), cls: '', sub: `${s.noStageWithContractCount} 个有合同项目无回款阶段`, action: 'projects' },
    { k: '回款节点数', v: String(s.relatedNodeCount), cls: '', action: 'nodes' },
    { k: '已回款(万)', v: fmtWan(s.totalActual), cls: 'paid' },
    { k: '待回款(万)', v: fmtWan(s.totalRemaining), cls: 'remain' },
    { k: '完成率', v: pct(s.rate), cls: (s.rate ?? 0) >= 0.8 ? 'paid' : (s.rate ?? 0) >= 0.5 ? 'pending' : 'danger' },
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
    <AppCard v-for="m in metrics" :key="m.k" variant="flat" class="dm-card" :class="{ 'dm-card--link': m.action }"
      :data-test="m.action === 'nodes' ? 'pay-nodes-card' : m.action === 'delayed' ? 'pay-delayed-card' : m.action === 'projects' ? 'pay-projects-card' : undefined"
      v-activate="!!m.action"
      @click="onCard(m.action)">
      <div class="dm-k">{{ m.k }}</div>
      <div class="dm-v u-num" :class="m.cls">{{ m.v }}</div>
      <span v-if="m.sub" class="dm-sub">{{ m.sub }}</span>
    </AppCard>
  </div>
</template>

<style scoped>
.dash-metrics { --col-min: 130px; }
/* 卡片外观(底/描边/圆角/内边距)已交给 AppCard(flat);此处原先硬写的内边距是全站
   仅存的一处,随本次归位到 --card-pad。.dm-card 保留为 --link 修饰符的基类与 DOM
   定位钩子,自身不再有样式声明。 */
.dm-card--link { cursor: pointer; }
.dm-card--link:hover { background: var(--hover-tint); }
.dm-k { font-size: var(--fs-1); color: var(--mut); }
.dm-v { font-size: var(--fs-5); font-weight: 700; margin-top: 4px; color: var(--txt); }
.dm-v.paid { color: var(--ok-text); }
.dm-v.remain { color: var(--danger-text); }
.dm-v.pending { color: var(--warn-text); }
.dm-v.danger { color: var(--danger-text); }
.dm-sub { display: block; color: var(--accent); font-size: var(--fs-1); padding: 4px 0 0; }
</style>
