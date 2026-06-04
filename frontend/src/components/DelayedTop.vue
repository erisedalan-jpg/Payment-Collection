<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { delayedTopProjects } from '@/lib/dashboardCharts'

const filter = useFilterStore()
const items = computed(() => delayedTopProjects(filter.filteredNodes, 10))

const TIER_CLASS: Record<string, string> = { '100万以上': 't-red', '50-100万': 't-orange', '50万以下': 't-green' }
</script>

<template>
  <div class="delayed-top">
    <div v-if="!items.length" class="dt-empty">暂无延期项目</div>
    <div v-for="p in items" :key="p.projectId" class="dt-item">
      <div class="dt-row1">
        <span class="dt-id">{{ p.projectId }}</span>
        <span class="dt-delay">{{ p.maxDelay }}<span class="dt-unit">天</span></span>
      </div>
      <div class="dt-name" :title="p.projectName">{{ p.projectName || '-' }}</div>
      <div class="dt-row3">
        <span>{{ p.orgL4 || '-' }}</span>
        <span class="dt-tier" :class="TIER_CLASS[p.tier]">{{ p.tier }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.delayed-top { padding: 4px 0; }
.dt-item { padding: 10px 12px; border: 1px solid #f1f5f9; border-radius: 8px; margin-bottom: 8px; background: #fff; }
.dt-row1 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.dt-id { font-weight: 700; font-size: 13px; color: #0f172a; }
.dt-delay { color: #ef4444; font-weight: 800; font-size: 15px; }
.dt-unit { font-size: 11px; font-weight: 500; margin-left: 2px; }
.dt-name { font-size: 13px; color: #475569; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-row3 { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #94a3b8; }
.dt-tier { font-size: 11px; padding: 1px 6px; border-radius: 4px; }
.t-red { background: #fef2f2; color: #ef4444; } .t-orange { background: #fffbeb; color: #f59e0b; } .t-green { background: #ecfdf5; color: #10b981; }
.dt-empty { color: #94a3b8; padding: 20px; text-align: center; }
</style>
