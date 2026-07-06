<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useProjectProgressStore } from '@/stores/projectProgress'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildKeyProjectRows, type KeyProjectRow } from '@/lib/keyProjects'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { withSortable } from '@/lib/columnSort'
import { useFollowupPage } from '@/composables/useFollowupPage'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import SegToggle from '@/components/SegToggle.vue'
import ProgressEditModal from '@/components/ProgressEditModal.vue'
import FollowupModals from '@/components/FollowupModals.vue'
import { exportSheets } from '@/lib/exportXlsx'
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'
import { sumDistinctContractWan } from '@/lib/followupTotals'
import { fmt } from '@/lib/format'

defineOptions({ name: 'KeyProjectsView' })
useViewScrollMemory()

const TABLE_ID = 'key-projects'
const data = useDataStore()
const auth = useAuthStore()
const progress = useProjectProgressStore()
const cf = useCrossFilterStore()
const router = useRouter()

// 进页清空本表残留列筛选（keep-alive 下：菜单进入=新挂载会重置，下钻返回=缓存激活不重置）
cf.clearAll(TABLE_ID)

onMounted(() => {
  if (!data.data) data.load()
  if (!progress.loaded) progress.load()
})

const currentRows = computed<KeyProjectRow[]>(() =>
  buildKeyProjectRows(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
    progress.current,
  ),
)

const fp = useFollowupPage(progress, currentRows, (r) => applyColumnFilters(r, cf.tableFilters(TABLE_ID)) as KeyProjectRow[])
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
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true },
  { key: 'followDate', label: '跟进日期', width: 160, sortable: true },
  { key: 'followBy', label: '跟进人', width: 120 },
])
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ALL_KEYS
const FILTERABLE = new Set(['projectLevel', 'projectManager', 'ar', 'sr', 'orgL4', 'riskLevel', 'followBy', 'followDate'])
const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c),
)
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

function progCell(row: KeyProjectRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  const c = row[field]
  if (!c) return fp.isCurrent.value ? '点击填写' : '-'
  return `${t}：${c}`
}

function onRow(row: Record<string, any>) {
  router.push('/project/' + row.projectId)
}

// 编辑
const editOpen = ref(false)
const editCtx = reactive({
  projectId: '',
  projectName: '',
  field: 'weekProgress' as 'weekProgress' | 'nextPlan',
  initial: '',
})
function openEdit(row: KeyProjectRow, field: 'weekProgress' | 'nextPlan') {
  if (!fp.isCurrent.value) return
  editCtx.projectId = row.projectId
  editCtx.projectName = row.projectName
  editCtx.field = field
  editCtx.initial = row[field] ?? ''
  editOpen.value = true
}

// 更新归档(超管)
const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try {
    await progress.archive(currentRows.value)
    archiveConfirm.value = false
    fp.mode.value = 'current'
  } finally {
    archiving.value = false
  }
}

// 导出(超管):多选数据集 → 多 sheet
function doExport() {
  const sheets = fp.exportSel.value.map((sel) => {
    const opt = fp.datasetOpts.value.find((o) => o.value === sel)
    const src: KeyProjectRow[] =
      sel === 'current'
        ? currentRows.value
        : ((progress.archives[Number(sel.slice(1))]?.rows ?? []) as KeyProjectRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as KeyProjectRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`重点项目进展_${fp.exportSel.value.length}集.xlsx`, sheets)
  fp.exportOpen.value = false
}
function exportRow(r: KeyProjectRow): Record<string, unknown> {
  return {
    项目编号: r.projectId,
    客户: r.customer,
    项目名称: r.projectName,
    项目级别: r.projectLevel,
    项目经理: r.projectManager,
    AR: r.ar,
    SR: r.sr,
    L4组织: r.orgL4,
    '合同金额(万)': r.contractWan,
    风险: r.openRisks ? `${r.riskLevel}(${r.openRisks})` : r.riskLevel,
    本周工作进展: r.weekProgress ? `${r.weekProgressEditTime}：${r.weekProgress}` : '',
    后续工作计划: r.nextPlan ? `${r.nextPlanEditTime}：${r.nextPlan}` : '',
    跟进日期: r.followDate,
    跟进人: r.followBy,
  }
}

// 暴露供测试
defineExpose({
  editOpen, editCtx,
  mode: fp.mode, historyIdx: fp.historyIdx, isCurrent: fp.isCurrent,
  exportSel: fp.exportSel, allSelected: fp.allSelected, datasetOpts: fp.datasetOpts, toggleAllExport: fp.toggleAllExport,
})
</script>

<template>
  <div class="key-projects-view">
    <h2 class="kp-title">重点项目进展</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="fp.mode.value" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="fp.mode.value === 'history'" v-model="fp.historyIdx.value" size="small" style="width: 200px"
        :disabled="!progress.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in fp.historyOpts.value" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <button v-if="auth.isSuper && fp.mode.value === 'history' && progress.archives.length" class="kp-archive-btn"
        @click="fp.delConfirm.value = true">删除此历史</button>
      <ColumnPicker
        :columns="pickerColumns"
        :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle"
        @move-up="prefs.moveUp"
        @move-down="prefs.moveDown"
        @reset="prefs.reset"
      />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">更新（归档+清空）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="fp.exportOpen.value = true">导出</button>
      <el-button
        v-if="cf.hasFilters(TABLE_ID)"
        size="small"
        style="margin-left: auto"
        @click="cf.clearAll(TABLE_ID)"
      >清除所有筛选</el-button>
    </div>

    <div v-if="!fp.rows.value.length" class="kp-empty">暂无重点项目（取数：级别 P1 或 TOP1000 大客户且合同&gt;100万元）。</div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="fp.paged.value" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="fp.rows.value" />
          </span>
        </template>
        <template #cell-weekProgress="{ row }">
          <span
            class="kp-prog-cell"
            :class="{ editable: fp.isCurrent.value }"
            @click.stop="openEdit(row as KeyProjectRow, 'weekProgress')"
          >{{ progCell(row as KeyProjectRow, 'weekProgress') }}</span>
        </template>
        <template #cell-nextPlan="{ row }">
          <span
            class="kp-prog-cell"
            :class="{ editable: fp.isCurrent.value }"
            @click.stop="openEdit(row as KeyProjectRow, 'nextPlan')"
          >{{ progCell(row as KeyProjectRow, 'nextPlan') }}</span>
        </template>
      </DataTable>
    </div>

    <div v-if="fp.filtered.value.length" class="kp-pager">
      <span class="u-num">合同金额合计 {{ fmt(contractTotal, 1) }} 万 · 共 {{ fp.filtered.value.length }} 条</span>
      <el-pagination v-model:current-page="fp.currentPage.value" v-model:page-size="fp.pageSize.value"
        :page-sizes="[20, 50, 80, 100]" :total="fp.filtered.value.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>

    <ProgressEditModal
      v-model="editOpen"
      :project-id="editCtx.projectId"
      :project-name="editCtx.projectName"
      :field="editCtx.field"
      :initial="editCtx.initial"
    />

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
.key-projects-view { padding: var(--sp-4); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
</style>
