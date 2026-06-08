<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { tierSummaryBar } from '@/lib/dashboardStats'
import { fmtWan, pct } from '@/lib/format'
import { TIERS } from '@/nav'
import SegToggle from '@/components/SegToggle.vue'
import ProjectsOverviewTab from '@/components/ProjectsOverviewTab.vue'
import TierNodesTab from '@/components/TierNodesTab.vue'
import PlanTab from '@/components/PlanTab.vue'
import RiskTab from '@/components/RiskTab.vue'
import TierIntegrityTab from '@/components/TierIntegrityTab.vue'

const route = useRoute()
const data = useDataStore()
const filter = useFilterStore()
onMounted(() => { if (!data.data) data.load() })

const TABS = [
  { tab: 'projects', label: '项目总览' },
  { tab: 'nodes', label: '回款节点' },
  { tab: 'plan', label: '回款状态' },
  { tab: 'risk', label: '风险项目' },
  { tab: 'integrity', label: '数据质检' },
]
const tab = computed(() => String(route.params.tab || 'projects'))
const tier = ref('')
const TIER_OPTS = [{ value: '', label: '全部' }, ...TIERS.map((t) => ({ value: t.label, label: t.label }))]

const nodes = computed(() =>
  tier.value ? filter.filteredNodes.filter((n) => n.tier === tier.value) : filter.filteredNodes,
)
const summary = computed(() => tierSummaryBar(nodes.value))
const showSummaryBar = computed(() => tab.value === 'nodes')
const rateColor = (r: number) => (r >= 0.8 ? 'var(--c-paid)' : r >= 0.5 ? 'var(--c-pending)' : 'var(--danger)')
</script>

<template>
  <div class="analysis-view">
    <div class="av-bar">
      <nav class="av-tabs">
        <RouterLink
          v-for="t in TABS"
          :key="t.tab"
          :to="`/analysis/${t.tab}`"
          class="av-tab"
          :class="{ on: tab === t.tab }"
        >{{ t.label }}</RouterLink>
      </nav>
      <div class="av-ctl">
        <span class="av-label">档位</span>
        <SegToggle v-model="tier" :options="TIER_OPTS" />
      </div>
    </div>

    <div v-if="showSummaryBar" class="summary-bar">
      <div class="sb-item"><div class="sb-label">回款节点数</div><div class="sb-val">{{ summary.relatedNodeCount }}</div></div>
      <div class="sb-item"><div class="sb-label">已回款总金额(万)</div><div class="sb-val paid">{{ fmtWan(summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">待回款总金额(万)</div><div class="sb-val remaining">{{ fmtWan(summary.totalExpected - summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">完成率</div><div class="sb-val" :style="{ color: rateColor(summary.rate) }">{{ pct(summary.rate) }}</div></div>
      <div class="sb-item"><div class="sb-label">加资源可提前</div><div class="sb-val accent">{{ summary.projCanAdvance }}</div></div>
      <div class="sb-item"><div class="sb-label">达到回款条件</div><div class="sb-val pending">{{ summary.projReachedCondition }}</div></div>
      <div class="sb-item"><div class="sb-label">延期</div><div class="sb-val danger">{{ summary.projDelayed }}</div></div>
    </div>

    <ProjectsOverviewTab v-if="tab === 'projects'" :tier="tier" />
    <TierNodesTab v-else-if="tab === 'nodes'" :tier="tier" />
    <PlanTab v-else-if="tab === 'plan'" :tier="tier" />
    <RiskTab v-else-if="tab === 'risk'" :tier="tier" />
    <TierIntegrityTab v-else-if="tab === 'integrity'" :tier="tier" />
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
.summary-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; padding: 0 16px 12px; }
.sb-item { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
.sb-label { font-size: var(--fs-1); color: var(--mut); }
.sb-val { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
.sb-val.paid { color: var(--c-paid); }
.sb-val.danger { color: var(--danger); }
.sb-val.remaining { color: var(--c-remaining); }
.sb-val.pending { color: var(--c-pending); }
.sb-val.accent { color: var(--accent); }
.av-stub { padding: 40px; text-align: center; color: var(--mut); }
</style>
