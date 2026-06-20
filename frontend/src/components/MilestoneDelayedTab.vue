<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MilestoneProject } from '@/lib/milestoneAnalytics'
import { statusKpis } from '@/lib/milestoneAnalytics'
import { buildDelayedRows } from '@/lib/milestoneDetailRows'
import { usePagedRows } from '@/lib/usePagedRows'
import { exportRows } from '@/lib/exportXlsx'
import DataTable, { type DataColumn } from './DataTable.vue'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ projects: MilestoneProject[]; now: Date }>()
const router = useRouter()

const STATUS_OPTS = ['延期', '严重延期', '未发布']
const fStatus = ref<string[]>([...STATUS_OPTS])
const fL4 = ref<string[]>([])
const fManager = ref('')
const fKw = ref('')

const allRows = computed(() => buildDelayedRows(props.projects, props.now))
const l4Opts = computed(() => [...new Set(allRows.value.map((r) => r.orgL4).filter(Boolean))])
const summary = computed(() => statusKpis(props.projects))
const filtered = computed(() => allRows.value.filter((r) =>
  (fStatus.value.length === 0 || fStatus.value.includes(r.status)) &&
  (fL4.value.length === 0 || fL4.value.includes(r.orgL4)) &&
  (!fManager.value || r.manager.includes(fManager.value)) &&
  (!fKw.value || r.projectId.includes(fKw.value) || r.projectName.includes(fKw.value)),
))
const { paged, currentPage, pageSize } = usePagedRows(filtered)

const TONE: Record<string, string> = { 正常: 'ok', 延期: 'warn', 严重延期: 'danger', 未发布: 'mut' }
const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 150 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'projectType', label: '项目类型', width: 100 },
  { key: 'orgL3', label: 'L3部门', width: 120 },
  { key: 'orgL4', label: 'L4部门', width: 120 },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'status', label: '里程碑状态', width: 110 },
  { key: 'delayedNodes', label: '延期节点', width: 180, wrap: true },
]
function reset() { fStatus.value = [...STATUS_OPTS]; fL4.value = []; fManager.value = ''; fKw.value = '' }
function onExport() {
  exportRows('延期项目清单.xlsx', filtered.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 项目类型: r.projectType, L3部门: r.orgL3,
    L4部门: r.orgL4, 项目经理: r.manager, 里程碑状态: r.status, 延期节点: r.delayedNodes,
  })))
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
</script>

<template>
  <div class="mdt">
    <div class="mdt-summary">
      <StatusBadge label="正常" tone="ok" /> {{ summary.normal }}
      <StatusBadge label="延期" tone="warn" /> {{ summary.delayed }}
      <StatusBadge label="严重延期" tone="danger" /> {{ summary.severe }}
      <StatusBadge label="未发布" tone="mut" /> {{ summary.unpublished }}
    </div>
    <div class="mdt-bar">
      <el-select v-model="fStatus" size="small" multiple collapse-tags clearable placeholder="里程碑状态" style="width: 170px">
        <el-option v-for="s in STATUS_OPTS" :key="s" :value="s" :label="s" />
      </el-select>
      <el-select v-model="fL4" size="small" multiple collapse-tags clearable placeholder="L4部门" style="width: 160px">
        <el-option v-for="d in l4Opts" :key="d" :value="d" :label="d" />
      </el-select>
      <el-input v-model="fManager" size="small" placeholder="项目经理" style="width: 120px" />
      <el-input v-model="fKw" size="small" placeholder="编号/名称" style="width: 140px" />
      <button class="mdt-btn" @click="reset">重置</button>
      <button class="mdt-btn" data-test="delayed-export" @click="onExport">导出Excel</button>
    </div>
    <DataTable :columns="COLS" :rows="paged" clickable @row-click="onRow">
      <template #cell-projectId="{ value }"><span class="mdt-link">{{ value }}</span></template>
      <template #cell-status="{ value }"><StatusBadge :label="value" :tone="TONE[value]" /></template>
    </DataTable>
    <div class="mdt-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.mdt-summary { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); font-size: var(--fs-1); color: var(--sub); }
.mdt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mdt-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.mdt-btn:hover { background: var(--bg); color: var(--accent); }
.mdt-link { color: var(--accent); cursor: pointer; }
.mdt-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>
