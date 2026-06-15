<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { fmtWan, fmtRatio } from '@/lib/format'
import { paymentNodeRows, nodeSummary, filterProjects } from '@/lib/paymentPmis'

defineProps<{ dim: string }>()
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()

const rows = computed(() => {
  const ps = filterProjects(data.data?.projects ?? [], {
    viewMode: filter.viewMode,
    viewL4: filter.viewL4,
    viewPM: filter.viewPM,
    naguanOn: filter.naguanOn,
    naguanExclude: data.data?.naguanExclude ?? {},
  })
  return paymentNodeRows(data.data?.paymentNodes, ps, data.data?.projectPmis ?? {})
})
const sum = computed(() => nodeSummary(rows.value))

const COLS: DataColumn[] = [
  { key: 'projectName', label: '项目' },
  { key: 'stage', label: '阶段' },
  { key: 'planDate', label: '计划日' },
  { key: 'actualDate', label: '实际日' },
  { key: 'payRatio', label: '计划比例', formatter: (v) => fmtRatio(v) },
  { key: 'expectedPayment', label: '计划金额(万)', sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'status', label: '状态' },
]
const STATUS_CLASS: Record<string, string> = { 已达成: 'st-ok', 延期: 'st-danger', 待达成: 'st-warn' }
function onRow(row: Record<string, any>) { pd.open(row.projectId) }
</script>

<template>
  <div class="nodes-tab">
    <section class="nsum u-num">
      <div class="ns"><span class="ns-l">节点总数</span><span class="ns-v">{{ sum.total }}</span></div>
      <div class="ns"><span class="ns-l">已达成</span><span class="ns-v" style="color:var(--ok-text)">{{ sum.reached }}</span></div>
      <div class="ns"><span class="ns-l">延期</span><span class="ns-v" style="color:var(--danger-text)">{{ sum.delayed }}</span></div>
      <div class="ns"><span class="ns-l">待达成</span><span class="ns-v" style="color:var(--warn-text)">{{ sum.pending }}</span></div>
      <div class="ns"><span class="ns-l">计划回款Σ(万)</span><span class="ns-v">{{ fmtWan(sum.expectedTotal) }}</span></div>
    </section>
    <DataTable :columns="COLS" :rows="rows" clickable @row-click="onRow">
      <template #cell-status="{ value }">
        <span class="st-badge" :class="STATUS_CLASS[value] || 'st-warn'">{{ value }}</span>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.nsum { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-card); margin-bottom: var(--gap-section); }
.ns { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); display: flex; flex-direction: column; gap: var(--sp-1); }
.ns-l { font-size: var(--fs-1); color: var(--mut); }
.ns-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); }
.st-badge { padding: 2px 8px; border-radius: var(--r-sm); font-size: var(--fs-1); }
.st-ok { background: var(--ok-bg); color: var(--ok-text); }
.st-danger { background: var(--danger-bg); color: var(--danger-text); }
.st-warn { background: var(--warn-bg); color: var(--warn-text); }
</style>
