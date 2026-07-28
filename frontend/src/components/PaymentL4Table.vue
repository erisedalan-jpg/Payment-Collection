<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { usePaymentFilterStore } from '@/stores/paymentFilter'
import { useExcludeStore } from '@/stores/exclude'
import { projectPaymentRows, summaryByDim, filterProjects, l4SummaryRow } from '@/lib/paymentPmis'
import { fmtWan, fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import SectionTitle from '@/components/SectionTitle.vue'

const data = useDataStore()
const filter = usePaymentFilterStore()
const exclude = useExcludeStore()

const rows = computed(() => {
  const opts = {
    viewMode: filter.viewMode,
    viewL4: filter.viewL4,
    viewPM: filter.viewPM,
    excludeActive: exclude.excludeOn,
    excludedIds: exclude.excludedIds,
  }
  const pr = projectPaymentRows(
    filterProjects(data.data?.projects ?? [], opts),
    data.data?.projectPmis ?? {},
    data.data?.paymentNodes,
    filter.payRecordsAll,
    filter.dateStart,
    filter.dateEnd,
  )
  return summaryByDim(pr, 'dept').map((s) => ({
    ...s,
    reachedRatio: s.nodeSum > 0 ? s.reachedSum / s.nodeSum : null,
  }))
})

const COLUMNS: DataColumn[] = [
  { key: 'value', label: 'L4组', width: 130, sortable: true },
  { key: 'projectCount', label: '项目数', width: 84, sortable: true, num: true },
  { key: 'contractSum', label: '合同额(万)', width: 110, sortable: true, num: true, formatter: (v) => fmtWan(v as number) },
  { key: 'actualSum', label: '已回款(万)', width: 110, sortable: true, num: true, formatter: (v) => fmtWan(v as number) },
  { key: 'rate', label: '回款额完成率', width: 110, sortable: true, num: true, formatter: (v) => fmtRatio(v as number | null) },
  { key: 'delayedProjectCount', label: '延期项目数', width: 96, sortable: true, num: true },
  { key: 'delayedNodeSum', label: '延期节点', width: 90, sortable: true, num: true },
  { key: 'delayedAmountSum', label: '延期金额(万)', width: 110, sortable: true, num: true, formatter: (v) => fmtWan(v as number) },
  { key: 'nodeSum', label: '回款节点数', width: 100, sortable: true, num: true },
  { key: 'reachedSum', label: '完成节点数', width: 100, sortable: true, num: true },
  { key: 'reachedRatio', label: '完成节点比例', width: 110, sortable: true, num: true, formatter: (v) => fmtRatio(v as number | null) },
]

const totals = computed(() => l4SummaryRow(rows.value))
function summaryMethod({ columns }: { columns: { property: string }[] }): string[] {
  const t = totals.value
  const disp: Record<string, string> = {
    value: '合计',
    projectCount: String(t.projectCount),
    contractSum: fmtWan(t.contractSum),
    actualSum: fmtWan(t.actualSum),
    rate: fmtRatio(t.rate),
    delayedProjectCount: String(t.delayedProjectCount),
    delayedNodeSum: String(t.delayedNodeSum),
    delayedAmountSum: fmtWan(t.delayedAmountSum),
    nodeSum: String(t.nodeSum),
    reachedSum: String(t.reachedSum),
    reachedRatio: fmtRatio(t.reachedRatio),
  }
  return columns.map((c) => disp[c.property] ?? '')
}
</script>

<template>
  <div class="pl4">
    <SectionTitle level="card" class="pl4-title">回款数据</SectionTitle>
    <div v-if="!rows.length" class="pl4-empty">暂无数据</div>
    <div v-else class="pl4-scroll">
      <DataTable :columns="COLUMNS" :rows="rows" :show-count="false" :show-summary="true" :summary-method="summaryMethod" />
    </div>
  </div>
</template>

<style scoped>
.pl4 { width: 100%; }
/* 字号/字重/色已收归 SectionTitle(card 级);原为 --fs-4/600,字重归位 700。此处只剩底边距,
   写成 .st.pl4-title 而非 .pl4-title —— 父组件给子组件根节点加样式须同时带两边的类,
   否则与 SectionTitle 自身的 .st { margin: 0 } 同特异性、靠打包顺序决胜负。 */
.st.pl4-title { margin: 0 0 var(--sp-3); }
.pl4-empty { color: var(--mut); padding: var(--sp-5) 0; text-align: center; }
.pl4-scroll { overflow-x: auto; }
</style>
