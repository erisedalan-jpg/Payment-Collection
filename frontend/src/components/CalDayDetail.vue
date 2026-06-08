<script setup lang="ts">
import type { CalListGroup } from '@/lib/calendar'
import { fmtWan } from '@/lib/format'
import CalNodeTable from './CalNodeTable.vue'

defineProps<{ title: string; groups: CalListGroup[] }>()
</script>

<template>
  <div class="cdd">
    <div class="cdd-title">{{ title }}</div>
    <div v-if="!groups.length" class="cdd-empty">暂无回款节点</div>
    <div v-for="g in groups" :key="g.key" class="cdd-group">
      <div class="cdd-head" :style="{ borderLeftColor: g.color }">
        <span class="cdd-status" :style="{ color: g.color }">{{ g.key }}</span>
        <span class="cdd-sub">{{ g.nodes.length }}个节点，待回款小计 {{ fmtWan(g.subRemaining) }}万</span>
      </div>
      <CalNodeTable :nodes="g.nodes as Record<string, any>[]" />
    </div>
  </div>
</template>

<style scoped>
.cdd { margin-top: 18px; }
.cdd-title { font-size: var(--fs-4); font-weight: 800; color: var(--txt); margin-bottom: 8px; }
.cdd-empty { color: var(--mut); text-align: center; padding: 20px; }
.cdd-group { margin-bottom: 14px; }
.cdd-head { display: flex; align-items: center; gap: 10px; font-weight: 700; padding: 8px 12px; border-left: 3px solid var(--line); background: var(--card2); font-size: var(--fs-2); }
.cdd-sub { color: var(--sub); font-size: var(--fs-1); font-weight: 400; }
</style>
