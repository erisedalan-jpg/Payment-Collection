<script setup lang="ts">
import type { CalAgendaGroup } from '@/lib/calendar'
import { fmtWan } from '@/lib/format'
import CalNodeTable from './CalNodeTable.vue'

defineProps<{ groups: CalAgendaGroup[] }>()
</script>

<template>
  <div class="cag">
    <div v-if="!groups.length" class="cag-empty">暂无回款节点</div>
    <div v-for="g in groups" :key="g.date" class="cag-day">
      <div class="cag-head">
        <span class="cag-date">{{ g.date }}</span>
        <span class="cag-sub">{{ g.nodes.length }}个节点，待回款 {{ fmtWan(g.subRemaining) }}万</span>
      </div>
      <CalNodeTable :nodes="g.nodes as Record<string, any>[]" />
    </div>
  </div>
</template>

<style scoped>
.cag { margin-top: 6px; }
.cag-empty { color: var(--mut); text-align: center; padding: 20px; }
.cag-day { margin-bottom: 14px; }
.cag-head { display: flex; align-items: center; gap: 10px; font-weight: 700; padding: 8px 12px; border-left: 3px solid var(--accent); background: var(--card2); font-size: var(--fs-2); color: var(--txt); }
.cag-sub { color: var(--sub); font-size: var(--fs-1); font-weight: 400; }
</style>
