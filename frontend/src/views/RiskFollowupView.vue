<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useRiskFollowupStore } from '@/stores/riskFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildRiskRows, riskRowMatches, RISK_SCOPE_CATALOG, type RiskRow } from '@/lib/riskRows'
import { RISK_COLUMNS, fmtDateCell } from '@/lib/projectPage'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefsDynamic } from '@/lib/useColumnPrefs'
import { userScopedKey } from '@/lib/userScopedKey'
import { useFollowupPage } from '@/composables/useFollowupPage'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import SegToggle from '@/components/SegToggle.vue'
import RichTextCell from '@/components/RichTextCell.vue'
import ScopeBuilder from '@/components/ScopeBuilder.vue'
import FollowupModals from '@/components/FollowupModals.vue'
import { exportSheets } from '@/lib/exportXlsx'
import { useDeferredMount } from '@/lib/useDeferredMount'
import { sumDistinctContractWan } from '@/lib/followupTotals'
import { fmt } from '@/lib/format'
import { htmlToPlainText } from '@/lib/richText'

const TABLE_ID = 'risk-followup'
const data = useDataStore()
const auth = useAuthStore()
const risk = useRiskFollowupStore()
const cf = useCrossFilterStore()
// 延迟渲染:点击进页先出标题/工具栏,下一两帧再挂全量风险大表(数百行×数十列),消除跨页点击冻结。
const { ready } = useDeferredMount()

onMounted(() => {
  if (!data.data) data.load()
  if (!risk.loaded) risk.load()
})

const projects = computed(() => (data.data?.projects ?? []) as Project[])
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)
const allRows = computed<RiskRow[]>(() => buildRiskRows(projects.value, pmisMap.value, risk.current))
const hasScope = computed(() => risk.scope.groups.some((g) => g.conditions.length))
const scopedRows = computed<RiskRow[]>(() => hasScope.value ? allRows.value.filter((r) => riskRowMatches(r, risk.scope)) : allRows.value)
const currentRows = computed<RiskRow[]>(() => scopedRows.value)

const fp = useFollowupPage(risk, currentRows, (r) => applyColumnFilters(r, cf.tableFilters(TABLE_ID)) as RiskRow[])
const contractTotal = computed(() => sumDistinctContractWan(fp.filtered.value as Array<Record<string, unknown>>, '项目金额'))

// —— 列模型:风险列(动态) + 项目列(固定) + 跟进列 ——
const PROJECT_COLS: DataColumn[] = [
  { key: '项目编号', label: '项目编号', width: 175, sortable: true },
  { key: '项目名称', label: '项目名称', width: 220, sortable: true },
  { key: '客户', label: '客户', width: 180, sortable: true },
  { key: '项目金额', label: '项目金额(万)', width: 110, sortable: true, num: true,
    formatter: (v) => (v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: '项目级别', label: '项目级别', width: 80, sortable: true },
  { key: '项目经理', label: '项目经理', width: 96, sortable: true },
  { key: 'L4组织', label: 'L4组织', width: 110, sortable: true },
  { key: '项目类型', label: '项目类型', width: 110, sortable: true },
  { key: '项目状态', label: '项目状态', width: 100, sortable: true },
]
const FOLLOW_COLS: DataColumn[] = [
  { key: 'followAction', label: '跟进动作', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
  { key: 'revConclusion', label: 'rev结论', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
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
const FILTERABLE = new Set(['风险等级', '风险状态', '风险大类', '风险小类', '项目级别', '项目经理', 'L4组织', '项目类型', '项目状态', '客户', 'nextRevDate'])
const prefs = useColumnPrefsDynamic(userScopedKey(TABLE_ID), allKeys, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.value.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = computed(() => ALL_COLUMNS.value.map((c) => ({ key: c.key, label: c.label })))
function onToggle(key: string) { if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key); prefs.toggle(key) }

// —— 文本编辑(跟进动作/rev结论) ——
function editPrefix(row: RiskRow, field: 'followAction' | 'revConclusion'): string {
  const t = field === 'followAction' ? row.followActionEditTime : row.revConclusionEditTime
  return t ? `${t}：` : ''
}

// —— 日期编辑(下次rev时间) ——
async function onDateChange(row: RiskRow, val: string | null) {
  if (!fp.isCurrent.value) return
  await risk.update(row.riskKey, 'nextRevDate', val ?? '')
}

// —— 范围/归档/导出(超管) ——
const scopeOpen = ref(false)
const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await risk.archive(currentRows.value as unknown as Record<string, unknown>[]); archiveConfirm.value = false; fp.mode.value = 'current' }
  finally { archiving.value = false }
}
function exportRow(r: RiskRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of visibleColumns.value) {
    const v = (r as Record<string, any>)[col.key]
    out[col.label] = col.formatter ? col.formatter(v, r) : (v ?? '')
  }
  return out
}
function doExport() {
  const sheets = fp.exportSel.value.map((sel) => {
    const opt = fp.datasetOpts.value.find((o) => o.value === sel)
    const src: RiskRow[] = sel === 'current' ? currentRows.value : ((risk.archives[Number(sel.slice(1))]?.rows ?? []) as RiskRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as RiskRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`风险跟进_${fp.exportSel.value.length}集.xlsx`, sheets)
  fp.exportOpen.value = false
}

defineExpose({
  mode: fp.mode, historyIdx: fp.historyIdx, isCurrent: fp.isCurrent,
  scopeOpen,
  exportSel: fp.exportSel, allSelected: fp.allSelected, datasetOpts: fp.datasetOpts, toggleAllExport: fp.toggleAllExport,
  allRows, scopedRows, hasScope, allKeys, prefs, FILTERABLE,
  filtered: fp.filtered, paged: fp.paged, currentPage: fp.currentPage, pageSize: fp.pageSize,
})
</script>

<template>
  <div class="risk-followup-view">
    <h2 class="kp-title">风险跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="fp.mode.value" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="fp.mode.value === 'history'" v-model="fp.historyIdx.value" size="small" style="width: 200px"
        :disabled="!risk.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in fp.historyOpts.value" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <button v-if="auth.isSuper && fp.mode.value === 'history' && risk.archives.length" class="kp-archive-btn"
        @click="fp.delConfirm.value = true">删除此历史</button>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">归档（留存跟进）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="fp.exportOpen.value = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!fp.rows.value.length" class="kp-empty">暂无风险数据。</div>
    <div v-else-if="!ready" class="kp-defer"><el-skeleton :rows="10" animated /></div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="fp.paged.value" :show-count="false">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="fp.rows.value" />
          </span>
        </template>
        <template #cell-followAction="{ row }">
          <RichTextCell
            :content="((row as RiskRow) as Record<string, any>).followAction ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as RiskRow, 'followAction')"
            :save-handler="(html: string) => risk.update((row as RiskRow).riskKey, 'followAction', html)"
          />
        </template>
        <template #cell-revConclusion="{ row }">
          <RichTextCell
            :content="((row as RiskRow) as Record<string, any>).revConclusion ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as RiskRow, 'revConclusion')"
            :save-handler="(html: string) => risk.update((row as RiskRow).riskKey, 'revConclusion', html)"
          />
        </template>
        <template #cell-nextRevDate="{ row }">
          <el-date-picker v-if="fp.isCurrent.value" :model-value="(row as RiskRow).nextRevDate || ''" type="date"
            value-format="YYYY-MM-DD" size="small" style="width: 150px" placeholder="选择日期"
            @click.stop
            @update:model-value="(v: string | null) => onDateChange(row as RiskRow, v)" />
          <span v-else>{{ (row as RiskRow).nextRevDate || '-' }}</span>
        </template>
      </DataTable>
    </div>
    <div v-if="ready && fp.filtered.value.length" class="kp-pager">
      <span class="u-num">合同金额合计 {{ fmt(contractTotal, 1) }} 万 · 共 {{ fp.filtered.value.length }} 条</span>
      <el-pagination v-model:current-page="fp.currentPage.value" v-model:page-size="fp.pageSize.value"
        :page-sizes="[20, 50, 80, 100]" :total="fp.filtered.value.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="allRows" :initial="risk.scope"
      single-table :catalog="RISK_SCOPE_CATALOG" :match-fn="riskRowMatches"
      title="范围设置（风险跟进）" count-unit="风险" @save="(s) => risk.saveScope(s)" />

    <FollowupModals
      v-model:del-confirm="fp.delConfirm.value"
      v-model:export-open="fp.exportOpen.value"
      v-model:archive-open="archiveConfirm"
      v-model:export-sel="fp.exportSel.value"
      :history-label="fp.historyOpts.value[fp.historyIdx.value]?.label ?? ''"
      :deleting="fp.deleting.value"
      :archiving="archiving"
      :retain="true"
      :dataset-opts="fp.datasetOpts.value"
      :all-selected="fp.allSelected.value"
      :export-indeterminate="fp.exportIndeterminate.value"
      :export-count="fp.exportSel.value.length"
      @confirm-delete="fp.doDeleteArchive"
      @confirm-archive="doArchive"
      @do-export="doExport"
      @toggle-all="fp.toggleAllExport"
    >
      <template #archive-body>
        <div>将当前风险跟进快照归档为历史；已填写的跟进动作 / rev结论 / 下次rev时间<strong>保留不清空</strong>（下次「更新数据」后按风险编码重新挂到最新风险上）。确认归档？</div>
      </template>
    </FollowupModals>
  </div>
</template>

<style scoped>
@import '@/styles/followup.css';
.risk-followup-view { padding: var(--sp-4); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.kp-defer { padding: var(--sp-4); min-height: 360px; }
</style>
