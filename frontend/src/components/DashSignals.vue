<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useFilterStore } from '@/stores/filter'
import { dashboardSignals } from '@/lib/dashboardSignals'
import { fmtWan } from '@/lib/format'

const filter = useFilterStore()

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const sig = computed(() => dashboardSignals(filter.filteredNodes, todayStr()))

const cards = computed(() => [
  { k: '本月需回款(万)', v: fmtWan(sig.value.monthDue), cls: 'remaining', to: '/calendar' },
  { k: '7天内临期', v: String(sig.value.due7Count), cls: 'urgent', to: '/calendar' },
  { k: '延期额(万)', v: fmtWan(sig.value.delayed), cls: 'remaining', to: '/analysis/risk' },
  { k: '待跟进', v: String(sig.value.toFollowupCount), cls: 'accent', to: '/followup' },
])
</script>

<template>
  <div class="dash-signals u-grid-auto">
    <RouterLink v-for="c in cards" :key="c.k" :to="c.to" class="ds-card" :class="c.cls">
      <div class="ds-k">{{ c.k }}</div>
      <div class="ds-v">{{ c.v }}</div>
    </RouterLink>
  </div>
</template>

<style scoped>
.dash-signals { --col-min: 150px; margin-bottom: 12px; }
.ds-card { display: block; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; text-decoration: none; }
.ds-card:hover { border-color: var(--accent); }
.ds-k { font-size: var(--fs-1); color: var(--mut); }
.ds-v { font-size: var(--fs-5); font-weight: 800; margin-top: 4px; color: var(--txt); }
.ds-card.remaining .ds-v { color: var(--c-remaining); }
.ds-card.urgent .ds-v { color: var(--c-urgent); }
.ds-card.accent .ds-v { color: var(--accent); }
</style>
