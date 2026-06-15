<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { fmtWan, fmtRatio } from '@/lib/format'
import { projectPaymentRows, summaryByDim, filterProjects, rateColorPmis, PAY_FACET_DIMS } from '@/lib/paymentPmis'

const props = defineProps<{ dim: string }>()
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()

const rows = computed(() =>
  projectPaymentRows(
    filterProjects(data.data?.projects ?? [], {
      viewMode: filter.viewMode,
      viewL4: filter.viewL4,
      viewPM: filter.viewPM,
      naguanOn: filter.naguanOn,
      naguanExclude: (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
    }),
    (data.data?.projectPmis ?? {}) as Record<string, any>,
  ),
)

const summary = computed(() => summaryByDim(rows.value, props.dim))
const dimLabel = computed(() => PAY_FACET_DIMS.find((d) => d.key === props.dim)?.label ?? '维度')

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
    <section class="dim-summary">
      <div class="ds-head">{{ dimLabel }}汇总</div>
      <table class="ds-table u-num">
        <thead>
          <tr>
            <th>{{ dimLabel }}</th>
            <th>项目数</th>
            <th>合同Σ(万)</th>
            <th>已回Σ(万)</th>
            <th>完成率</th>
            <th>延期节点Σ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in summary" :key="s.value">
            <td class="ds-val">{{ s.value }}</td>
            <td>{{ s.projectCount }}</td>
            <td>{{ fmtWan(s.contractSum) }}</td>
            <td>{{ fmtWan(s.actualSum) }}</td>
            <td :style="{ color: rateColorPmis(s.rate) }">{{ fmtRatio(s.rate) }}</td>
            <td>{{ s.delayedNodeSum }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <DataTable :columns="COLS" :rows="rows" clickable @row-click="onRow">
      <template #cell-paymentRatio="{ value }">
        <span class="u-num" :style="{ color: rateColorPmis(value) }">{{ fmtRatio(value) }}</span>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.dim-summary { margin-bottom: var(--gap-section); }
.ds-head { font-size: var(--fs-2); color: var(--sub); margin-bottom: var(--sp-2); }
.ds-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.ds-table th,
.ds-table td { border: 1px solid var(--line); padding: 8px 12px; text-align: right; }
.ds-table th:first-child,
.ds-table td.ds-val { text-align: left; }
.ds-table th { background: var(--card2); color: var(--sub); font-weight: 600; }
.ds-table td { color: var(--txt); }
</style>
