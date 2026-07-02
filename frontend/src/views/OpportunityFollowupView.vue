<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { useOpportunityFollowupStore } from '@/stores/opportunityFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { OPP_COLUMNS, FILTERABLE as OPP_FILTERABLE, type OppColumn } from '@/lib/opportunityColumns'
import { OPP_SCOPE_CATALOG, opportunityMatches } from '@/lib/opportunityScope'
import { buildOppFollowupRows, type OppFollowupRow } from '@/lib/opportunityFollowup'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { withSortable } from '@/lib/columnSort'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import Modal from '@/components/Modal.vue'
import SegToggle from '@/components/SegToggle.vue'
import ProgressEditModal from '@/components/ProgressEditModal.vue'
import ScopeBuilder from '@/components/ScopeBuilder.vue'
import { exportSheets } from '@/lib/exportXlsx'

const TABLE_ID = 'opportunity-followup'
const auth = useAuthStore()
const opps = useOpportunitiesStore()
const oppf = useOpportunityFollowupStore()
const cf = useCrossFilterStore()

onMounted(() => {
  if (!opps.loaded) opps.load()
  if (!oppf.loaded) oppf.load()
})

const now = new Date()

const mode = ref<'current' | 'history'>('current')
const historyIdx = ref(0)
const isCurrent = computed(() => mode.value === 'current')

const datasetOpts = computed(() => [
  { value: 'current', label: '当前数据' },
  ...oppf.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime })),
])
const historyOpts = computed(() => oppf.archives.map((a, i) => ({ value: i, label: a.archiveTime })))
watch(() => [mode.value, oppf.archives.length] as const, () => {
  if (mode.value === 'history') historyIdx.value = Math.max(0, oppf.archives.length - 1)
})

// 全部商机行(注入派生+跟进) → 供 ScopeBuilder 命中计数;再按 scope 过滤为当前清单
const allRows = computed<OppFollowupRow[]>(() => buildOppFollowupRows(opps.rows, oppf.current, now))
const inScopeRows = computed<OppFollowupRow[]>(() => allRows.value.filter((r) => opportunityMatches(r, oppf.scope)))
const rows = computed<OppFollowupRow[]>(() =>
  isCurrent.value ? inScopeRows.value : ((oppf.archives[historyIdx.value]?.rows ?? []) as OppFollowupRow[]))
const filtered = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as OppFollowupRow[])

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

function oppToDataColumn(c: OppColumn): DataColumn {
  const base: DataColumn = { key: c.key, label: c.label, width: c.width, wrap: c.wrap, sortable: c.sortable }
  if (c.type === 'number')
    return { ...base, num: true, formatter: (v) => (v === '' || v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) }
  if (c.type === 'date')
    return { ...base, formatter: (v) => (String(v || '').slice(0, 10) || '-') }
  return { ...base, formatter: (v) => (v === '' || v == null ? '-' : String(v)) }
}
const FOLLOWUP_COLUMNS: DataColumn[] = [
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true, formatter: (v, r) => (v ? `${r.weekProgressEditTime}：${v}` : '') },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true, formatter: (v, r) => (v ? `${r.nextPlanEditTime}：${v}` : '') },
  { key: 'followDate', label: '跟进日期', width: 160, sortable: true },
  { key: 'followBy', label: '跟进人', width: 120 },
]
const ALL_COLUMNS: DataColumn[] = withSortable([...OPP_COLUMNS.map(oppToDataColumn), ...FOLLOWUP_COLUMNS])
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ['name', 'customer', 'top1000', 'amountWan', 'opportunityLevel', 'status', 'frOwner',
  'weekProgress', 'nextPlan', 'followDate', 'followBy']
const FILTERABLE = new Set<string>([...OPP_FILTERABLE, 'followBy', 'followDate'])
const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

function progCell(row: OppFollowupRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  const c = row[field]
  if (!c) return isCurrent.value ? '点击填写' : '-'
  return `${t}：${c}`
}

// 进展编辑(走 oppFollowup store;projectId 位置传 oppId)
const editOpen = ref(false)
const editCtx = reactive({ projectId: '', projectName: '', field: 'weekProgress' as 'weekProgress' | 'nextPlan', initial: '' })
function openEdit(row: OppFollowupRow, field: 'weekProgress' | 'nextPlan') {
  if (!isCurrent.value) return
  editCtx.projectId = row.id; editCtx.projectName = String(row.name ?? row.id)
  editCtx.field = field; editCtx.initial = row[field] ?? ''
  editOpen.value = true
}

const scopeOpen = ref(false)

// 删除历史快照(超管)
const delConfirm = ref(false)
const deleting = ref(false)
async function doDeleteArchive() {
  deleting.value = true
  try {
    await oppf.deleteArchive(historyIdx.value)
    delConfirm.value = false
    if (!oppf.archives.length) mode.value = 'current'
    else historyIdx.value = Math.min(historyIdx.value, oppf.archives.length - 1)
  } finally { deleting.value = false }
}

const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await oppf.archive(inScopeRows.value as any); archiveConfirm.value = false; mode.value = 'current' }
  finally { archiving.value = false }
}

const exportOpen = ref(false)
const exportSel = ref<string[]>(['current'])
const allSelected = computed(() => exportSel.value.length > 0 && exportSel.value.length === datasetOpts.value.length)
const exportIndeterminate = computed(() => exportSel.value.length > 0 && exportSel.value.length < datasetOpts.value.length)
function toggleAllExport(val: boolean) { exportSel.value = val ? datasetOpts.value.map((o) => o.value) : [] }
function exportRow(r: OppFollowupRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of visibleColumns.value) {
    const v = (r as any)[col.key]
    out[col.label] = col.formatter ? col.formatter(v, r) : (v ?? '')
  }
  return out
}
function doExport() {
  const sheets = exportSel.value.map((sel) => {
    const opt = datasetOpts.value.find((o) => o.value === sel)
    const src: OppFollowupRow[] = sel === 'current' ? inScopeRows.value
      : ((oppf.archives[Number(sel.slice(1))]?.rows ?? []) as OppFollowupRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as OppFollowupRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`重点商机跟进_${exportSel.value.length}集.xlsx`, sheets)
  exportOpen.value = false
}

defineExpose({ scopeOpen, mode, historyIdx, isCurrent, editOpen, editCtx, inScopeRows, allRows, exportSel, allSelected, datasetOpts, toggleAllExport })
</script>

<template>
  <div class="opp-followup-view">
    <h2 class="kp-title">重点商机跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="mode" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="mode === 'history'" v-model="historyIdx" size="small" style="width: 200px"
        :disabled="!oppf.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in historyOpts" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <button v-if="auth.isSuper && mode === 'history' && oppf.archives.length" class="kp-archive-btn"
        @click="delConfirm = true">删除此历史</button>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">更新（归档+清空）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="exportOpen = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!rows.length" class="kp-empty">
      {{ auth.isSuper ? '请点击「范围设置」定义重点商机跟进范围（默认：TOP1000 且 提前介入 且 重点商机 且 状态非赢单）。' : '暂无重点商机跟进。' }}
    </div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" />
          </span>
        </template>
        <template #cell-weekProgress="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as OppFollowupRow, 'weekProgress')">{{ progCell(row as OppFollowupRow, 'weekProgress') }}</span>
        </template>
        <template #cell-nextPlan="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as OppFollowupRow, 'nextPlan')">{{ progCell(row as OppFollowupRow, 'nextPlan') }}</span>
        </template>
      </DataTable>
    </div>

    <div v-if="filtered.length" class="kp-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>

    <ProgressEditModal v-model="editOpen" store="oppFollowup"
      :project-id="editCtx.projectId" :project-name="editCtx.projectName" :field="editCtx.field" :initial="editCtx.initial" />

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="allRows" :initial="oppf.scope"
      :catalog="OPP_SCOPE_CATALOG" :single-table="true" :match-fn="opportunityMatches"
      title="范围设置（重点商机跟进）" count-unit="商机" @save="(s) => oppf.saveScope(s)" />

    <Modal v-model="delConfirm" title="删除历史快照" width="420px">
      <div>将永久删除该条历史快照（{{ historyOpts[historyIdx]?.label }}），不可恢复。确认删除？</div>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="delConfirm = false">取消</button>
        <button class="kp-archive-btn" :disabled="deleting" @click="doDeleteArchive">确认删除</button>
      </div>
    </Modal>

    <Modal v-model="archiveConfirm" title="更新（归档）" width="420px">
      <div>将把当前数据归档为历史快照，并清空两列进展（开始新一期）。确认更新？</div>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="archiveConfirm = false">取消</button>
        <button class="kp-archive-btn" :disabled="archiving" @click="doArchive">确认更新</button>
      </div>
    </Modal>

    <Modal v-model="exportOpen" title="导出数据集" width="420px">
      <el-checkbox :model-value="allSelected" :indeterminate="exportIndeterminate" @change="toggleAllExport($event as boolean)">全选</el-checkbox>
      <el-checkbox-group v-model="exportSel">
        <el-checkbox v-for="o in datasetOpts" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
      </el-checkbox-group>
      <div style="margin-top: var(--gap-card)">
        <button class="kp-export-btn" :disabled="!exportSel.length" @click="doExport">导出 xlsx（{{ exportSel.length }} 个数据集，按当前列筛选）</button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.opp-followup-view { padding: var(--sp-4); }
.kp-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.kp-label { font-size: var(--fs-1); color: var(--sub); }
.kp-scroll { overflow-x: auto; }
.kp-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
.kp-empty { padding: var(--sp-5); color: var(--mut); text-align: center; }
.kp-prog-cell { display: inline-block; white-space: pre-wrap; }
.kp-prog-cell.editable { cursor: pointer; color: var(--accent); }
.kp-archive-btn, .kp-export-btn, .kp-cancel {
  font-size: var(--fs-1); border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 2px 10px; cursor: pointer; background: var(--card2); color: var(--accent); }
.kp-archive-btn:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
.kp-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.kp-pager .u-num { font-size: var(--fs-1); color: var(--sub); }
</style>
