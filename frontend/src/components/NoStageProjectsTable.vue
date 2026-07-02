<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { noStageProjects } from '@/lib/payDashboard'
import { exportRows } from '@/lib/exportXlsx'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { usePagedRows } from '@/lib/usePagedRows'

const router = useRouter()
const data = useDataStore()
const filter = useFilterStore()

const rows = computed(() => noStageProjects(data.data?.projects ?? [], data.data?.paymentNodes, {
  viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
  excludeActive: filter.excludeOn, excludedIds: filter.excludedIds,
}))

const { paged, currentPage, pageSize } = usePagedRows(rows, 20)

// contractWan 已是万元(noStageProjects 内已 /10000)，此处只格式化千分位，不再用 fmtWan 二次除万（同 KeyProjectsView.vue contractWan 列约定）
const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 160, sortable: true },
  { key: 'projectName', label: '项目名称', wrap: true, sortable: true },
  { key: 'projectManager', label: '项目经理', width: 100, sortable: true },
  { key: 'orgL4', label: 'L4组', width: 120, sortable: true },
  { key: 'contractWan', label: '合同额(万)', width: 120, num: true, sortable: true,
    formatter: (v) => (v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
]
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
function onExport() {
  exportRows('无回款阶段数据项目.xlsx', rows.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 项目经理: r.projectManager, L4组: r.orgL4, 合同额万: r.contractWan,
  })))
}
</script>

<template>
  <div class="nsp">
    <div class="nsp-h">
      <span>无回款阶段数据项目（{{ rows.length }}）</span>
      <button class="nsp-btn" data-test="nostage-export" @click="onExport">导出Excel</button>
    </div>
    <div v-if="!rows.length" class="nsp-empty">无——全部在建项目均有收款阶段。</div>
    <template v-else>
      <DataTable :columns="COLS" :rows="paged" :show-count="false" clickable @row-click="onRow" />
      <div class="nsp-pager">
        <span class="u-num">共 {{ rows.length }} 条</span>
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="rows.length" layout="sizes, prev, pager, next" size="small" background />
      </div>
    </template>
  </div>
</template>

<style scoped>
.nsp-h { display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-3); }
.nsp-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.nsp-btn:hover { background: var(--bg); color: var(--accent); }
.nsp-empty { color: var(--mut); padding: var(--sp-4) 0; }
.nsp-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>
