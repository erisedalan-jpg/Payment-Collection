<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { usePaymentFilterStore } from '@/stores/paymentFilter'
import { useExcludeStore } from '@/stores/exclude'
import { noStageProjects } from '@/lib/payDashboard'
import { exportRows } from '@/lib/exportXlsx'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import AppEmpty from '@/components/AppEmpty.vue'
import AppButton from '@/components/AppButton.vue'
import AppPager from '@/components/AppPager.vue'
import { usePagedRows } from '@/lib/usePagedRows'

const router = useRouter()
const data = useDataStore()
const filter = usePaymentFilterStore()
const exclude = useExcludeStore()

const rows = computed(() => noStageProjects(data.data?.projects ?? [], data.data?.paymentNodes, {
  viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
  excludeActive: exclude.excludeOn, excludedIds: exclude.excludedIds,
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
      <AppButton variant="subtle" data-test="nostage-export" @click="onExport">导出Excel</AppButton>
    </div>
    <AppEmpty v-if="!rows.length" variant="plain">无——全部在建项目均有收款阶段。</AppEmpty>
    <template v-else>
      <DataTable :columns="COLS" :rows="paged" :show-count="false" clickable @row-click="onRow" />
      <AppPager v-model:page="currentPage" v-model:size="pageSize" :total="rows.length" :sizes="[20, 50, 100]" />
    </template>
  </div>
</template>

<style scoped>
.nsp-h { display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-3); }
</style>
