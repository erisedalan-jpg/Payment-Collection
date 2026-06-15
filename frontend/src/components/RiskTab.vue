<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { fmtWan, fmtRatio, fmtYuan } from '@/lib/format'
import { projectPaymentRows, paymentNodeRows, pmisRiskGroups, filterProjects, rateColorPmis } from '@/lib/paymentPmis'

defineProps<{ dim: string }>()
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()

const ctx = computed(() => {
  const ps = filterProjects(data.data?.projects ?? [], {
    viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
    excludeActive: filter.excludeOn, excludedIds: filter.excludedIds,
  })
  const rows = projectPaymentRows(ps, data.data?.projectPmis ?? {})
  const nodeRows = paymentNodeRows(data.data?.paymentNodes, ps, data.data?.projectPmis ?? {})
  return pmisRiskGroups(rows, nodeRows)
})

const NODE_COLS: DataColumn[] = [
  { key: 'projectName', label: '项目' },
  { key: 'stage', label: '阶段' },
  { key: 'planDate', label: '计划日' },
  { key: 'expectedPayment', label: '计划金额(万)', formatter: (v) => fmtWan(v) },
]
const LOW_COLS: DataColumn[] = [
  { key: 'projectName', label: '项目' },
  { key: 'contract', label: '合同(万)', formatter: (v) => fmtWan(v) },
  { key: 'actualTotal', label: '已回(万)', formatter: (v) => fmtWan(v) },
  { key: 'paymentRatio', label: '完成率' },
]
const OVER_COLS: DataColumn[] = [
  { key: 'projectName', label: '项目' },
  { key: 'dept', label: '部门' },
  { key: 'overspendAmount', label: '超支金额(元)', formatter: (v) => fmtYuan(v) },
]
function onRow(r: Record<string, any>) { pd.open(r.projectId) }
</script>

<template>
  <div class="risk-tab">
    <section class="rg">
      <h3 class="rg-h">延期节点（{{ ctx.delayedNodes.length }}）</h3>
      <DataTable :columns="NODE_COLS" :rows="ctx.delayedNodes" clickable @row-click="onRow" />
    </section>
    <section class="rg">
      <h3 class="rg-h">低回款项目（完成率&lt;30% 且有合同，Top10）</h3>
      <DataTable :columns="LOW_COLS" :rows="ctx.lowPayment" clickable @row-click="onRow">
        <template #cell-paymentRatio="{ value }">
          <span class="u-num" :style="{ color: rateColorPmis(value) }">{{ fmtRatio(value) }}</span>
        </template>
      </DataTable>
    </section>
    <section class="rg">
      <h3 class="rg-h">超支项目（{{ ctx.overspend.length }}）</h3>
      <DataTable :columns="OVER_COLS" :rows="ctx.overspend" clickable @row-click="onRow" />
    </section>
  </div>
</template>

<style scoped>
.rg { margin-bottom: var(--gap-section); }
.rg-h { font-size: var(--fs-3); color: var(--txt); font-weight: 700; margin: 0 0 var(--sp-2); }
</style>
