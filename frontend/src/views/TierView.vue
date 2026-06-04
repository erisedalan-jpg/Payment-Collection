<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { tierSummaryBar } from '@/lib/dashboardStats'
import { fmtWan, pct } from '@/lib/format'
import { TIER_BY_SLUG, TIERS } from '@/nav'
import TierNodesTab from '@/components/TierNodesTab.vue'
import TierIntegrityTab from '@/components/TierIntegrityTab.vue'
import ProjectsOverviewTab from '@/components/ProjectsOverviewTab.vue'
import RiskTab from '@/components/RiskTab.vue'
import PlanTab from '@/components/PlanTab.vue'

const route = useRoute()
const data = useDataStore()
const filter = useFilterStore()

onMounted(() => { if (!data.data) data.load() })

const tab = computed(() => String(route.params.tab || 'nodes'))
const tier = computed(() => TIER_BY_SLUG[String(route.params.tier)] || TIERS[0].label)

const tierNodes = computed(() => filter.filteredNodes.filter((n) => n.tier === tier.value))
const summary = computed(() => tierSummaryBar(tierNodes.value))

const showSummaryBar = computed(() => tab.value === 'nodes')
const rateColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444')
</script>

<template>
  <div class="tier-view">
    <div v-if="showSummaryBar" class="summary-bar">
      <div class="sb-item"><div class="sb-label">回款节点数</div><div class="sb-val">{{ summary.relatedNodeCount }}</div></div>
      <div class="sb-item"><div class="sb-label">已回款总金额(万)</div><div class="sb-val green">{{ fmtWan(summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">待回款总金额(万)</div><div class="sb-val red">{{ fmtWan(summary.totalExpected - summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">完成率</div><div class="sb-val" :style="{ color: rateColor(summary.rate) }">{{ pct(summary.rate) }}</div></div>
      <div class="sb-item"><div class="sb-label">加资源可提前</div><div class="sb-val primary">{{ summary.projCanAdvance }}</div></div>
      <div class="sb-item"><div class="sb-label">达到回款条件</div><div class="sb-val orange">{{ summary.projReachedCondition }}</div></div>
      <div class="sb-item"><div class="sb-label">延期</div><div class="sb-val red">{{ summary.projDelayed }}</div></div>
    </div>

    <TierNodesTab v-if="tab === 'nodes'" :tier="tier" />
    <ProjectsOverviewTab v-else-if="tab === 'projects'" :tier="tier" />
    <PlanTab v-else-if="tab === 'plan'" :tier="tier" />
    <RiskTab v-else-if="tab === 'risk'" :tier="tier" />
    <TierIntegrityTab v-else-if="tab === 'integrity'" :tier="tier" />
    <div v-else class="tier-stub">「{{ tab }}」页签建设中（{{ tier }}）</div>
  </div>
</template>

<style scoped>
.tier-view { padding: 12px 0; }
.summary-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; padding: 0 16px 12px; }
.sb-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
.sb-label { font-size: 12px; color: #64748b; }
.sb-val { font-size: 18px; font-weight: 700; color: #0f172a; }
.sb-val.green { color: #10b981; } .sb-val.red { color: #ef4444; } .sb-val.orange { color: #f59e0b; } .sb-val.primary { color: #4f46e5; }
.tier-stub { padding: 40px; text-align: center; color: #94a3b8; }
</style>
