<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { payTierStats } from '@/lib/payDashboard'
import { projectPaymentRows, type PayProjectRow } from '@/lib/paymentPmis'
import { fmtWan, pct } from '@/lib/format'
import { TIERS } from '@/nav'
import BoardDrilldownModal from './BoardDrilldownModal.vue'

const data = useDataStore()
const filter = useFilterStore()

const rows = computed(() =>
  TIERS.map((t) => {
    const s = payTierStats(
      t.label,
      filter.filteredProjects,
      data.data?.paymentNodes,
      data.data?.paymentRecords,
      filter.dateStart,
      filter.dateEnd,
    )
    const expectedWan = s.expectedAmountWan
    const actualWan = s.actualAmountWan
    return {
      tier: t.label,
      projectCount: s.projectCount,
      expectedWan,
      actualWan,
      completion: expectedWan > 0 ? actualWan / expectedWan : 0,
      delayedCount: s.delayedCount,
    }
  }),
)

function barColor(r: number): string {
  return r >= 0.8 ? 'var(--c-paid)' : r >= 0.5 ? 'var(--c-pending)' : 'var(--danger)'
}

const drillOpen = ref(false)
const drillTitle = ref('')
const drillProjects = ref<PayProjectRow[]>([])
function openTier(tier: string) {
  drillTitle.value = tier
  const filteredPids = new Set(filter.filteredProjects.map((p) => p.projectId))
  drillProjects.value = projectPaymentRows(
    data.data?.projects ?? [],
    data.data?.projectPmis,
    data.data?.paymentNodes,
    data.data?.paymentRecords,
    filter.dateStart,
    filter.dateEnd,
  ).filter((r) => r.tier === tier && filteredPids.has(r.projectId))
  drillOpen.value = true
}
defineExpose({ drillOpen })
</script>

<template>
  <div class="tier-strip">
    <div class="ts-head"><h3 class="ts-title">金额档位 · 回款进度</h3></div>
    <div v-for="r in rows" :key="r.tier" v-activate class="ts-row" @click="openTier(r.tier)">
      <span class="ts-name">{{ r.tier }}</span>
      <span class="ts-bar-wrap">
        <span class="ts-bar" :style="{ width: (r.completion * 100).toFixed(0) + '%', background: barColor(r.completion) }" />
      </span>
      <span class="ts-pct" :style="{ color: barColor(r.completion) }">{{ pct(r.completion) }}</span>
      <span class="ts-amt">已回 {{ fmtWan(r.actualWan * 10000) }} / 计划 {{ fmtWan(r.expectedWan * 10000) }} 万</span>
      <span class="ts-delay" :class="{ on: r.delayedCount > 0 }">延期 {{ r.delayedCount }}</span>
    </div>
    <BoardDrilldownModal v-model="drillOpen" :title="drillTitle" :projects="drillProjects" />
  </div>
</template>

<style scoped>
.tier-strip { }
.ts-head { margin-bottom: 10px; }
.ts-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
.ts-row { display: grid; grid-template-columns: 84px 1fr 52px auto auto; gap: 10px; align-items: center; padding: 7px 8px; border-top: 1px solid var(--line); cursor: pointer; border-radius: 6px; }
.ts-row:first-of-type { border-top: none; }
.ts-row:hover { background: var(--card2); }
.ts-name { font-size: var(--fs-2); color: var(--txt); font-weight: 600; }
.ts-bar-wrap { height: 12px; background: var(--card2); border-radius: 6px; overflow: hidden; }
.ts-bar { display: block; height: 12px; border-radius: 6px; }
.ts-pct { font-size: var(--fs-2); font-weight: 700; text-align: right; }
.ts-amt { font-size: var(--fs-1); color: var(--sub); white-space: nowrap; }
.ts-delay { font-size: var(--fs-1); color: var(--mut); white-space: nowrap; }
.ts-delay.on { color: var(--danger); font-weight: 600; }
</style>
