<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePagedRows } from '@/lib/usePagedRows'
import { useExternalSort } from '@/lib/useExternalSort'
import { userScopedKey } from '@/lib/userScopedKey'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useCrossFilterStore } from '@/stores/crossFilter'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import TagFilterSelect from '@/components/TagFilterSelect.vue'
import { fmtWan, fmtRatio } from '@/lib/format'
import { paymentNodeRows, nodeSummary, filterProjects } from '@/lib/paymentPmis'
import { inRange } from '@/lib/paymentRange'
import { applyColumnFilters } from '@/lib/crossFilter'
import { tagMatch } from '@/lib/tagFilter'
import { exportRows } from '@/lib/exportXlsx'

defineOptions({ name: 'PayNodesView' })

const TABLE_ID = 'pay-nodes'
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()
const tags = useProjectTagsStore()
const cf = useCrossFilterStore()

onMounted(() => { if (!tags.tags.length) tags.load() })
// 进页先清空本表残留列筛选，避免跨导航叠加
cf.clearAll(TABLE_ID)

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
// 5 卡口径 = 区间过滤后全集（不随主表列筛选/标签筛选/排序变化，保持既有语义）
const sum = computed(() => nodeSummary(rows.value))

const COLS: DataColumn[] = [
  { key: 'projectName', label: '项目', wrap: true, sortable: true },
  { key: 'projectManager', label: '项目经理', width: 100, sortable: true },
  { key: 'dept', label: 'L4组', width: 110, sortable: true },
  { key: 'stage', label: '阶段', width: 100, sortable: true },
  { key: 'planDate', label: '计划日', width: 110, sortable: true },
  { key: 'actualDate', label: '实际日', width: 110, sortable: true },
  { key: 'payRatio', label: '计划比例', width: 100, num: true, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'expectedPayment', label: '计划金额(万)', width: 120, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'status', label: '状态', width: 100, sortable: true },
]
const STATUS_CLASS: Record<string, string> = { 已回款: 'st-ok', 延期: 'st-danger', 待回款: 'st-warn', 部分回款: 'st-warn', 质保期: 'st-warn' }
// 枚举列可列头多选筛选
const FILTERABLE = new Set(['projectManager', 'dept', 'stage', 'status'])
// 数值列排序按数值，其余按中文 localeCompare
const NUMERIC_KEYS = new Set(['payRatio', 'expectedPayment'])

const selectedTags = ref<string[]>([])

// 列头多选筛选 → 标签筛选
const filtered = computed(() => {
  const colFiltered = applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID))
  return colFiltered.filter((r) => tagMatch(tags.tagsOf(r.projectId), selectedTags.value))
})

// 表头排序（custom，跨页排全集）
const { sortState, onSortChange, sorted, defaultSort } = useExternalSort(filtered, NUMERIC_KEYS, userScopedKey(TABLE_ID))

const { paged, currentPage, pageSize } = usePagedRows(sorted, 50)

function onRow(row: Record<string, any>) { pd.open(row.projectId) }
function onExport() {
  exportRows('回款节点.xlsx', sorted.value.map((r) => ({
    项目: r.projectName, 项目经理: r.projectManager, L4组: r.dept, 阶段: r.stage,
    计划日: r.planDate, 实际日: r.actualDate, 计划比例: fmtRatio(r.payRatio), 计划金额万: fmtWan(r.expectedPayment),
    状态: r.status,
  })))
}
</script>

<template>
  <div class="nodes-tab">
    <section class="nsum u-num">
      <div class="ns"><span class="ns-l">节点总数</span><span class="ns-v">{{ sum.total }}</span></div>
      <div class="ns"><span class="ns-l">已回款</span><span class="ns-v" style="color:var(--ok-text)">{{ sum.reached }}</span></div>
      <div class="ns"><span class="ns-l">延期</span><span class="ns-v" style="color:var(--danger-text)">{{ sum.delayed }}</span></div>
      <div class="ns"><span class="ns-l">待回款</span><span class="ns-v" style="color:var(--warn-text)">{{ sum.pending }}</span></div>
      <div class="ns"><span class="ns-l">计划回款Σ(万)</span><span class="ns-v">{{ fmtWan(sum.expectedTotal) }}</span></div>
    </section>
    <div class="pv-bar">
      <TagFilterSelect v-model="selectedTags" />
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
      <button class="pv-btn" data-test="pay-nodes-export" @click="onExport">导出Excel</button>
    </div>
    <div class="pv-scroll">
      <DataTable :columns="COLS" :rows="paged" :show-count="false" clickable external-sort sticky-header
        @row-click="onRow" @sort-change="onSortChange" :default-sort="defaultSort">
        <template v-for="col in COLS" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="pv-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" /></span>
        </template>
        <template #cell-status="{ value }">
          <span class="st-badge" :class="STATUS_CLASS[value] || 'st-warn'">{{ value }}</span>
        </template>
      </DataTable>
    </div>
    <div v-if="sorted.length" class="pn-pager">
      <span class="u-num">共 {{ sorted.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="sorted.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.nsum { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-card); margin-bottom: var(--gap-section); }
.ns { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); display: flex; flex-direction: column; gap: var(--sp-1); }
.ns-l { font-size: var(--fs-1); color: var(--mut); }
.ns-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); }
.pv-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.pv-th { display: inline-flex; align-items: center; }
.pv-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.pv-btn:hover { background: var(--bg); color: var(--accent); }
.pv-scroll { overflow-x: auto; }
.st-badge { padding: 2px 8px; border-radius: var(--r-sm); font-size: var(--fs-1); }
.st-ok { background: var(--ok-bg); color: var(--ok-text); }
.st-danger { background: var(--danger-bg); color: var(--danger-text); }
.st-warn { background: var(--warn-bg); color: var(--warn-text); }
.pn-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pn-pager .u-num { font-size: var(--fs-1); color: var(--sub); }
</style>
