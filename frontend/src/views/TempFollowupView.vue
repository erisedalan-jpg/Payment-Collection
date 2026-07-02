<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildTempRows, buildScopeInputs, type TempRow } from '@/lib/tempFollowup'
import { projectMatches } from '@/lib/tempScope'
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
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'

defineOptions({ name: 'TempFollowupView' })
useViewScrollMemory()

const TABLE_ID = 'temp-followup'
const data = useDataStore()
const auth = useAuthStore()
const temp = useTempFollowupStore()
const cf = useCrossFilterStore()
const router = useRouter()

// 进页清空本表残留列筛选（keep-alive 下：菜单进入=新挂载会重置，下钻返回=缓存激活不重置）
cf.clearAll(TABLE_ID)

onMounted(() => {
  if (!data.data) data.load()
  if (!temp.loaded) temp.load()
})

const mode = ref<'current' | 'history'>('current')
const historyIdx = ref(0)
const isCurrent = computed(() => mode.value === 'current')

const datasetOpts = computed(() => [
  { value: 'current', label: '当前数据' },
  ...temp.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime })),
])
const historyOpts = computed(() => temp.archives.map((a, i) => ({ value: i, label: a.archiveTime })))
watch(() => [mode.value, temp.archives.length] as const, () => {
  if (mode.value === 'history') historyIdx.value = Math.max(0, temp.archives.length - 1)
})

const projects = computed(() => (data.data?.projects ?? []) as Project[])
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)
const scopeInputs = computed(() =>
  buildScopeInputs(projects.value, pmisMap.value,
    (data.data as any)?.paymentNodes ?? {}, (data.data as any)?.projectMilestones ?? {}))
const inScopeIds = computed(() => new Set(
  scopeInputs.value.filter((i) => projectMatches(i, temp.scope)).map((i) => i.id)))

const currentRows = computed<TempRow[]>(() =>
  buildTempRows(projects.value, pmisMap.value, temp.current, inScopeIds.value))
const rows = computed<TempRow[]>(() =>
  isCurrent.value ? currentRows.value : ((temp.archives[historyIdx.value]?.rows ?? []) as TempRow[]))
const filtered = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as TempRow[])

const ALL_COLUMNS: DataColumn[] = withSortable([
  { key: 'projectId', label: '项目编号', width: 160 },
  { key: 'customer', label: '客户', width: 180 },
  { key: 'projectName', label: '项目名称', width: 200 },
  { key: 'projectLevel', label: '项目级别', width: 90 },
  { key: 'projectManager', label: '项目经理', width: 96 },
  { key: 'ar', label: 'AR', width: 90 },
  { key: 'sr', label: 'SR', width: 90 },
  { key: 'orgL4', label: 'L4组织', width: 110 },
  { key: 'contractWan', label: '合同金额(万)', width: 110, sortable: true, num: true,
    formatter: (v) => (v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'riskLevel', label: '风险', width: 96, formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true },
  { key: 'followDate', label: '跟进日期', width: 160, sortable: true },
  { key: 'followBy', label: '跟进人', width: 120 },
  // —— 额外可选列(默认隐藏),便于看清为何入选 ——
  { key: 'stage', label: '阶段', width: 100 },
  { key: 'projectType', label: '项目类型', width: 110 },
  { key: 'projectStatus', label: '项目状态', width: 100 },
  { key: 'health', label: '健康度', width: 96 },
  { key: 'progress', label: '完工%', width: 90, num: true,
    formatter: (v) => (v == null ? '-' : (Number(v) * 100).toFixed(0) + '%') },
  { key: 'paymentRatio', label: '回款完成率', width: 105, num: true,
    formatter: (v) => (v == null ? '-' : (Number(v) * 100).toFixed(1) + '%') },
  { key: 'costRatio', label: '消耗比', width: 90, num: true,
    formatter: (v) => (v == null ? '-' : (Number(v) * 100).toFixed(1) + '%') },
  { key: 'paymentStatus', label: '回款状态', width: 100 },
  { key: 'top1000', label: 'TOP1000', width: 90 },
  { key: 'quadrant', label: '象限', width: 140 },
  { key: 'milestoneStatus', label: '里程碑状态', width: 120 },
])
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
// 默认可见 = key 页那 14 列(额外列默认隐藏)
const DEFAULT_VISIBLE = ['projectId', 'customer', 'projectName', 'projectLevel', 'projectManager', 'ar', 'sr',
  'orgL4', 'contractWan', 'riskLevel', 'weekProgress', 'nextPlan', 'followDate', 'followBy']
const FILTERABLE = new Set(['projectLevel', 'projectManager', 'ar', 'sr', 'orgL4', 'riskLevel', 'followBy', 'followDate',
  'stage', 'projectType', 'projectStatus', 'health', 'paymentStatus', 'top1000', 'quadrant', 'milestoneStatus'])
const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

function progCell(row: TempRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  const c = row[field]
  if (!c) return isCurrent.value ? '点击填写' : '-'
  return `${t}：${c}`
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }

// 进展编辑(走 temp store)
const editOpen = ref(false)
const editCtx = reactive({ projectId: '', projectName: '', field: 'weekProgress' as 'weekProgress' | 'nextPlan', initial: '' })
function openEdit(row: TempRow, field: 'weekProgress' | 'nextPlan') {
  if (!isCurrent.value) return
  editCtx.projectId = row.projectId; editCtx.projectName = row.projectName
  editCtx.field = field; editCtx.initial = row[field] ?? ''
  editOpen.value = true
}

// 范围设置(超管)
const scopeOpen = ref(false)

// 删除历史快照(超管)
const delConfirm = ref(false)
const deleting = ref(false)
async function doDeleteArchive() {
  deleting.value = true
  try {
    await temp.deleteArchive(historyIdx.value)
    delConfirm.value = false
    if (!temp.archives.length) mode.value = 'current'
    else historyIdx.value = Math.min(historyIdx.value, temp.archives.length - 1)
  } finally { deleting.value = false }
}

// 更新归档(超管)
const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await temp.archive(currentRows.value as any); archiveConfirm.value = false; mode.value = 'current' }
  finally { archiving.value = false }
}

// 导出(超管):多数据集多 sheet,按当前显示列
const exportOpen = ref(false)
const exportSel = ref<string[]>(['current'])
const allSelected = computed(() => exportSel.value.length > 0 && exportSel.value.length === datasetOpts.value.length)
const exportIndeterminate = computed(() => exportSel.value.length > 0 && exportSel.value.length < datasetOpts.value.length)
function toggleAllExport(val: boolean) { exportSel.value = val ? datasetOpts.value.map((o) => o.value) : [] }
function exportRow(r: TempRow): Record<string, unknown> {
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
    const src: TempRow[] = sel === 'current' ? currentRows.value
      : ((temp.archives[Number(sel.slice(1))]?.rows ?? []) as TempRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as TempRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`临时重点跟进_${exportSel.value.length}集.xlsx`, sheets)
  exportOpen.value = false
}

defineExpose({ editOpen, editCtx, mode, historyIdx, isCurrent, scopeOpen, exportSel, allSelected, datasetOpts, toggleAllExport, inScopeIds, scopeInputs })
</script>

<template>
  <div class="temp-followup-view">
    <h2 class="kp-title">临时重点跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="mode" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="mode === 'history'" v-model="historyIdx" size="small" style="width: 200px"
        :disabled="!temp.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in historyOpts" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <button v-if="auth.isSuper && mode === 'history' && temp.archives.length" class="kp-archive-btn"
        @click="delConfirm = true">删除此历史</button>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">更新（归档+清空）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="exportOpen = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!rows.length" class="kp-empty">
      {{ auth.isSuper ? '请点击「范围设置」定义临时跟进范围。' : '暂无临时重点跟进项目。' }}
    </div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="filtered" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" />
          </span>
        </template>
        <template #cell-weekProgress="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as TempRow, 'weekProgress')">{{ progCell(row as TempRow, 'weekProgress') }}</span>
        </template>
        <template #cell-nextPlan="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as TempRow, 'nextPlan')">{{ progCell(row as TempRow, 'nextPlan') }}</span>
        </template>
      </DataTable>
    </div>

    <ProgressEditModal v-model="editOpen" store="temp"
      :project-id="editCtx.projectId" :project-name="editCtx.projectName" :field="editCtx.field" :initial="editCtx.initial" />

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="scopeInputs" :initial="temp.scope"
      @save="(s) => temp.saveScope(s)" />

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
.temp-followup-view { padding: var(--sp-4); }
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
</style>
