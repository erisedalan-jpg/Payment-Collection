<script setup lang="ts">
import { computed } from 'vue'
import type { Event } from '@/types/analysis'
import { groupEventsByDate } from '@/lib/activity'

const props = withDefaults(defineProps<{ events: Event[]; emptyText?: string }>(), {
  emptyText: '暂无动态',
})
const groups = computed(() => groupEventsByDate(props.events))
</script>

<template>
  <div class="ev-timeline">
    <div v-if="!props.events.length" class="ev-empty">{{ props.emptyText }}</div>
    <div v-for="g in groups" :key="g.date" class="ev-day">
      <div class="ev-date u-num">{{ g.date }}</div>
      <div v-for="(e, i) in g.items" :key="`${g.date}-${i}`" class="ev-item">
        <span class="ev-type" :class="e.domain === 'payment' ? 'pay' : 'proj'">{{ e.type }}</span>
        <RouterLink v-if="e.projectId" class="ev-proj" :to="`/project/${e.projectId}`">{{ e.projectName || e.projectId }}</RouterLink>
        <span class="ev-summary">{{ e.summary }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ev-empty { color: var(--mut); font-size: 13px; padding: 24px 0; text-align: center; }
.ev-day { margin-bottom: 12px; }
.ev-date { font-size: 12px; font-weight: 700; color: var(--sub); padding: 4px 0; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.ev-item { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; font-size: 13px; flex-wrap: wrap; }
.ev-type { flex-shrink: 0; padding: 0 8px; border-radius: var(--r-full); font-size: 11px; font-weight: 600; line-height: 1.7; }
.ev-type.proj { background: var(--selected-tint); color: var(--accent); }
.ev-type.pay { background: var(--ok-bg); color: var(--ok-text); }
.ev-proj { color: var(--accent); text-decoration: none; font-weight: 600; flex-shrink: 0; }
.ev-proj:hover { text-decoration: underline; }
.ev-summary { color: var(--txt); }
</style>
