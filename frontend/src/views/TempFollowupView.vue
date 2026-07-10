<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'
import { sumDistinctContractWan } from '@/lib/followupTotals'
import { fmt } from '@/lib/format'
import { htmlToPlainText } from '@/lib/richText'

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

const projects = computed(() => (data.data?.projects ?? []) as Project[])
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)
const scopeInputs = computed(() =>
  buildScopeInputs(projects.value, pmisMap.value,
    (data.data as any)?.paymentNodes ?? {}, (data.data as any)?.projectMilestones ?? {}))
const inScopeIds = computed(() => new Set(
  scopeInputs.value.filter((i) => projectMatches(i, temp.scope)).map((i) => i.id)))

const currentRows = computed<TempRow[]>(() =>
  buildTempRows(projects.value, pmisMap.value, temp.current, inScopeIds.value))

const fp = useFollowupPage(temp, currentRows, (r) => applyColumnFilters(r, cf.tableFilters(TABLE_ID)) as TempRow[])
const contractTotal = computed(() => sumDistinctContractWan(fp.filtered.value as unknown as Array<Record<string, unknown>>, 'contractWan'))

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
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
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
const prefs = useColumnPrefs(userScopedKey(TABLE_ID), ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

function editPrefix(row: TempRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  return t ? `${t}：` : ''
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }

// 范围设置(超管)
const scopeOpen = ref(false)

// 更新归档(超管)
const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await temp.archive(currentRows.value as any); archiveConfirm.value = false; fp.mode.value = 'current' }
  finally { archiving.value = false }
}

// 导出(超管):多数据集多 sheet,按当前显示列
function exportRow(r: TempRow): Record<string, unknown> {
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
    const src: TempRow[] = sel === 'current' ? currentRows.value
      : ((temp.archives[Number(sel.slice(1))]?.rows ?? []) as TempRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as TempRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`临时重点跟进_${fp.exportSel.value.length}集.xlsx`, sheets)
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
  <div class="temp-followup-view">
    <h2 class="kp-title">临时重点跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="fp.mode.value" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="fp.mode.value === 'history'" v-model="fp.historyIdx.value" size="small" style="width: 200px"
        :disabled="!temp.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in fp.historyOpts.value" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <button v-if="auth.isSuper && fp.mode.value === 'history' && temp.archives.length" class="kp-archive-btn"
        @click="fp.delConfirm.value = true">删除此历史</button>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">更新（归档+清空）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="fp.exportOpen.value = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!fp.rows.value.length" class="kp-empty">
      {{ auth.isSuper ? '请点击「范围设置」定义临时跟进范围。' : '暂无临时重点跟进项目。' }}
    </div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="fp.paged.value" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="fp.rows.value" />
          </span>
        </template>
        <template #cell-weekProgress="{ row }">
          <RichTextCell
            :content="(row as TempRow).weekProgress ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as TempRow, 'weekProgress')"
            :save-handler="(html: string) => temp.update((row as TempRow).projectId, 'weekProgress', html)"
          />
        </template>
        <template #cell-nextPlan="{ row }">
          <RichTextCell
            :content="(row as TempRow).nextPlan ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as TempRow, 'nextPlan')"
            :save-handler="(html: string) => temp.update((row as TempRow).projectId, 'nextPlan', html)"
          />
        </template>
      </DataTable>
    </div>

    <div v-if="fp.filtered.value.length" class="kp-pager">
      <span class="u-num">合同金额合计 {{ fmt(contractTotal, 1) }} 万 · 共 {{ fp.filtered.value.length }} 条</span>
      <el-pagination v-model:current-page="fp.currentPage.value" v-model:page-size="fp.pageSize.value"
        :page-sizes="[20, 50, 80, 100]" :total="fp.filtered.value.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="scopeInputs" :initial="temp.scope"
      @save="(s) => temp.saveScope(s)" />

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
.temp-followup-view { padding: var(--sp-4); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
</style>
