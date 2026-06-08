<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { computeTierStats } from '@/lib/dashboardStats'
import { fmtWan } from '@/lib/format'
import { TIERS } from '@/nav'

const filter = useFilterStore()

const TIER_VAR: Record<string, string> = {
  '100万以上': 'var(--danger)',
  '50-100万': 'var(--warn)',
  '50万以下': 'var(--ok)',
}

const rows = computed(() =>
  TIERS.map((t) => {
    const s = computeTierStats(t.label, filter.filteredNodes) as Record<string, any>
    return {
      tier: t.label,
      color: TIER_VAR[t.label] || 'var(--mut)',
      projectCount: s.projectCount as number,
      remainingWan: s.remainingAmountWan as number,
    }
  }),
)

const totalProjects = computed(() => rows.value.reduce((sum, r) => sum + r.projectCount, 0))
</script>

<template>
  <div class="tier-strip">
    <div class="ts-head"><h3 class="ts-title">金额档位概览</h3></div>
    <div v-if="totalProjects > 0" class="ts-bar">
      <div
        v-for="r in rows"
        :key="r.tier"
        class="ts-seg"
        :style="{ flexGrow: r.projectCount, background: r.color }"
        :title="`${r.tier} · ${r.projectCount} 个项目`"
      >
        <span v-if="r.projectCount > 0">{{ r.tier }} · {{ r.projectCount }}</span>
      </div>
    </div>
    <div v-else class="ts-empty">暂无项目</div>
    <div class="ts-legend">
      <span v-for="r in rows" :key="r.tier" class="ts-leg">
        <i :style="{ background: r.color }" />{{ r.tier }} 待回 {{ fmtWan(r.remainingWan * 10000) }} 万
      </span>
    </div>
  </div>
</template>

<style scoped>
.tier-strip { }
.ts-head { margin-bottom: 10px; }
.ts-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
.ts-bar { display: flex; height: 34px; border-radius: 9px; overflow: hidden; margin-bottom: 10px; }
.ts-seg { display: flex; align-items: center; justify-content: center; min-width: 0; font-size: var(--fs-1); color: var(--on-accent); font-weight: 700; white-space: nowrap; overflow: hidden; padding: 0 6px; }
.ts-empty { height: 34px; display: flex; align-items: center; justify-content: center; color: var(--mut); border: 1px dashed var(--line); border-radius: 9px; margin-bottom: 10px; }
.ts-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: var(--fs-1); color: var(--sub); }
.ts-leg { display: flex; align-items: center; gap: 6px; }
.ts-leg i { width: 10px; height: 10px; border-radius: 3px; }
</style>
