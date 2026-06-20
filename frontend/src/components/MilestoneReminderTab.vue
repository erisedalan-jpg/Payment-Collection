<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MilestoneProject } from '@/lib/milestoneAnalytics'
import { buildReminderRows, reminderStat, type ReminderWin } from '@/lib/milestoneDetailRows'
import { usePagedRows } from '@/lib/usePagedRows'
import { exportRows } from '@/lib/exportXlsx'
import SegToggle from './SegToggle.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ projects: MilestoneProject[]; now: Date }>()
const router = useRouter()

const WIN_OPTS = [{ value: '7d', label: '未来7天' }, { value: '30d', label: '未来30天' }, { value: 'quarter', label: '本季度' }]
const win = ref<ReminderWin>('7d')
const fL4 = ref<string[]>([])
const fNode = ref<string[]>([])
const fPriority = ref<string[]>([])
const fManager = ref('')
const fKw = ref('')

const winRows = computed(() => buildReminderRows(props.projects, props.now, win.value))
const l4Opts = computed(() => [...new Set(winRows.value.map((r) => r.orgL4).filter(Boolean))])
const nodeOpts = computed(() => [...new Set(winRows.value.map((r) => r.node).filter(Boolean))])
const filtered = computed(() => winRows.value.filter((r) =>
  (fL4.value.length === 0 || fL4.value.includes(r.orgL4)) &&
  (fNode.value.length === 0 || fNode.value.includes(r.node)) &&
  (fPriority.value.length === 0 || fPriority.value.includes(r.priority)) &&
  (!fManager.value || r.manager.includes(fManager.value)) &&
  (!fKw.value || r.projectId.includes(fKw.value) || r.projectName.includes(fKw.value)),
))
const stat = computed(() => reminderStat(filtered.value, props.now))
const { paged, currentPage, pageSize } = usePagedRows(filtered)

const PR_OPTS = [{ value: 'high', label: '高' }, { value: 'mid', label: '中' }, { value: 'low', label: '低' }]
const PR_TONE: Record<string, string> = { high: 'danger', mid: 'warn', low: 'mut' }
const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 150 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'projectType', label: '项目类型', width: 100 },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'orgL3', label: 'L3部门', width: 110 },
  { key: 'orgL4', label: 'L4部门', width: 110 },
  { key: 'node', label: '到期节点', width: 110 },
  { key: 'planDate', label: '计划时间', width: 110, num: true },
  { key: 'payStage', label: '回款阶段', width: 150, wrap: true },
  { key: 'linked', label: '是否关联回款', width: 110 },
  { key: 'priorityLabel', label: '处置优先级', width: 100 },
]
function reset() { fL4.value = []; fNode.value = []; fPriority.value = []; fManager.value = ''; fKw.value = '' }
function onExport() {
  exportRows(`里程碑到期提醒_${win.value}.xlsx`, filtered.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 项目类型: r.projectType, 项目经理: r.manager,
    L3部门: r.orgL3, L4部门: r.orgL4, 到期节点: r.node, 计划时间: r.planDate, 回款阶段: r.payStage,
    是否关联回款: r.linked, 处置优先级: r.priorityLabel,
  })))
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
</script>

<template>
  <div class="mrt">
    <div class="mrt-head">
      <SegToggle v-model="win" :options="WIN_OPTS" />
    </div>
    <div class="mrt-stats">
      <div class="mrt-card"><div class="mrt-k">待提醒项目数</div><div class="mrt-v u-num">{{ stat.projectCount }}</div></div>
      <div class="mrt-card"><div class="mrt-k">到期节点总数</div><div class="mrt-v u-num">{{ stat.nodeCount }}</div></div>
      <div class="mrt-card"><div class="mrt-k">7天内到期</div><div class="mrt-v u-num">{{ stat.within7 }}</div></div>
      <div class="mrt-card"><div class="mrt-k">本周到期</div><div class="mrt-v u-num">{{ stat.withinWeek }}</div></div>
    </div>
    <div class="mrt-bar">
      <el-select v-model="fL4" size="small" multiple collapse-tags clearable placeholder="L4部门" style="width: 150px">
        <el-option v-for="d in l4Opts" :key="d" :value="d" :label="d" />
      </el-select>
      <el-select v-model="fNode" size="small" multiple collapse-tags clearable placeholder="到期节点" style="width: 150px">
        <el-option v-for="n in nodeOpts" :key="n" :value="n" :label="n" />
      </el-select>
      <el-select v-model="fPriority" size="small" multiple collapse-tags clearable placeholder="优先级" style="width: 130px">
        <el-option v-for="p in PR_OPTS" :key="p.value" :value="p.value" :label="p.label" />
      </el-select>
      <el-input v-model="fManager" size="small" placeholder="项目经理" style="width: 120px" />
      <el-input v-model="fKw" size="small" placeholder="编号/名称" style="width: 140px" />
      <button class="mrt-btn" @click="reset">重置</button>
      <button class="mrt-btn" data-test="reminder-export" @click="onExport">导出Excel</button>
    </div>
    <DataTable :columns="COLS" :rows="paged" clickable @row-click="onRow">
      <template #cell-projectId="{ value }"><span class="mrt-link">{{ value }}</span></template>
      <template #cell-planDate="{ row, value }"><span :class="row.urgency ? 'mrt-date-' + row.urgency : ''">{{ value }}</span></template>
      <template #cell-linked="{ value }"><StatusBadge :label="value" :tone="value === '是' ? 'ok' : 'mut'" /></template>
      <template #cell-priorityLabel="{ row, value }"><StatusBadge :label="value" :tone="PR_TONE[row.priority]" /></template>
    </DataTable>
    <div class="mrt-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.mrt-head { margin-bottom: var(--sp-3); }
.mrt-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-card); margin-bottom: var(--sp-3); }
.mrt-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.mrt-k { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.mrt-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.mrt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mrt-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.mrt-btn:hover { background: var(--bg); color: var(--accent); }
.mrt-link { color: var(--accent); cursor: pointer; }
.mrt-date-urgent { color: var(--danger); font-weight: 600; }
.mrt-date-warn { color: var(--warn-text); font-weight: 600; }
.mrt-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>
