<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useScopedProjects } from '@/composables/useScopedData'
import { useAuthStore } from '@/stores/auth'
import { usePaymentKeyFollowupStore } from '@/stores/paymentKeyFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildPaymentKeyRows, type PaymentKeyRow } from '@/lib/paymentKeyFollowup'
import { buildScopeInputs } from '@/lib/tempFollowup'
import { projectMatches } from '@/lib/tempScope'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefsDynamic } from '@/lib/useColumnPrefs'
import { usePersistentSort } from '@/lib/usePersistentSort'
import { userScopedKey } from '@/lib/userScopedKey'
import { withSortable } from '@/lib/columnSort'
import { useFollowupPage } from '@/composables/useFollowupPage'
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import { useCustomColumns } from '@/composables/useCustomColumns'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import SegToggle from '@/components/SegToggle.vue'
import RichTextCell from '@/components/RichTextCell.vue'
import ScopeBuilder from '@/components/ScopeBuilder.vue'
import FollowupModals from '@/components/FollowupModals.vue'
import FollowupCustomCell from '@/components/FollowupCustomCell.vue'
import FollowupColumnConfig from '@/components/FollowupColumnConfig.vue'
import { exportSheets } from '@/lib/exportXlsx'
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'
import { sumDistinctContractWan } from '@/lib/followupTotals'
import { fmt } from '@/lib/format'
import { htmlToPlainText } from '@/lib/richText'

defineOptions({ name: 'PaymentKeyFollowupView' })
useViewScrollMemory()

const TABLE_ID = 'payment-key'
const data = useDataStore()
const scoped = useScopedProjects()
const auth = useAuthStore()
const pk = usePaymentKeyFollowupStore()
const cf = useCrossFilterStore()
const router = useRouter()
const fcStore = useFollowupColumnsStore()
// pk.current 是 Pinia setup-store 的字段(访问时已自动解包,并非 Ref 本体);
// useCustomColumns 需要真正的 Ref(内部读 .value),故用 computed 包一层而非直接传店内字段。
const custom = useCustomColumns('payment_key', { current: computed(() => pk.current) as any, rowKey: (r) => r.projectId })
const colCfgOpen = ref(false)

// 进页清空本表残留列筛选（keep-alive 下：菜单进入=新挂载会重置，下钻返回=缓存激活不重置）
cf.clearAll(TABLE_ID)

onMounted(() => {
  if (!data.data) data.load()
  if (!pk.loaded) pk.load()
  if (!fcStore.loaded) fcStore.load()
})

const projects = computed(() => (scoped.value?.projects ?? []) as Project[])
const pmisMap = computed(() => (scoped.value?.projectPmis ?? {}) as Record<string, ProjectPmis>)
const scopeInputs = computed(() =>
  buildScopeInputs(projects.value, pmisMap.value,
    (scoped.value as any)?.paymentNodes ?? {}, (scoped.value as any)?.projectMilestones ?? {}))
const inScopeIds = computed(() => new Set(
  scopeInputs.value.filter((i) => projectMatches(i, pk.scope)).map((i) => i.id)))

const currentRows = computed<PaymentKeyRow[]>(() =>
  custom.decorate(buildPaymentKeyRows(projects.value, pmisMap.value, pk.current, inScopeIds.value)) as PaymentKeyRow[])

const fp = useFollowupPage(pk, currentRows, (r) => applyColumnFilters(r, cf.tableFilters(TABLE_ID)) as PaymentKeyRow[])
const contractTotal = computed(() => sumDistinctContractWan(fp.filtered.value as unknown as Array<Record<string, unknown>>, 'contractWan'))

const BASE_COLUMNS: DataColumn[] = withSortable([
  { key: 'projectId', label: '项目编号', width: 160 },
  { key: 'projectName', label: '项目名称', width: 200 },
  { key: 'projectManager', label: '项目经理', width: 96 },
  { key: 'orgL4', label: 'L4组织', width: 110 },
  { key: 'projectLevel', label: '项目级别', width: 90 },
  { key: 'contractWan', label: '合同金额(万)', width: 110, num: true,
    formatter: (v) => (v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  // —— 额外可选列(默认隐藏) ——
  { key: 'paymentRatio', label: '回款完成率', width: 105, num: true,
    formatter: (v) => (v == null ? '-' : (Number(v) * 100).toFixed(1) + '%') },
  { key: 'paymentStatus', label: '回款状态', width: 100 },
  { key: 'riskLevel', label: '风险', width: 96, formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'stage', label: '阶段', width: 100 },
  { key: 'projectType', label: '项目类型', width: 110 },
  { key: 'projectStatus', label: '项目状态', width: 100 },
  { key: 'health', label: '健康度', width: 96 },
  { key: 'top1000', label: 'TOP1000', width: 90 },
  { key: 'quadrant', label: '象限', width: 140 },
  // —— 跟进列 ——
  { key: 'followAction', label: '跟进动作', width: 480, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
  { key: 'revConclusion', label: 'rev结论', width: 480, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
  { key: 'nextRevDate', label: '下次rev时间', width: 170 },
])
const ALL_COLUMNS = computed<DataColumn[]>(() => [...BASE_COLUMNS, ...custom.columns.value])
// 静态列恒在(不像 /risk 那样门控于 data.data),为避免 useColumnPrefsDynamic 在自定义列到位前
// 就地 init 并锁定(把自定义列漏在持久化外),门控改为「自定义列配置已加载」。
const allKeys = computed(() => (custom.loaded.value ? ALL_COLUMNS.value.map((c) => c.key) : []))
const DEFAULT_VISIBLE = ['projectId', 'projectName', 'projectManager', 'orgL4', 'projectLevel', 'contractWan',
  'followAction', 'revConclusion', 'nextRevDate']
const FILTERABLE = computed(() => new Set(['projectManager', 'orgL4', 'projectLevel', 'paymentStatus', 'riskLevel', 'stage',
  'projectType', 'projectStatus', 'health', 'top1000', 'quadrant', ...custom.filterableKeys.value]))
const prefs = useColumnPrefsDynamic(userScopedKey(TABLE_ID), allKeys,
  () => [...DEFAULT_VISIBLE, ...custom.defaultKeys()])
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.value.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = computed(() => ALL_COLUMNS.value.map((c) => ({ key: c.key, label: c.label })))
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}
const psort = usePersistentSort(userScopedKey(TABLE_ID))

function editPrefix(row: PaymentKeyRow, field: 'followAction' | 'revConclusion'): string {
  const t = field === 'followAction' ? row.followActionEditTime : row.revConclusionEditTime
  return t ? `${t}：` : ''
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }

// 下次rev时间(内联日期编辑)
async function onDateChange(row: PaymentKeyRow, val: string | null) {
  if (!fp.isCurrent.value) return
  await pk.update(row.projectId, 'nextRevDate', val ?? '')
}

// 范围设置(超管)
const scopeOpen = ref(false)

// 归档(超管):仅归档不清空(跟进数据留存)
const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await pk.archive(currentRows.value as any); archiveConfirm.value = false; fp.mode.value = 'current' }
  finally { archiving.value = false }
}

// 导出(超管):多数据集多 sheet,按当前显示列
function exportRow(r: PaymentKeyRow): Record<string, unknown> {
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
    const src: PaymentKeyRow[] = sel === 'current' ? currentRows.value
      : ((pk.archives[Number(sel.slice(1))]?.rows ?? []) as PaymentKeyRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as PaymentKeyRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`回款重点跟进_${fp.exportSel.value.length}集.xlsx`, sheets)
  fp.exportOpen.value = false
}

defineExpose({
  mode: fp.mode, historyIdx: fp.historyIdx, isCurrent: fp.isCurrent,
  scopeOpen,
  exportSel: fp.exportSel, allSelected: fp.allSelected, datasetOpts: fp.datasetOpts, toggleAllExport: fp.toggleAllExport,
  inScopeIds, scopeInputs,
})
</script>

<template>
  <div class="payment-key-followup-view">
    <h2 class="kp-title">回款重点跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="fp.mode.value" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="fp.mode.value === 'history'" v-model="fp.historyIdx.value" size="small" style="width: 200px"
        :disabled="!pk.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in fp.historyOpts.value" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <button v-if="auth.isSuper && fp.mode.value === 'history' && pk.archives.length" class="kp-archive-btn"
        @click="fp.delConfirm.value = true">删除此历史</button>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">归档（留存跟进）</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="colCfgOpen = true">列设置</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="fp.exportOpen.value = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!fp.rows.value.length" class="kp-empty">
      {{ auth.isSuper ? '请点击「范围设置」定义回款重点跟进范围。' : '暂无回款重点跟进项目。' }}
    </div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="fp.paged.value" :show-count="false" clickable sticky-header :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange" @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="fp.rows.value" />
          </span>
        </template>
        <template #cell-followAction="{ row }">
          <RichTextCell
            :content="(row as PaymentKeyRow).followAction ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as PaymentKeyRow, 'followAction')"
            :save-handler="(html: string) => pk.update((row as PaymentKeyRow).projectId, 'followAction', html)"
          />
        </template>
        <template #cell-revConclusion="{ row }">
          <RichTextCell
            :content="(row as PaymentKeyRow).revConclusion ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as PaymentKeyRow, 'revConclusion')"
            :save-handler="(html: string) => pk.update((row as PaymentKeyRow).projectId, 'revConclusion', html)"
          />
        </template>
        <template #cell-nextRevDate="{ row }">
          <el-date-picker v-if="fp.isCurrent.value" :model-value="(row as PaymentKeyRow).nextRevDate || ''" type="date"
            value-format="YYYY-MM-DD" size="small" style="width: 150px" placeholder="选择日期"
            @click.stop
            @update:model-value="(v: string | null) => onDateChange(row as PaymentKeyRow, v)" />
          <span v-else>{{ (row as PaymentKeyRow).nextRevDate || '-' }}</span>
        </template>
        <template v-for="col in custom.defs.value" :key="col.key" #[`cell-${col.key}`]="{ row }">
          <FollowupCustomCell :col="col" :row="row" :editable="fp.isCurrent.value"
            :save="(v: string) => pk.update((row as PaymentKeyRow).projectId, col.key, v)" />
        </template>
      </DataTable>
    </div>

    <div v-if="fp.filtered.value.length" class="kp-pager">
      <span class="u-num">合同金额合计 {{ fmt(contractTotal, 1) }} 万 · 共 {{ fp.filtered.value.length }} 条</span>
      <el-pagination v-model:current-page="fp.currentPage.value" v-model:page-size="fp.pageSize.value"
        :page-sizes="[20, 50, 80, 100]" :total="fp.filtered.value.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="scopeInputs" :initial="pk.scope"
      title="范围设置（回款重点跟进）" @save="(s) => pk.saveScope(s)" />
    <FollowupColumnConfig v-if="auth.isSuper" v-model="colCfgOpen" table="payment_key" />

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
        <div>将当前回款重点跟进快照归档为历史；已填写的跟进动作 / rev结论 / 下次rev时间<strong>保留不清空</strong>（下次「更新数据」后按项目编号重新挂到最新数据上）。确认归档？</div>
      </template>
    </FollowupModals>
  </div>
</template>

<style scoped>
@import '@/styles/followup.css';
.payment-key-followup-view { padding: var(--sp-4); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
</style>
