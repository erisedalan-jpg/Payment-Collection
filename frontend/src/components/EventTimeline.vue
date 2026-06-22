<script setup lang="ts">
import { computed } from 'vue'
import type { Event } from '@/types/analysis'
import { groupEventsByDate } from '@/lib/activity'
import { fmtWan } from '@/lib/format'

interface PidInfo { projectManager?: string; orgL4?: string; overspendAmount?: number | null }
const props = withDefaults(defineProps<{ events: Event[]; emptyText?: string; pidInfo?: Record<string, PidInfo> }>(), {
  emptyText: '暂无动态',
})
const groups = computed(() => groupEventsByDate(props.events))
function meta(pid?: string): PidInfo | undefined { return pid ? props.pidInfo?.[pid] : undefined }
</script>

<template>
  <div class="ev-timeline">
    <div v-if="!props.events.length" class="ev-empty">{{ props.emptyText }}</div>
    <div v-for="g in groups" :key="g.date" class="ev-day">
      <div class="ev-date u-num">{{ g.date }}</div>
      <div v-for="(e, i) in g.items" :key="`${g.date}-${i}`" class="ev-item">
        <span class="ev-type" :class="e.tone ? `tone-${e.tone}` : (e.domain === 'payment' ? 'pay' : 'proj')">{{ e.type }}</span>
        <RouterLink v-if="e.projectId" class="ev-proj" :to="`/project/${e.projectId}`">{{ e.projectName || e.projectId }}</RouterLink>
        <span v-if="meta(e.projectId)" class="ev-meta">
          <span v-if="meta(e.projectId)!.projectManager" class="ev-meta-i">{{ meta(e.projectId)!.projectManager }}</span>
          <span v-if="meta(e.projectId)!.orgL4" class="ev-meta-i">{{ meta(e.projectId)!.orgL4 }}</span>
          <span v-if="(meta(e.projectId)!.overspendAmount ?? 0) > 0" class="ev-meta-i ev-meta-over">超支 {{ fmtWan(meta(e.projectId)!.overspendAmount) }} 万</span>
        </span>
        <span class="ev-summary">{{ e.summary }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ev-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-5) 0; text-align: center; }
.ev-day { margin-bottom: var(--sp-3); }
.ev-date { font-size: var(--fs-1); font-weight: 700; color: var(--sub); padding: var(--sp-1) 0; border-bottom: 1px solid var(--line); margin-bottom: var(--sp-2); }
.ev-item { display: flex; align-items: baseline; gap: var(--sp-2); padding: var(--sp-1) 0; font-size: var(--fs-2); flex-wrap: wrap; }
.ev-type { flex-shrink: 0; padding: 0 var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); font-weight: 600; line-height: 1.7; }
.ev-type.proj { background: var(--selected-tint); color: var(--accent); }
.ev-type.pay { background: var(--ok-bg); color: var(--ok-text); }
.ev-type.tone-ok { background: var(--ok-bg); color: var(--ok-text); }
.ev-type.tone-warn { background: var(--warn-bg); color: var(--warn-text); }
.ev-type.tone-danger { background: var(--danger-bg); color: var(--danger-text); }
.ev-proj { color: var(--accent); text-decoration: none; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.ev-proj:hover { text-decoration: underline; }
.ev-meta { display: inline-flex; gap: var(--sp-1); flex-wrap: wrap; flex-shrink: 0; }
.ev-meta-i { font-size: var(--fs-1); color: var(--mut); padding: 0 var(--sp-1); border: 1px solid var(--line); border-radius: var(--r-sm); line-height: 1.7; }
.ev-meta-over { color: var(--danger-text); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
.ev-summary { color: var(--txt); min-width: 0; overflow-wrap: anywhere; }
</style>
