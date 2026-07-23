<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useScopedProjects } from '@/composables/useScopedData'
import { useAuthStore } from '@/stores/auth'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildTempRows, buildScopeInputs, type TempRow } from '@/lib/tempFollowup'
import { projectMatches } from '@/lib/tempScope'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefsDynamic } from '@/lib/useColumnPrefs'
import { usePersistentSort } from '@/lib/usePersistentSort'
import { userScopedKey } from '@/lib/userScopedKey'
import { withSortable } from '@/lib/columnSort'
import { useFollowupPage } from '@/composables/useFollowupPage'
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
import { sumDistinctContractWan } from '@/lib/followupTotals'
import { fmt } from '@/lib/format'
import { htmlToPlainText } from '@/lib/richText'

defineOptions({ name: 'TempInstancePanel' })   // 测试用 findComponent({name}) 找它,必须有

const data = useDataStore()
const scoped = useScopedProjects()
const auth = useAuthStore()
const temp = useTempFollowupStore()
const cf = useCrossFilterStore()
const router = useRouter()
// temp.current 是 Pinia setup-store 的字段(访问时已自动解包,并非 Ref 本体);
// useCustomColumns 需要真正的 Ref(内部读 .value),故用 computed 包一层而非直接传店内字段。
// 自定义列配置的加载(fcStore.load())由父组件 TempFollowupView.vue 在 onMounted 里预载完成
// (面板由 ready 门控,挂载时配置必已就绪),面板自身无需再持有/触发一次 store 加载。
const custom = useCustomColumns('temp', { current: computed(() => temp.current) as any, rowKey: (r) => r.projectId })
const colCfgOpen = ref(false)

const TABLE_BASE = 'temp-followup'
// 每个实例一套持久化。子组件由父组件 :key="activeId" 驱动重建,
// 所以这里取一次即可 —— composable 不响应 viewKey 变化,靠重建换 key。
const TABLE_ID = `${TABLE_BASE}:${temp.activeId}`

// 进页清空本表残留列筛选（keep-alive 下：菜单进入=新挂载会重置，下钻返回=缓存激活不重置）
cf.clearAll(TABLE_ID)

const projects = computed(() => (scoped.value?.projects ?? []) as Project[])
const pmisMap = computed(() => (scoped.value?.projectPmis ?? {}) as Record<string, ProjectPmis>)
const scopeInputs = computed(() =>
  buildScopeInputs(projects.value, pmisMap.value,
    (scoped.value as any)?.paymentNodes ?? {}, (scoped.value as any)?.projectMilestones ?? {}))
const inScopeIds = computed(() => new Set(
  scopeInputs.value.filter((i) => projectMatches(i, temp.scope)).map((i) => i.id)))

const currentRows = computed<TempRow[]>(() =>
  custom.decorate(buildTempRows(projects.value, pmisMap.value, temp.current, inScopeIds.value)) as TempRow[])

const fp = useFollowupPage(temp, currentRows, (r) => applyColumnFilters(r, cf.tableFilters(TABLE_ID)) as TempRow[])
const contractTotal = computed(() => sumDistinctContractWan(fp.filtered.value as unknown as Array<Record<string, unknown>>, 'contractWan'))

const BASE_COLUMNS: DataColumn[] = withSortable([
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
  { key: 'weekProgress', label: '本周工作进展', width: 480, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
  { key: 'nextPlan', label: '后续工作计划', width: 480, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
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
  { key: 'setupDate', label: '立项日期', width: 110,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
  { key: 'plannedFinalAcceptDate', label: '计划终验时间', width: 120,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
  { key: 'actualFinalAcceptDate', label: '实际终验时间', width: 120,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
])
// 自定义列直接接在静态列之后展开(不再套 withSortable):useCustomColumns 已按类型自定 sortable
// (date=true、text=undefined,与 weekProgress/nextPlan 等长文本列同构不可排序);若整体重新
// withSortable,会把 NON_SORTABLE_KEYS 未收录的自定义文本列 key(cf-xxxxxxxx)误判为可排序。
const ALL_COLUMNS = computed<DataColumn[]>(() => [...BASE_COLUMNS, ...custom.columns.value])
// 门控于 custom.loaded(而非 data 到位与否)——静态列恒在,若不门控,useColumnPrefsDynamic 会在
// 自定义列到位前用「静态列的完整集合」就地 init 并锁定,把自定义列永久排除在持久化候选之外。
const ALL_KEYS = computed(() => (custom.loaded.value ? ALL_COLUMNS.value.map((c) => c.key) : []))
// 默认可见 = key 页那 14 列(额外列默认隐藏)
const DEFAULT_VISIBLE = ['projectId', 'customer', 'projectName', 'projectLevel', 'projectManager', 'ar', 'sr',
  'orgL4', 'contractWan', 'riskLevel', 'weekProgress', 'nextPlan', 'followDate', 'followBy']
const FILTERABLE = computed(() => new Set([
  'projectLevel', 'projectManager', 'ar', 'sr', 'orgL4', 'riskLevel', 'followBy', 'followDate',
  'stage', 'projectType', 'projectStatus', 'health', 'paymentStatus', 'top1000', 'quadrant', 'milestoneStatus',
  'setupDate', 'plannedFinalAcceptDate', 'actualFinalAcceptDate',
  ...custom.filterableKeys.value,
]))
const prefs = useColumnPrefsDynamic(userScopedKey(TABLE_ID), ALL_KEYS,
  () => [...DEFAULT_VISIBLE, ...custom.defaultKeys()])
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.value.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = computed(() => ALL_COLUMNS.value.map((c) => ({ key: c.key, label: c.label })))
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}
const sort = usePersistentSort(userScopedKey(TABLE_ID))

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

defineExpose({ ALL_COLUMNS, FILTERABLE, prefs, sort })
</script>

<template>
  <div class="temp-instance-panel">
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
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="colCfgOpen = true">列设置</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="fp.exportOpen.value = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!fp.rows.value.length" class="kp-empty">
      {{ auth.isSuper ? '请点击「范围设置」定义临时跟进范围。' : '暂无临时重点跟进项目。' }}
    </div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="fp.paged.value" :show-count="false" clickable sticky-header :default-sort="sort.defaultSort.value" @sort-change="sort.onSortChange" @row-click="onRow">
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
        <template v-for="col in custom.defs.value" :key="col.key" #[`cell-${col.key}`]="{ row }">
          <FollowupCustomCell :col="col" :row="row" :editable="fp.isCurrent.value"
            :save="(v: string) => temp.update((row as TempRow).projectId, col.key, v)" />
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
    <FollowupColumnConfig v-if="auth.isSuper" v-model="colCfgOpen" table="temp" />

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
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
</style>
