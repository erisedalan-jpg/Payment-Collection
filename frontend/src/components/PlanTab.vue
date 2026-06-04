<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters } from '@/lib/crossFilter'
import { PLAN_BOARDS, boardStats, planSummaryTotals, planStatusCounts } from '@/lib/planBoards'
import { fmtWan, pct } from '@/lib/format'
import PlanBoard from './PlanBoard.vue'

const props = defineProps<{ tier: string }>()
const data = useDataStore()
const filter = useFilterStore()
const cf = useCrossFilterStore()

const tableIds = PLAN_BOARDS.map((_, i) => `planBoard_${i}`)

const allNodes = computed(
  () =>
    filter.filteredNodes.filter(
      (n) => n.tier === props.tier && (n as Record<string, any>).isPaymentRelated,
    ) as Record<string, any>[],
)

const columns = computed(() => {
  const cols = (data.data?.displayColumns as Record<string, any[]> | undefined)?.[props.tier] ?? []
  return cols
    .filter((c) => c.visible !== false)
    .map((c) => ({ key: c.key as string, label: c.label as string }))
})

const boards = computed(() =>
  PLAN_BOARDS.map((b, i) => {
    const boardNodes = allNodes.value.filter((n) => n.nodeStatus === b.status)
    const nodes = applyColumnFilters(boardNodes, cf.tableFilters(tableIds[i]))
    return { board: b, tableId: tableIds[i], nodes, stats: boardStats(nodes as any) }
  }),
)

const combined = computed(() => boards.value.flatMap((d) => d.nodes))
const totals = computed(() => planSummaryTotals(boards.value.map((d) => d.nodes) as any))
// 忠实移植 updatePlanSummary：状态计数取合并后(已CF过滤)节点；为空时回退全量
const counts = computed(() =>
  planStatusCounts((combined.value.length > 0 ? combined.value : allNodes.value) as any),
)

const rateColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444')

// 忠实移植 navTier 的 CF._filters={} 重置：进入页面/切换档位时清空本页 6 看板筛选
function resetFilters() {
  cf.clearGroup(tableIds)
}
onMounted(resetFilters)
watch(() => props.tier, resetFilters)
</script>

<template>
  <div class="plan-tab">
    <div class="summary-bar">
      <div class="sb-item"><div class="sb-label">节点计划回款金额(万)</div><div class="sb-val" style="color:#3b82f6">{{ fmtWan(totals.totalExp) }}</div></div>
      <div class="sb-item"><div class="sb-label">节点已回款金额(万)</div><div class="sb-val green">{{ fmtWan(totals.totalAct) }}</div></div>
      <div class="sb-item"><div class="sb-label">节点待回款金额(万)</div><div class="sb-val red">{{ fmtWan(totals.totalRem) }}</div></div>
      <div class="sb-item"><div class="sb-label">完成率</div><div class="sb-val" :style="{ color: rateColor(totals.rate) }">{{ pct(totals.rate) }}</div></div>
    </div>

    <div class="status-grid">
      <div class="st-card"><div class="st-label">加资源可提前</div><div class="st-val" style="color:#4f46e5">{{ counts.canAdvance }}</div></div>
      <div class="st-card"><div class="st-label">达到回款条件</div><div class="st-val" style="color:#f59e0b">{{ counts.reachedCondition }}</div></div>
      <div class="st-card"><div class="st-label">已提前回款</div><div class="st-val" style="color:#059669">{{ counts.advance }}</div></div>
      <div class="st-card"><div class="st-label">已全额回款</div><div class="st-val" style="color:#10b981">{{ counts.fullPaid }}</div></div>
      <div class="st-card"><div class="st-label">延期</div><div class="st-val" style="color:#ef4444">{{ counts.delayed }}</div></div>
      <div class="st-card"><div class="st-label">正常实施中</div><div class="st-val" style="color:#3b82f6">{{ counts.onTime }}</div></div>
    </div>

    <div class="toolbar">
      <el-button
        size="small"
        :type="cf.linkageOn ? 'primary' : 'default'"
        @click="cf.toggleLinkage()"
      >
        {{ cf.linkageOn ? '筛选联动(已启用)' : '筛选联动' }}
      </el-button>
      <el-button v-if="cf.groupHasFilters(tableIds)" size="small" @click="cf.clearGroup(tableIds)">
        清除所有筛选
      </el-button>
    </div>

    <div class="plan-boards">
      <PlanBoard
        v-for="d in boards"
        :key="d.tableId"
        :board="d.board"
        :table-id="d.tableId"
        :nodes="d.nodes as Record<string, any>[]"
        :stats="d.stats"
        :columns="columns"
        :source-rows="allNodes"
        :group="tableIds"
      />
    </div>
  </div>
</template>

<style scoped>
.plan-tab {
  padding: 12px 16px;
}
.summary-bar,
.status-grid {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}
.summary-bar {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
.status-grid {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}
.sb-item,
.st-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
}
.sb-label,
.st-label {
  font-size: 12px;
  color: #64748b;
}
.sb-val {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}
.sb-val.green {
  color: #10b981;
}
.sb-val.red {
  color: #ef4444;
}
.st-val {
  font-size: 20px;
  font-weight: 700;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
