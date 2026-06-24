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
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import Modal from '@/components/Modal.vue'
import SegToggle from '@/components/SegToggle.vue'
import ProgressEditModal from '@/components/ProgressEditModal.vue'
import { exportSheets } from '@/lib/exportXlsx'

const TABLE_ID = 'key-projects'
const data = useDataStore()
const auth = useAuthStore()
const progress = useProjectProgressStore()
const cf = useCrossFilterStore()
const router = useRouter()

onMounted(() => {
  if (!data.data) data.load()
  if (!progress.loaded) progress.load()
})

// 数据集选择:当前数据 | 历史快照
const dataset = ref('current')
const datasetOpts = computed(() => [
  { value: 'current', label: '当前数据' },
  ...progress.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime })),
])
const isCurrent = computed(() => dataset.value === 'current')

const currentRows = computed<KeyProjectRow[]>(() =>
  buildKeyProjectRows(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
    progress.current,
  ),
)

const rows = computed<KeyProjectRow[]>(() => {
  if (isCurrent.value) return currentRows.value
  const i = Number(dataset.value.slice(1))
  return (progress.archives[i]?.rows ?? []) as KeyProjectRow[]
})
const filtered = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as KeyProjectRow[])

const ALL_COLUMNS: DataColumn[] = [
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
]
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
  if (!c) return isCurrent.value ? '点击填写' : '-'
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
  if (!isCurrent.value) return
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
    dataset.value = 'current'
  } finally {
    archiving.value = false
  }
}

// 导出(超管):多选数据集 → 多 sheet
const exportOpen = ref(false)
const exportSel = ref<string[]>(['current'])
function doExport() {
  const sheets = exportSel.value.map((sel) => {
    const opt = datasetOpts.value.find((o) => o.value === sel)
    const src: KeyProjectRow[] =
      sel === 'current'
        ? currentRows.value
        : ((progress.archives[Number(sel.slice(1))]?.rows ?? []) as KeyProjectRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as KeyProjectRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`重点项目进展_${exportSel.value.length}集.xlsx`, sheets)
  exportOpen.value = false
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
defineExpose({ editOpen, editCtx, dataset, isCurrent })
</script>

<template>
  <div class="key-projects-view">
    <h2 class="kp-title">重点项目进展</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="dataset" :options="datasetOpts" />
      <ColumnPicker
        :columns="pickerColumns"
        :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle"
        @move-up="prefs.moveUp"
        @move-down="prefs.moveDown"
        @reset="prefs.reset"
      />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">更新（归档+清空）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="exportOpen = true">导出</button>
      <el-button
        v-if="cf.hasFilters(TABLE_ID)"
        size="small"
        style="margin-left: auto"
        @click="cf.clearAll(TABLE_ID)"
      >清除所有筛选</el-button>
    </div>

    <div v-if="!rows.length" class="kp-empty">暂无重点项目（取数：TOP1000 大客户 且 合同&gt;100万元 或 级别 P1）。</div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="filtered" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" />
          </span>
        </template>
        <template #cell-weekProgress="{ row }">
          <span
            class="kp-prog-cell"
            :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as KeyProjectRow, 'weekProgress')"
          >{{ progCell(row as KeyProjectRow, 'weekProgress') }}</span>
        </template>
        <template #cell-nextPlan="{ row }">
          <span
            class="kp-prog-cell"
            :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as KeyProjectRow, 'nextPlan')"
          >{{ progCell(row as KeyProjectRow, 'nextPlan') }}</span>
        </template>
      </DataTable>
    </div>

    <ProgressEditModal
      v-model="editOpen"
      :project-id="editCtx.projectId"
      :project-name="editCtx.projectName"
      :field="editCtx.field"
      :initial="editCtx.initial"
    />

    <Modal v-model="archiveConfirm" title="更新（归档）" width="420px">
      <div>将把当前数据归档为历史快照，并清空两列进展（开始新一期）。确认更新？</div>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="archiveConfirm = false">取消</button>
        <button class="kp-archive-btn" :disabled="archiving" @click="doArchive">确认更新</button>
      </div>
    </Modal>

    <Modal v-model="exportOpen" title="导出数据集" width="420px">
      <el-checkbox-group v-model="exportSel">
        <el-checkbox v-for="o in datasetOpts" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
      </el-checkbox-group>
      <div style="margin-top: var(--gap-card)">
        <button
          class="kp-export-btn"
          :disabled="!exportSel.length"
          @click="doExport"
        >导出 xlsx（{{ exportSel.length }} 个数据集，按当前列筛选）</button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.key-projects-view { padding: var(--sp-4); }
.kp-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.kp-label { font-size: var(--fs-1); color: var(--sub); }
.kp-scroll { overflow-x: auto; }
.kp-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
.kp-empty { padding: var(--sp-5); color: var(--mut); text-align: center; }
.kp-prog-cell { display: inline-block; white-space: pre-wrap; }
.kp-prog-cell.editable { cursor: pointer; color: var(--accent); }
.kp-archive-btn, .kp-export-btn, .kp-cancel {
  font-size: var(--fs-1);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 2px 10px;
  cursor: pointer;
  background: var(--card2);
  color: var(--accent);
}
.kp-archive-btn:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
</style>
