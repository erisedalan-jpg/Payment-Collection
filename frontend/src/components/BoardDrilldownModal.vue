<script setup lang="ts">
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import { formatCellValue } from '@/lib/cellFormat'
import { useProjectDetailStore } from '@/stores/projectDetail'
import type { ProjectAgg } from '@/lib/dashboardStats'

const props = defineProps<{
  modelValue: boolean
  title: string
  projects: ProjectAgg[]
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const pd = useProjectDetailStore()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'tier', label: '金额档位' },
  { key: 'orgL4', label: '服务组(L4)' },
  { key: 'projectManager', label: '项目经理' },
  { key: 'projectAmount', label: '项目金额' },
  { key: 'paymentStatus', label: '回款状态' },
  { key: 'paymentRatio', label: '完成率' },
].map((c) => ({ ...c, formatter: (v: unknown) => formatCellValue(v, c.key) }))

function onRowClick(row: Record<string, any>) {
  pd.open(row.projectId)
}
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    :title="`${props.title} - 项目下钻（${props.projects.length}）`"
    width="90%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <DataTable :columns="COLS" :rows="props.projects.slice(0, 200)" clickable @row-click="onRowClick" />
    <div class="bd-hint">点击任意项目行查看详情</div>
  </Modal>
</template>

<style scoped>
.bd-hint { margin-top: 10px; font-size: var(--fs-1); color: var(--mut); }
</style>
