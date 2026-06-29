<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useRiskFollowupStore } from '@/stores/riskFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildRiskRows, riskRowMatches, RISK_SCOPE_CATALOG, type RiskRow } from '@/lib/riskRows'
import { RISK_COLUMNS, fmtDateCell } from '@/lib/projectPage'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefsDynamic } from '@/lib/useColumnPrefs'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import Modal from '@/components/Modal.vue'
import SegToggle from '@/components/SegToggle.vue'
import ProgressEditModal from '@/components/ProgressEditModal.vue'
import ScopeBuilder from '@/components/ScopeBuilder.vue'
import { exportSheets } from '@/lib/exportXlsx'

const TABLE_ID = 'risk-followup'
const data = useDataStore()
const auth = useAuthStore()
const risk = useRiskFollowupStore()
const cf = useCrossFilterStore()

onMounted(() => {
  if (!data.data) data.load()
  if (!risk.loaded) risk.load()
})

const mode = ref<'current' | 'history'>('current')
const historyIdx = ref(0)
const isCurrent = computed(() => mode.value === 'current')
const datasetOpts = computed(() => [{ value: 'current', label: '当前数据' },
  ...risk.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime }))])
const historyOpts = computed(() => risk.archives.map((a, i) => ({ value: i, label: a.archiveTime })))
watch(() => [mode.value, risk.archives.length] as const, () => {
  if (mode.value === 'history') historyIdx.value = Math.max(0, risk.archives.length - 1)
})

const projects = computed(() => (data.data?.projects ?? []) as Project[])
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)
const allRows = computed<RiskRow[]>(() => buildRiskRows(projects.value, pmisMap.value, risk.current))
const hasScope = computed(() => risk.scope.groups.some((g) => g.conditions.length))
const scopedRows = computed<RiskRow[]>(() => hasScope.value ? allRows.value.filter((r) => riskRowMatches(r, risk.scope)) : allRows.value)
const currentRows = computed<RiskRow[]>(() => scopedRows.value)
const rows = computed<RiskRow[]>(() => isCurrent.value ? currentRows.value : ((risk.archives[historyIdx.value]?.rows ?? []) as RiskRow[]))
const filtered = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as RiskRow[])

// —— 列模型:风险列(动态) + 项目列(固定) + 跟进列 ——
const PROJECT_COLS: DataColumn[] = [
  { key: '项目编号', label: '项目编号', width: 175, sortable: true },
  { key: '项目名称', label: '项目名称', width: 220, sortable: true },
  { key: '项目金额', label: '项目金额(万)', width: 110, sortable: true, num: true,
    formatter: (v) => (v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: '项目级别', label: '项目级别', width: 80, sortable: true },
  { key: '项目经理', label: '项目经理', width: 96, sortable: true },
  { key: 'L4组织', label: 'L4组织', width: 110, sortable: true },
  { key: '项目类型', label: '项目类型', width: 110, sortable: true },
  { key: '项目状态', label: '项目状态', width: 100, sortable: true },
]
const FOLLOW_COLS: DataColumn[] = [
  { key: 'followAction', label: '跟进动作', width: 240, wrap: true },
  { key: 'revConclusion', label: 'rev结论', width: 240, wrap: true },
  { key: 'nextRevDate', label: '下次rev时间', width: 170, sortable: true },
]
const NON_RISK_KEYS = new Set<string>([
  ...PROJECT_COLS.map((c) => c.key), ...FOLLOW_COLS.map((c) => c.key),
  'projectId', 'riskKey',
  'followActionEditTime', 'followActionEditBy', 'revConclusionEditTime', 'revConclusionEditBy', 'nextRevDateEditTime', 'nextRevDateEditBy',
])
const riskCols = computed<DataColumn[]>(() => {
  const known = new Map(RISK_COLUMNS.map((c) => [c.key, c]))
  const keys: string[] = []
  const seen = new Set<string>()
  for (const r of allRows.value) for (const k of Object.keys(r)) {
    if (!NON_RISK_KEYS.has(k) && !seen.has(k)) { seen.add(k); keys.push(k) }
  }
  return keys.map((k) => {
    const c = known.get(k)
    return { key: k, label: c?.label ?? k, width: c?.width ?? 160, wrap: true, sortable: true,
      formatter: c?.date ? (v: unknown) => fmtDateCell(v) : undefined } as DataColumn
  })
})
const ALL_COLUMNS = computed<DataColumn[]>(() => [...riskCols.value, ...PROJECT_COLS, ...FOLLOW_COLS])
const allKeys = computed(() => ALL_COLUMNS.value.map((c) => c.key))
const DEFAULT_VISIBLE = ['风险编码', '风险等级', '风险状态', '项目编号', '项目名称', '项目金额', '项目级别', '项目经理', 'L4组织',
  '风险名称', '风险大类', '风险小类', '风险描述', 'followAction', 'revConclusion', 'nextRevDate']
const FILTERABLE = new Set(['风险等级', '风险状态', '风险大类', '风险小类', '项目级别', '项目经理', 'L4组织', '项目类型', '项目状态'])
const prefs = useColumnPrefsDynamic(TABLE_ID, allKeys, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.value.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = computed(() => ALL_COLUMNS.value.map((c) => ({ key: c.key, label: c.label })))
function onToggle(key: string) { if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key); prefs.toggle(key) }

// —— 文本编辑(跟进动作/rev结论) ——
const editOpen = ref(false)
const editCtx = reactive({ riskKey: '', title: '', field: 'followAction' as 'followAction' | 'revConclusion', initial: '' })
function progCell(row: RiskRow, field: 'followAction' | 'revConclusion'): string {
  const t = field === 'followAction' ? row.followActionEditTime : row.revConclusionEditTime
  const c = (row as Record<string, any>)[field]
  if (!c) return isCurrent.value ? '点击填写' : '-'
  return `${t}：${c}`
}
function openEdit(row: RiskRow, field: 'followAction' | 'revConclusion') {
  if (!isCurrent.value) return
  editCtx.riskKey = row.riskKey
  editCtx.title = `${row['项目名称'] ?? ''} / 风险 ${row['风险编码'] ?? ''}`
  editCtx.field = field
  editCtx.initial = (row as Record<string, any>)[field] ?? ''
  editOpen.value = true
}

// —— 日期编辑(下次rev时间) ——
async function onDateChange(row: RiskRow, val: string | null) {
  if (!isCurrent.value) return
  await risk.update(row.riskKey, 'nextRevDate', val ?? '')
}

// —— 范围/归档/导出(超管) ——
const scopeOpen = ref(false)
const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await risk.archive(currentRows.value as unknown as Record<string, unknown>[]); archiveConfirm.value = false; mode.value = 'current' }
  finally { archiving.value = false }
}
const exportOpen = ref(false)
const exportSel = ref<string[]>(['current'])
const allSelected = computed(() => exportSel.value.length > 0 && exportSel.value.length === datasetOpts.value.length)
const exportIndeterminate = computed(() => exportSel.value.length > 0 && exportSel.value.length < datasetOpts.value.length)
function toggleAllExport(val: boolean) { exportSel.value = val ? datasetOpts.value.map((o) => o.value) : [] }
function exportRow(r: RiskRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of visibleColumns.value) {
    const v = (r as Record<string, any>)[col.key]
    out[col.label] = col.formatter ? col.formatter(v, r) : (v ?? '')
  }
  return out
}
function doExport() {
  const sheets = exportSel.value.map((sel) => {
    const opt = datasetOpts.value.find((o) => o.value === sel)
    const src: RiskRow[] = sel === 'current' ? currentRows.value : ((risk.archives[Number(sel.slice(1))]?.rows ?? []) as RiskRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as RiskRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`风险跟进_${exportSel.value.length}集.xlsx`, sheets)
  exportOpen.value = false
}

defineExpose({ editOpen, editCtx, mode, historyIdx, isCurrent, scopeOpen, exportSel, allSelected, datasetOpts, toggleAllExport, allRows, scopedRows, hasScope })
</script>

<template>
  <div class="risk-followup-view">
    <h2 class="kp-title">风险跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="mode" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="mode === 'history'" v-model="historyIdx" size="small" style="width: 200px"
        :disabled="!risk.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in historyOpts" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">归档（留存跟进）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="exportOpen = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!rows.length" class="kp-empty">暂无风险数据。</div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="filtered" :show-count="false">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" />
          </span>
        </template>
        <template #cell-followAction="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as RiskRow, 'followAction')">{{ progCell(row as RiskRow, 'followAction') }}</span>
        </template>
        <template #cell-revConclusion="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as RiskRow, 'revConclusion')">{{ progCell(row as RiskRow, 'revConclusion') }}</span>
        </template>
        <template #cell-nextRevDate="{ row }">
          <el-date-picker v-if="isCurrent" :model-value="(row as RiskRow).nextRevDate || ''" type="date"
            value-format="YYYY-MM-DD" size="small" style="width: 150px" placeholder="选择日期"
            @update:model-value="(v: string | null) => onDateChange(row as RiskRow, v)" />
          <span v-else>{{ (row as RiskRow).nextRevDate || '-' }}</span>
        </template>
      </DataTable>
    </div>

    <ProgressEditModal v-model="editOpen" store="riskFollowup"
      :project-id="editCtx.riskKey" :project-name="editCtx.title" :head-text="editCtx.title"
      :field="editCtx.field" :initial="editCtx.initial" />

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="allRows" :initial="risk.scope"
      single-table :catalog="RISK_SCOPE_CATALOG" :match-fn="riskRowMatches"
      title="范围设置（风险跟进）" count-unit="风险" @save="(s) => risk.saveScope(s)" />

    <Modal v-model="archiveConfirm" title="归档（留存跟进）" width="460px">
      <div>将当前风险跟进快照归档为历史；已填写的跟进动作 / rev结论 / 下次rev时间<strong>保留不清空</strong>（下次「更新数据」后按风险编码重新挂到最新风险上）。确认归档？</div>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="archiveConfirm = false">取消</button>
        <button class="kp-archive-btn" :disabled="archiving" @click="doArchive">确认归档</button>
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
.risk-followup-view { padding: var(--sp-4); }
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
