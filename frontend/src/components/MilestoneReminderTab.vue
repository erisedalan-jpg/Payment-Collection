<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { MilestoneProject } from '@/lib/milestoneAnalytics'
import { buildReminderRows, reminderRange, reminderStat, type ReminderPreset, type ReminderRow } from '@/lib/milestoneDetailRows'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { usePersistentSort } from '@/lib/usePersistentSort'
import { userScopedKey } from '@/lib/userScopedKey'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters } from '@/lib/crossFilter'
import { exportRows } from '@/lib/exportXlsx'
import DataTable, { type DataColumn } from './DataTable.vue'
import StatusBadge from './StatusBadge.vue'
import ColumnFilter from './ColumnFilter.vue'
import ColumnPicker from './ColumnPicker.vue'

const props = defineProps<{ projects: MilestoneProject[]; now: Date }>()
const router = useRouter()

const TABLE_ID = 'milestone-reminder'

const cf = useCrossFilterStore()
cf.clearAll(TABLE_ID)

// 时间段:默认未来1个月;快捷档写 rangeModel;清空=全部
const m1 = reminderRange(props.now, 'm1')
const rangeModel = ref<[string, string] | null>([m1.start, m1.end])
const range = computed(() => (rangeModel.value ? { start: rangeModel.value[0], end: rangeModel.value[1] } : null))
function preset(p: ReminderPreset) { const r = reminderRange(props.now, p); rangeModel.value = [r.start, r.end] }

const winRows = computed(() => buildReminderRows(props.projects, props.now, range.value))

const fKw = ref('')
const filtered = computed<ReminderRow[]>(() => {
  const afterCols = applyColumnFilters(winRows.value, cf.tableFilters(TABLE_ID)) as ReminderRow[]
  const kw = fKw.value.trim()
  return kw ? afterCols.filter((r) => r.projectId.includes(kw) || r.projectName.includes(kw)) : afterCols
})

const stat = computed(() => reminderStat(filtered.value))

const PR_TONE: Record<string, string> = { high: 'danger', mid: 'warn', low: 'mut' }
const fmtWan = (v: number) => (v ? (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '-')

const ALL_COLUMNS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 150 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'contract', label: '项目金额(万)', width: 110, num: true, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'projectType', label: '项目类型', width: 100 },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'orgL3', label: 'L3部门', width: 110 },
  { key: 'orgL4', label: 'L4部门', width: 110 },
  { key: 'node', label: '到期节点', width: 110 },
  { key: 'planDate', label: '计划时间', width: 110, num: true, sortable: true },
  { key: 'actualDate', label: '实际完成时间', width: 120, num: true, sortable: true, formatter: (v) => (v ? String(v) : '-') },
  { key: 'done', label: '是否完成', width: 90 },
  { key: 'payStage', label: '回款阶段', width: 150, wrap: true },
  { key: 'linked', label: '是否关联回款', width: 110 },
  { key: 'priorityLabel', label: '处置优先级', width: 100 },
]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ['projectId', 'projectName', 'contract', 'manager', 'orgL4', 'node', 'planDate', 'actualDate', 'done', 'priorityLabel']
const prefs = useColumnPrefs(userScopedKey(TABLE_ID), ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))

const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
const FILTERABLE = new Set(['projectType', 'manager', 'orgL3', 'orgL4', 'node', 'done', 'linked', 'priorityLabel'])

const onToggle = prefs.makeToggle(cf, TABLE_ID)
const psort = usePersistentSort(userScopedKey(TABLE_ID))

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }

function onExport() {
  exportRows(`里程碑到期提醒_${filtered.value.length}条.xlsx`, filtered.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, '项目金额(万)': r.contract ? r.contract / 10000 : 0,
    项目类型: r.projectType, 项目经理: r.manager, L3部门: r.orgL3, L4部门: r.orgL4,
    到期节点: r.node, 计划时间: r.planDate, 实际完成时间: r.actualDate, 是否完成: r.done,
    回款阶段: r.payStage, 是否关联回款: r.linked, 处置优先级: r.priorityLabel,
  })))
}

defineExpose({ rangeModel, filtered })
</script>

<template>
  <div class="mrt">
    <div class="mrt-bar">
      <el-date-picker v-model="rangeModel" type="daterange" value-format="YYYY-MM-DD" unlink-panels
        range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" size="small" clearable style="width: 260px" />
      <button class="mrt-btn" data-test="rng-d7" @click="preset('d7')">未来7天</button>
      <button class="mrt-btn" data-test="rng-m1" @click="preset('m1')">未来1个月</button>
      <button class="mrt-btn" data-test="rng-quarter" @click="preset('quarter')">本季度</button>
      <el-input v-model="fKw" size="small" placeholder="编号/名称" clearable style="width: 150px" data-test="mrt-kw" />
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button class="mrt-btn" data-test="mrt-export" @click="onExport">导出Excel</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>
    <div class="mrt-stats">
      <div class="mrt-card"><div class="mrt-k">到期节点总数</div><div class="mrt-v u-num">{{ stat.total }}</div></div>
      <div class="mrt-card"><div class="mrt-k">已完成</div><div class="mrt-v u-num">{{ stat.done }}</div></div>
      <div class="mrt-card"><div class="mrt-k">未完成</div><div class="mrt-v u-num">{{ stat.undone }}</div></div>
      <div class="mrt-card"><div class="mrt-k">逾期未完成</div><div class="mrt-v mrt-v-danger u-num">{{ stat.overdue }}</div></div>
    </div>
    <div class="mrt-scroll">
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange" @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="mrt-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="winRows" /></span>
        </template>
        <!-- 以下 cell 插槽保持 Task 2 不变 -->
        <template #cell-projectId="{ value }"><span class="mrt-link">{{ value }}</span></template>
        <template #cell-planDate="{ row, value }"><span :class="['u-num', row.urgency ? 'mrt-date-' + row.urgency : '']">{{ value }}</span></template>
        <template #cell-done="{ value }"><StatusBadge :label="value" :tone="value === '是' ? 'ok' : 'mut'" /></template>
        <template #cell-linked="{ value }"><StatusBadge :label="value" :tone="value === '是' ? 'ok' : 'mut'" /></template>
        <template #cell-priorityLabel="{ row, value }"><StatusBadge :label="value" :tone="PR_TONE[row.priority]" /></template>
      </DataTable>
    </div>
    <div class="mrt-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 80, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.mrt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mrt-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-card); margin-bottom: var(--sp-3); }
.mrt-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.mrt-k { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.mrt-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.mrt-v-danger { color: var(--danger); }
.mrt-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.mrt-btn:hover { background: var(--bg); color: var(--accent); }
.mrt-scroll { overflow-x: auto; }
.mrt-link { color: var(--accent); cursor: pointer; }
.mrt-date-urgent { color: var(--danger); font-weight: 600; }
.mrt-date-warn { color: var(--warn-text); font-weight: 600; }
.mrt-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
.mrt-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
</style>
