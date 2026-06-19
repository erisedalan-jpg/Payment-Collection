<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { projectPaymentRows, summaryByDim, filterProjects } from '@/lib/paymentPmis'
import { fmtWan, fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'

const data = useDataStore()
const filter = useFilterStore()

const rows = computed(() => {
  const opts = {
    viewMode: filter.viewMode,
    viewL4: filter.viewL4,
    viewPM: filter.viewPM,
    excludeActive: filter.excludeOn,
    excludedIds: filter.excludedIds,
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
  { key: 'value', label: 'L4组', width: 130 },
  { key: 'projectCount', label: '项目数', width: 84, sortable: true },
  { key: 'contractSum', label: '合同额(万)', width: 110, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'actualSum', label: '已回款(万)', width: 110, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'rate', label: '回款额完成率', width: 110, sortable: true, formatter: (v) => fmtRatio(v as number | null) },
  { key: 'delayedProjectCount', label: '延期项目数', width: 96, sortable: true },
  { key: 'delayedNodeSum', label: '延期节点', width: 90, sortable: true },
  { key: 'delayedAmountSum', label: '延期金额(万)', width: 110, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'nodeSum', label: '回款节点数', width: 100, sortable: true },
  { key: 'reachedSum', label: '完成节点数', width: 100, sortable: true },
  { key: 'reachedRatio', label: '完成节点比例', width: 110, sortable: true, formatter: (v) => fmtRatio(v as number | null) },
]
</script>

<template>
  <div class="pl4">
    <h3 class="pl4-title">回款数据（按 L4 服务组）</h3>
    <div v-if="!rows.length" class="pl4-empty">暂无数据</div>
    <div v-else class="pl4-scroll">
      <DataTable :columns="COLUMNS" :rows="rows" :show-count="false" />
    </div>
  </div>
</template>

<style scoped>
.pl4-title { font-size: var(--fs-4); font-weight: 600; color: var(--txt); margin: 0 0 var(--sp-3); }
.pl4-empty { color: var(--mut); padding: var(--sp-5) 0; text-align: center; }
.pl4-scroll { overflow-x: auto; }
</style>
