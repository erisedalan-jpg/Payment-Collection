<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePagedRows } from '@/lib/usePagedRows'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import SegToggle from '@/components/SegToggle.vue'
import { fmtWan, fmtRatio } from '@/lib/format'
import { paymentNodeRows, nodeSummary, filterProjects, PAY_FACET_DIMS } from '@/lib/paymentPmis'
import { inRange } from '@/lib/paymentRange'

const dim = ref<'dept' | 'stage' | 'tier' | 'progress'>('dept')
const DIM_OPTS = PAY_FACET_DIMS.map((d) => ({ value: d.key, label: d.label }))
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()

const rows = computed(() => {
  const ps = filterProjects(data.data?.projects ?? [], {
    viewMode: filter.viewMode,
    viewL4: filter.viewL4,
    viewPM: filter.viewPM,
    excludeActive: filter.excludeOn,
    excludedIds: filter.excludedIds,
  })
  const allNodes = paymentNodeRows(data.data?.paymentNodes, ps, data.data?.projectPmis ?? {})
  // 按计划日∈区间过滤（全部区间时 inRange 恒真）
  return allNodes.filter((n) => inRange(n.planDate, filter.dateStart, filter.dateEnd))
})
const sum = computed(() => nodeSummary(rows.value))
const { paged, currentPage, pageSize } = usePagedRows(rows, 50)

// 按选中维度分组（spec §3：节点 tab 可按维度分组；维度已 join 到节点所属项目）
// 维度 key 'stage' 取项目阶段字段 projStage（区别于节点阶段名 stage）
const dimField = computed(() => (dim.value === 'stage' ? 'projStage' : dim.value))
const dimLabel = computed(() => PAY_FACET_DIMS.find((d) => d.key === dim.value)?.label ?? '维度')
const byDim = computed(() => {
  const m: Record<string, { count: number; reached: number; delayed: number; pending: number; exp: number }> = {}
  for (const r of rows.value) {
    const key = String((r as Record<string, any>)[dimField.value] ?? '未指定')
    const g = (m[key] ||= { count: 0, reached: 0, delayed: 0, pending: 0, exp: 0 })
    g.count++
    if (r.status === '已回款') g.reached++
    else if (r.status === '延期') g.delayed++
    else g.pending++
    g.exp += r.expectedPayment
  }
  return Object.entries(m)
    .map(([value, v]) => ({ value, ...v }))
    .sort((a, b) => b.count - a.count)
})

const COLS: DataColumn[] = [
  { key: 'projectName', label: '项目' },
  { key: 'stage', label: '阶段' },
  { key: 'planDate', label: '计划日' },
  { key: 'actualDate', label: '实际日' },
  { key: 'payRatio', label: '计划比例', formatter: (v) => fmtRatio(v) },
  { key: 'expectedPayment', label: '计划金额(万)', sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'status', label: '状态' },
]
const STATUS_CLASS: Record<string, string> = { 已回款: 'st-ok', 延期: 'st-danger', 待回款: 'st-warn', 部分回款: 'st-warn', 质保期: 'st-warn' }
function onRow(row: Record<string, any>) { pd.open(row.projectId) }
</script>

<template>
  <div class="nodes-tab">
    <div class="pv-ctl">
      <span class="pv-label">维度</span>
      <SegToggle v-model="dim" :options="DIM_OPTS" />
    </div>
    <section class="nsum u-num">
      <div class="ns"><span class="ns-l">节点总数</span><span class="ns-v">{{ sum.total }}</span></div>
      <div class="ns"><span class="ns-l">已回款</span><span class="ns-v" style="color:var(--ok-text)">{{ sum.reached }}</span></div>
      <div class="ns"><span class="ns-l">延期</span><span class="ns-v" style="color:var(--danger-text)">{{ sum.delayed }}</span></div>
      <div class="ns"><span class="ns-l">待回款</span><span class="ns-v" style="color:var(--warn-text)">{{ sum.pending }}</span></div>
      <div class="ns"><span class="ns-l">计划回款Σ(万)</span><span class="ns-v">{{ fmtWan(sum.expectedTotal) }}</span></div>
    </section>
    <section class="dim-summary">
      <div class="ds-head">{{ dimLabel }}分组</div>
      <table class="ds-table u-num">
        <thead>
          <tr><th>{{ dimLabel }}</th><th>节点数</th><th>已回款</th><th>延期</th><th>待回款</th><th>计划回款Σ(万)</th></tr>
        </thead>
        <tbody>
          <tr v-for="g in byDim" :key="g.value">
            <td class="ds-val">{{ g.value }}</td>
            <td>{{ g.count }}</td>
            <td style="color:var(--ok-text)">{{ g.reached }}</td>
            <td style="color:var(--danger-text)">{{ g.delayed }}</td>
            <td style="color:var(--warn-text)">{{ g.pending }}</td>
            <td>{{ fmtWan(g.exp) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <DataTable :columns="COLS" :rows="paged" clickable @row-click="onRow">
      <template #cell-status="{ value }">
        <span class="st-badge" :class="STATUS_CLASS[value] || 'st-warn'">{{ value }}</span>
      </template>
    </DataTable>
    <div class="pn-pager">
      <span class="u-num">共 {{ rows.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="rows.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.pv-ctl { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--gap-card); }
.pv-label { font-size: var(--fs-1); color: var(--mut); }
.nsum { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-card); margin-bottom: var(--gap-section); }
.dim-summary { margin-bottom: var(--gap-section); }
.ds-head { font-size: var(--fs-2); color: var(--sub); margin-bottom: var(--sp-2); }
.ds-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.ds-table th, .ds-table td { border: 1px solid var(--line); padding: 8px 12px; text-align: right; }
.ds-table th:first-child, .ds-table td.ds-val { text-align: left; }
.ds-table th { background: var(--card2); color: var(--sub); font-weight: 600; }
.ds-table td { color: var(--txt); }
.ns { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); display: flex; flex-direction: column; gap: var(--sp-1); }
.ns-l { font-size: var(--fs-1); color: var(--mut); }
.ns-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); }
.st-badge { padding: 2px 8px; border-radius: var(--r-sm); font-size: var(--fs-1); }
.st-ok { background: var(--ok-bg); color: var(--ok-text); }
.st-danger { background: var(--danger-bg); color: var(--danger-text); }
.st-warn { background: var(--warn-bg); color: var(--warn-text); }
.pn-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pn-pager .u-num { font-size: var(--fs-1); color: var(--sub); }
</style>
