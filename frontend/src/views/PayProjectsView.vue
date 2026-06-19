<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { fmtWan, fmtRatio } from '@/lib/format'
import { projectPaymentRows, filterProjects, rateColorPmis } from '@/lib/paymentPmis'

const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()

const rows = computed(() =>
  projectPaymentRows(
    filterProjects(data.data?.projects ?? [], {
      viewMode: filter.viewMode,
      viewL4: filter.viewL4,
      viewPM: filter.viewPM,
      excludeActive: filter.excludeOn,
      excludedIds: filter.excludedIds,
    }),
    (data.data?.projectPmis ?? {}) as Record<string, any>,
    data.data?.paymentNodes,
    data.data?.paymentRecords,
    filter.dateStart,
    filter.dateEnd,
  ),
)

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'projectManager', label: '经理' },
  { key: 'dept', label: '部门' },
  { key: 'contract', label: '合同(万)', sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'actualTotal', label: '已回款(万)', sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'paymentRatio', label: '完成率', sortable: true },
  { key: 'expectedTotal', label: '计划回款(万)', formatter: (v) => fmtWan(v) },
  { key: 'nodeCount', label: '节点' },
  { key: 'reachedCount', label: '达成' },
  { key: 'delayedCount', label: '延期' },
  { key: 'fromOrigin', label: '来源', formatter: (v) => (v ? '售前·取原项目' : '') },
]

function onRow(row: Record<string, any>) {
  pd.open(row.projectId)
}
</script>

<template>
  <div class="pov-tab">
    <DataTable :columns="COLS" :rows="rows" clickable @row-click="onRow">
      <template #cell-paymentRatio="{ value }">
        <span class="u-num" :style="{ color: rateColorPmis(value) }">{{ fmtRatio(value) }}</span>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
</style>
