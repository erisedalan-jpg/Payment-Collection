<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { delayedTopProjects } from '@/lib/dashboardCharts'
import { fmtWan } from '@/lib/format'
import SegToggle from './SegToggle.vue'

const filter = useFilterStore()
const pd = useProjectDetailStore()
const sortBy = ref('delay')
const SORT_OPTS = [
  { value: 'delay', label: '按天数' },
  { value: 'amount', label: '按金额' },
]

const items = computed(() =>
  delayedTopProjects(filter.filteredNodes, 10, sortBy.value as 'delay' | 'amount'),
)
</script>

<template>
  <div class="delay-top-card">
    <div class="dtc-head">
      <h3 class="dtc-title">延期 Top</h3>
      <SegToggle v-model="sortBy" :options="SORT_OPTS" />
    </div>
    <div v-if="!items.length" class="dtc-empty">暂无延期项目</div>
    <div
      v-for="(p, i) in items"
      :key="p.projectId"
      v-activate
      class="dtc-row"
      @click="pd.open(p.projectId)"
    >
      <span class="dtc-rank">{{ i + 1 }}</span>
      <span class="dtc-name" :title="p.projectName">{{ p.projectName || p.projectId }}</span>
      <span class="dtc-primary">{{ sortBy === 'delay' ? p.maxDelay + ' 天' : fmtWan(p.remainingAmount) + ' 万' }}</span>
      <span class="dtc-sub">{{ sortBy === 'delay' ? fmtWan(p.remainingAmount) + ' 万' : p.maxDelay + ' 天' }}</span>
    </div>
  </div>
</template>

<style scoped>
.delay-top-card { }
.dtc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.dtc-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
.dtc-empty { color: var(--mut); padding: 20px; text-align: center; }
.dtc-row { display: flex; align-items: center; gap: 10px; padding: 7px 6px; border-top: 1px solid var(--line); cursor: pointer; border-radius: 6px; }
.dtc-row:first-of-type { border-top: none; }
.dtc-row:hover { background: var(--card2); }
.dtc-rank { width: 18px; height: 18px; border-radius: 5px; background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); font-size: var(--fs-1); display: flex; align-items: center; justify-content: center; font-weight: 700; flex: none; }
.dtc-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt); font-size: var(--fs-2); }
.dtc-primary { font-weight: 700; color: var(--danger); font-size: var(--fs-2); }
.dtc-sub { color: var(--mut); font-size: var(--fs-1); width: 70px; text-align: right; }
</style>
