<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { useOpportunityFollowupStore } from '@/stores/opportunityFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { OPP_COLUMNS, FILTERABLE as OPP_FILTERABLE, type OppColumn } from '@/lib/opportunityColumns'
import { OPP_SCOPE_CATALOG, opportunityMatches } from '@/lib/opportunityScope'
import { buildOppFollowupRows, type OppFollowupRow } from '@/lib/opportunityFollowup'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { usePersistentSort } from '@/lib/usePersistentSort'
import { userScopedKey } from '@/lib/userScopedKey'
import { withSortable } from '@/lib/columnSort'
import { useFollowupPage } from '@/composables/useFollowupPage'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import SegToggle from '@/components/SegToggle.vue'
import RichTextCell from '@/components/RichTextCell.vue'
import ScopeBuilder from '@/components/ScopeBuilder.vue'
import FollowupModals from '@/components/FollowupModals.vue'
import { exportSheets } from '@/lib/exportXlsx'
import { htmlToPlainText } from '@/lib/richText'

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

// 全部商机行(注入派生+跟进) → 供 ScopeBuilder 命中计数;再按 scope 过滤为当前清单
const allRows = computed<OppFollowupRow[]>(() => buildOppFollowupRows(opps.rows, oppf.current, now))
const inScopeRows = computed<OppFollowupRow[]>(() => allRows.value.filter((r) => opportunityMatches(r, oppf.scope)))

const fp = useFollowupPage(oppf, inScopeRows, (r) => applyColumnFilters(r, cf.tableFilters(TABLE_ID)) as OppFollowupRow[])

function oppToDataColumn(c: OppColumn): DataColumn {
  const base: DataColumn = { key: c.key, label: c.label, width: c.width, wrap: c.wrap, sortable: c.sortable }
  if (c.type === 'number')
    return { ...base, num: true, formatter: (v) => (v === '' || v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) }
  if (c.type === 'date')
    return { ...base, formatter: (v) => (String(v || '').slice(0, 10) || '-') }
  return { ...base, formatter: (v) => (v === '' || v == null ? '-' : String(v)) }
}
const FOLLOWUP_COLUMNS: DataColumn[] = [
  { key: 'weekProgress', label: '本周工作进展', width: 480, wrap: true, formatter: (v, r) => (v ? `${r.weekProgressEditTime}：${htmlToPlainText(String(v))}` : '') },
  { key: 'nextPlan', label: '后续工作计划', width: 480, wrap: true, formatter: (v, r) => (v ? `${r.nextPlanEditTime}：${htmlToPlainText(String(v))}` : '') },
  { key: 'followDate', label: '跟进日期', width: 160, sortable: true },
  { key: 'followBy', label: '跟进人', width: 120 },
]
const ALL_COLUMNS: DataColumn[] = withSortable([...OPP_COLUMNS.map(oppToDataColumn), ...FOLLOWUP_COLUMNS])
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ['name', 'customer', 'top1000', 'amountWan', 'opportunityLevel', 'status', 'frOwner',
  'weekProgress', 'nextPlan', 'followDate', 'followBy']
const FILTERABLE = new Set<string>([...OPP_FILTERABLE, 'followBy', 'followDate'])
const prefs = useColumnPrefs(userScopedKey(TABLE_ID), ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}
const psort = usePersistentSort(userScopedKey(TABLE_ID))

function editPrefix(row: OppFollowupRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  return t ? `${t}：` : ''
}

const scopeOpen = ref(false)

const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await oppf.archive(inScopeRows.value as any); archiveConfirm.value = false; fp.mode.value = 'current' }
  finally { archiving.value = false }
}

function exportRow(r: OppFollowupRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of visibleColumns.value) {
    const v = (r as any)[col.key]
    out[col.label] = col.formatter ? col.formatter(v, r) : (v ?? '')
  }
  return out
}
function doExport() {
  const sheets = fp.exportSel.value.map((sel) => {
    const opt = fp.datasetOpts.value.find((o) => o.value === sel)
    const src: OppFollowupRow[] = sel === 'current' ? inScopeRows.value
      : ((oppf.archives[Number(sel.slice(1))]?.rows ?? []) as OppFollowupRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as OppFollowupRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`重点商机跟进_${fp.exportSel.value.length}集.xlsx`, sheets)
  fp.exportOpen.value = false
}

defineExpose({
  mode: fp.mode, historyIdx: fp.historyIdx, isCurrent: fp.isCurrent,
  scopeOpen,
  exportSel: fp.exportSel, allSelected: fp.allSelected, datasetOpts: fp.datasetOpts, toggleAllExport: fp.toggleAllExport,
  inScopeRows, allRows,
})
</script>

<template>
  <div class="opp-followup-view">
    <h2 class="kp-title">重点商机跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="fp.mode.value" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="fp.mode.value === 'history'" v-model="fp.historyIdx.value" size="small" style="width: 200px"
        :disabled="!oppf.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in fp.historyOpts.value" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <button v-if="auth.isSuper && fp.mode.value === 'history' && oppf.archives.length" class="kp-archive-btn"
        @click="fp.delConfirm.value = true">删除此历史</button>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">更新（归档+清空）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="fp.exportOpen.value = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!fp.rows.value.length" class="kp-empty">
      {{ auth.isSuper ? '请点击「范围设置」定义重点商机跟进范围（默认：TOP1000 且 提前介入 且 重点商机 且 状态非赢单）。' : '暂无重点商机跟进。' }}
    </div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="fp.paged.value" :show-count="false" sticky-header :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="fp.rows.value" />
          </span>
        </template>
        <template #cell-weekProgress="{ row }">
          <RichTextCell
            :content="(row as OppFollowupRow).weekProgress ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as OppFollowupRow, 'weekProgress')"
            :save-handler="(html: string) => oppf.update((row as OppFollowupRow).id, 'weekProgress', html)"
          />
        </template>
        <template #cell-nextPlan="{ row }">
          <RichTextCell
            :content="(row as OppFollowupRow).nextPlan ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as OppFollowupRow, 'nextPlan')"
            :save-handler="(html: string) => oppf.update((row as OppFollowupRow).id, 'nextPlan', html)"
          />
        </template>
      </DataTable>
    </div>

    <div v-if="fp.filtered.value.length" class="kp-pager">
      <span class="u-num">共 {{ fp.filtered.value.length }} 条</span>
      <el-pagination v-model:current-page="fp.currentPage.value" v-model:page-size="fp.pageSize.value"
        :page-sizes="[20, 50, 80, 100]" :total="fp.filtered.value.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="allRows" :initial="oppf.scope"
      :catalog="OPP_SCOPE_CATALOG" :single-table="true" :match-fn="opportunityMatches"
      title="范围设置（重点商机跟进）" count-unit="商机" @save="(s) => oppf.saveScope(s)" />

    <FollowupModals
      v-model:del-confirm="fp.delConfirm.value"
      v-model:export-open="fp.exportOpen.value"
      v-model:archive-open="archiveConfirm"
      v-model:export-sel="fp.exportSel.value"
      :history-label="fp.historyOpts.value[fp.historyIdx.value]?.label ?? ''"
      :deleting="fp.deleting.value"
      :archiving="archiving"
      :retain="false"
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
        <div>将把当前数据归档为历史快照，并清空两列进展（开始新一期）。确认更新？</div>
      </template>
    </FollowupModals>
  </div>
</template>

<style scoped>
@import '@/styles/followup.css';
.opp-followup-view { padding: var(--sp-4); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
</style>
