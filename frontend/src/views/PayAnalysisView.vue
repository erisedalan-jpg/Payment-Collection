<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { PAY_FACET_DIMS } from '@/lib/paymentPmis'
import SegToggle from '@/components/SegToggle.vue'
import BoardView from '@/views/BoardView.vue'
import ProjectsOverviewTab from '@/components/ProjectsOverviewTab.vue'
import TierNodesTab from '@/components/TierNodesTab.vue'
import PlanTab from '@/components/PlanTab.vue'
import RiskTab from '@/components/RiskTab.vue'

const route = useRoute()
const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const TABS = [
  { tab: 'board', label: '多维看板' },
  { tab: 'projects', label: '项目总览' },
  { tab: 'nodes', label: '回款节点' },
  { tab: 'plan', label: '回款进度' },
  { tab: 'risk', label: '风险项目' },
]
const tab = computed(() => String(route.params.tab || 'board'))

// 共享维度选择器（作用于前 4 个 facet tab；board 自带 DimPicker，对其隐藏）
const dim = ref<'dept' | 'stage' | 'tier' | 'progress'>('dept')
const DIM_OPTS = PAY_FACET_DIMS.map((d) => ({ value: d.key, label: d.label }))
</script>

<template>
  <div class="analysis-view">
    <div class="av-bar">
      <nav class="av-tabs">
        <RouterLink
          v-for="t in TABS"
          :key="t.tab"
          :to="`/panalysis/${t.tab}`"
          class="av-tab"
          :class="{ on: tab === t.tab }"
        >{{ t.label }}</RouterLink>
      </nav>
      <div v-if="tab !== 'board'" class="av-ctl">
        <span class="av-label">维度</span>
        <SegToggle v-model="dim" :options="DIM_OPTS" />
      </div>
    </div>

    <BoardView v-if="tab === 'board'" />
    <ProjectsOverviewTab v-else-if="tab === 'projects'" :dim="dim" />
    <TierNodesTab v-else-if="tab === 'nodes'" :dim="dim" />
    <PlanTab v-else-if="tab === 'plan'" :dim="dim" />
    <RiskTab v-else-if="tab === 'risk'" :dim="dim" />
    <div v-else class="av-stub">「{{ tab }}」建设中</div>
  </div>
</template>

<style scoped>
.analysis-view { padding: 12px 0; }
.av-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 0 16px 12px; }
.av-tabs { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.av-tab { padding: 6px 14px; border-radius: 8px; font-size: var(--fs-2); color: var(--sub); text-decoration: none; }
.av-tab:hover { background: var(--card2); }
.av-tab.on { background: var(--accent); color: var(--on-accent); font-weight: 700; }
.av-ctl { display: flex; align-items: center; gap: 8px; }
.av-label { font-size: var(--fs-1); color: var(--mut); }
.av-stub { padding: 40px; text-align: center; color: var(--mut); }
</style>
