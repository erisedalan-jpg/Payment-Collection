<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MilestoneProject } from '@/lib/milestoneAnalytics'
import { buildPlanRows, NODE_TYPES } from '@/lib/milestoneDetailRows'
import { usePagedRows } from '@/lib/usePagedRows'
import { exportRows } from '@/lib/exportXlsx'
import DataTable, { type DataColumn } from './DataTable.vue'

const props = defineProps<{ projects: MilestoneProject[] }>()
const router = useRouter()

const fKw = ref('')
const allRows = computed(() => buildPlanRows(props.projects))
const filtered = computed(() => allRows.value.filter((r) =>
  !fKw.value || r.projectId.includes(fKw.value) || r.projectName.includes(fKw.value),
))
const { paged, currentPage, pageSize } = usePagedRows(filtered)

const COLS = computed<DataColumn[]>(() => {
  const base: DataColumn[] = [
    { key: 'projectId', label: '项目编号', width: 150, fixed: 'left' },
    { key: 'projectName', label: '项目名称', width: 200, fixed: 'left' },
    { key: 'contract', label: '项目金额', width: 130, num: true, formatter: (v) => '¥' + Number(v || 0).toLocaleString('zh-CN') },
    { key: 'orgL3', label: 'L3部门', width: 120 },
    { key: 'orgL3_1', label: 'L3-1部门', width: 120 },
    { key: 'orgL4', label: 'L4部门', width: 120 },
    { key: 'manager', label: '项目经理', width: 90 },
    { key: 'projectType', label: '项目类型', width: 100 },
  ]
  const nodeCols: DataColumn[] = []
  for (const t of NODE_TYPES) {
    nodeCols.push({ key: `计划_${t}`, label: `计划·${t}`, width: 120, num: true, formatter: (v) => (v ? String(v) : '-') })
    nodeCols.push({ key: `实际_${t}`, label: `实际·${t}`, width: 120, num: true, formatter: (v) => (v ? String(v) : '-') })
  }
  return [...base, ...nodeCols]
})

function reset() { fKw.value = '' }
function onExport() { exportRows('在建项目里程碑计划.xlsx', filtered.value as unknown as Record<string, unknown>[]) }
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
</script>

<template>
  <div class="mpt">
    <div class="mpt-bar">
      <el-input v-model="fKw" size="small" placeholder="编号/名称" style="width: 160px" />
      <button class="mpt-btn" @click="reset">重置</button>
      <button class="mpt-btn" data-test="plan-export" @click="onExport">导出Excel</button>
    </div>
    <div class="mpt-scroll">
      <DataTable :columns="COLS" :rows="paged" :show-count="false" clickable sticky-header @row-click="onRow">
        <template #cell-projectId="{ value }"><span class="mpt-link">{{ value }}</span></template>
      </DataTable>
    </div>
    <div class="mpt-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[50, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.mpt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mpt-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.mpt-btn:hover { background: var(--bg); color: var(--accent); }
.mpt-scroll { overflow-x: auto; }
.mpt-link { color: var(--accent); cursor: pointer; }
.mpt-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>
