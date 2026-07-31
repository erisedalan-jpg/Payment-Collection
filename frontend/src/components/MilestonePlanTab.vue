<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MilestoneProject } from '@/lib/milestoneAnalytics'
import { buildPlanRows, NODE_TYPES } from '@/lib/milestoneDetailRows'
import { usePagedRows } from '@/lib/usePagedRows'
import { exportRows } from '@/lib/exportXlsx'
import DataTable, { type DataColumn } from './DataTable.vue'
import AppButton from './AppButton.vue'
import AppPager from './AppPager.vue'
import { DETAIL_TABLE_MAX_H } from '@/lib/tableLayout'

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
      <AppButton variant="subtle" @click="reset">重置</AppButton>
      <AppButton variant="subtle" data-test="plan-export" @click="onExport">导出Excel</AppButton>
    </div>
    <div class="mpt-scroll">
      <DataTable :columns="COLS" :rows="paged" :show-count="false" clickable sticky-header :max-height-px="DETAIL_TABLE_MAX_H" @row-click="onRow">
        <template #cell-projectId="{ value }"><span class="mpt-link">{{ value }}</span></template>
      </DataTable>
    </div>
    <AppPager v-model:page="currentPage" v-model:size="pageSize" :total="filtered.length" :sizes="[50, 100]" />
  </div>
</template>

<style scoped>
.mpt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mpt-scroll { overflow-x: auto; }
.mpt-link { color: var(--accent); cursor: pointer; }
</style>
