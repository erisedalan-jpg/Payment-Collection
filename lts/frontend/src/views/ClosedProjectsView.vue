<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { ClosedProject } from '@/types/analysis'
import { buildClosedRows, filterClosedRows, type ClosedRow } from '@/lib/closedProjectList'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { usePersistentSort } from '@/lib/usePersistentSort'
import { userScopedKey } from '@/lib/userScopedKey'
import { fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'

defineOptions({ name: 'ClosedProjectsView' })
useViewScrollMemory()

const TABLE_ID = 'projects-closed'
const data = useDataStore()
const cf = useCrossFilterStore()
const router = useRouter()
// 每次进页清空本表残留筛选，避免跨导航残留
cf.clearAll(TABLE_ID)
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() => buildClosedRows((data.data?.closedProjects ?? []) as ClosedProject[]))
const search = ref('')
// 先表头列枚举(crossFilter) -> 再全列搜索
const filtered = computed(() => filterClosedRows(applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as ClosedRow[], { search: search.value }))

const ALL_COLUMNS: DataColumn[] = [
  { key: 'projectName', label: '项目名称', width: 220 },
  { key: 'projectId', label: '项目编号', width: 175 },
  { key: 'customer', label: '客户', width: 130 },
  { key: 'signParty', label: '签约单位', width: 130 },
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'orgL4', label: 'L4组', width: 110 },
  { key: 'orgL3_1', label: 'L3-1部门', width: 110 },
  { key: 'projectManager', label: '项目经理', width: 96 },
  { key: 'projectType', label: '项目类型', width: 110 },
  { key: 'projectLevel', label: '级别', width: 80 },
  { key: 'rating', label: '评级', width: 80 },
  { key: 'stage', label: '项目阶段', width: 110 },
  { key: 'projectStatus', label: '项目状态', width: 100 },
  { key: 'closedAt', label: '关闭时间', width: 110, sortable: true },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'overspend', label: '项目超支', width: 90, formatter: (v) => (v === true ? '是' : '否') },
]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ['projectName', 'projectId', 'customer', 'contractAmount', 'orgL4', 'projectManager', 'projectType', 'projectLevel', 'stage', 'projectStatus', 'closedAt', 'costRatio', 'overspend']
const FILTERABLE = new Set(['orgL4', 'orgL3_1', 'projectManager', 'projectType', 'projectLevel', 'rating', 'stage', 'projectStatus'])

const prefs = useColumnPrefs(userScopedKey(TABLE_ID), ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))

// 关列时清其表头筛选(不变式)：collapsed into useColumnPrefs.makeToggle
const onToggle = prefs.makeToggle(cf, TABLE_ID)
const psort = usePersistentSort(userScopedKey(TABLE_ID))

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

function onRow(row: Record<string, any>) { router.push(`/closed-project/${row.projectId}`) }
</script>

<template>
  <div class="closed-view">
    <h2 class="cv-title">已关闭项目</h2>
    <div class="toolbar">
      <el-input v-model="search" size="small" placeholder="搜索 项目名/编号/客户/经理" clearable style="width: 230px" />
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!rows.length" class="cv-empty">暂无已关闭项目数据——请在「数据管理」提供 PMIS 已关闭三表后点「更新数据」。</div>
    <div v-else class="cv-scroll">
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable sticky-header :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange" @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="cv-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" /></span>
        </template>
      </DataTable>
    </div>

    <div v-if="rows.length" class="cv-pager">
      <span class="cv-total u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.closed-view { padding: var(--sp-4); }
.cv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.cv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.cv-scroll { overflow-x: auto; }
.cv-th { display: inline-flex; align-items: center; }
.cv-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.cv-total { font-size: var(--fs-1); color: var(--sub); }
</style>
