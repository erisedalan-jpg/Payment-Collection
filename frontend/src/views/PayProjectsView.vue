<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { ProjectPmis } from '@/types/analysis'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import TagFilterSelect from '@/components/TagFilterSelect.vue'
import { fmtWan, fmtRatio } from '@/lib/format'
import { projectPaymentRows, filterProjects, rateColorPmis } from '@/lib/paymentPmis'
import { applyColumnFilters } from '@/lib/crossFilter'
import { tagMatch } from '@/lib/tagFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { userScopedKey } from '@/lib/userScopedKey'
import { usePagedRows } from '@/lib/usePagedRows'
import { useExternalSort } from '@/lib/useExternalSort'
import { exportRows } from '@/lib/exportXlsx'

defineOptions({ name: 'PayProjectsView' })

const TABLE_ID = 'pay-projects'
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()
const tags = useProjectTagsStore()
const cf = useCrossFilterStore()

onMounted(() => {
  if (!data.data) data.load()
  if (!tags.tags.length) tags.load()
})
// 进页先清空本表残留列筛选，避免跨导航叠加
cf.clearAll(TABLE_ID)

const rows = computed(() =>
  projectPaymentRows(
    filterProjects(data.data?.projects ?? [], {
      viewMode: filter.viewMode,
      viewL4: filter.viewL4,
      viewPM: filter.viewPM,
      excludeActive: filter.excludeOn,
      excludedIds: filter.excludedIds,
    }),
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
    data.data?.paymentNodes,
    filter.payRecordsAll,
    filter.dateStart,
    filter.dateEnd,
  ),
)

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 150, sortable: true },
  { key: 'projectName', label: '项目名称', wrap: true, sortable: true },
  { key: 'projectManager', label: '经理', width: 90, sortable: true },
  { key: 'dept', label: '部门', width: 110, sortable: true },
  { key: 'projectLevel', label: '项目级别', width: 90, sortable: true },
  { key: 'contract', label: '合同(万)', width: 110, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'actualTotal', label: '已回款(万)', width: 110, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'paymentRatio', label: '完成率', width: 90, num: true, sortable: true },
  { key: 'expectedTotal', label: '计划回款(万)', width: 120, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'nodeCount', label: '节点', width: 70, num: true, sortable: true },
  { key: 'reachedCount', label: '达成', width: 70, num: true, sortable: true },
  { key: 'delayedCount', label: '延期', width: 70, num: true, sortable: true },
]
const ALL_KEYS = COLS.map((c) => c.key)
// 枚举列可列头多选筛选（对齐 CostDetailView 做法）
const FILTERABLE = new Set(['projectManager', 'dept', 'projectLevel'])
// 数值列排序按数值，其余按中文 localeCompare
const NUMERIC_KEYS = new Set(['contract', 'actualTotal', 'paymentRatio', 'expectedTotal', 'nodeCount', 'reachedCount', 'delayedCount'])

const prefs = useColumnPrefs(userScopedKey(TABLE_ID), ALL_KEYS, ALL_KEYS)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => COLS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = COLS.map((c) => ({ key: c.key, label: c.label }))

const kw = ref('')
const selectedTags = ref<string[]>([])

// 列头多选筛选 → 标签筛选 → 关键词搜索
const filtered = computed(() => {
  const colFiltered = applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID))
  const tagged = colFiltered.filter((r) => tagMatch(tags.tagsOf(r.projectId), selectedTags.value))
  const k = kw.value.trim()
  return k ? tagged.filter((r) => r.projectId.includes(k) || r.projectName.includes(k)) : tagged
})

// 表头排序（custom，跨页排全集）
const { sortState, onSortChange, sorted, defaultSort } = useExternalSort(filtered, NUMERIC_KEYS, userScopedKey(TABLE_ID))

const { paged, currentPage, pageSize } = usePagedRows(sorted, 50)

function onRow(row: Record<string, any>) {
  pd.open(row.projectId)
}
function onExport() {
  exportRows('回款项目.xlsx', sorted.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 经理: r.projectManager, 部门: r.dept,
    项目级别: r.projectLevel, 合同万: fmtWan(r.contract), 已回款万: fmtWan(r.actualTotal),
    完成率: fmtRatio(r.paymentRatio), 计划回款万: fmtWan(r.expectedTotal),
    节点: r.nodeCount, 达成: r.reachedCount, 延期: r.delayedCount,
  })))
}
</script>

<template>
  <div class="pov-tab">
    <div class="pov-bar">
      <el-input v-model="kw" size="small" placeholder="编号/名称" style="width: 160px" clearable />
      <TagFilterSelect v-model="selectedTags" />
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="prefs.toggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
      <button class="pov-btn" data-test="pay-projects-export" @click="onExport">导出Excel</button>
    </div>
    <div class="pov-scroll">
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable external-sort
        @row-click="onRow" @sort-change="onSortChange" :default-sort="defaultSort">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="pov-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" /></span>
        </template>
        <template #cell-paymentRatio="{ value }">
          <span class="u-num" :style="{ color: rateColorPmis(value) }">{{ fmtRatio(value) }}</span>
        </template>
      </DataTable>
    </div>
    <div v-if="sorted.length" class="pov-pager">
      <span class="u-num">共 {{ sorted.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="sorted.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.pov-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.pov-th { display: inline-flex; align-items: center; }
.pov-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.pov-btn:hover { background: var(--bg); color: var(--accent); }
.pov-scroll { overflow-x: auto; }
.pov-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pov-pager .u-num { font-size: var(--fs-1); color: var(--sub); }
</style>
