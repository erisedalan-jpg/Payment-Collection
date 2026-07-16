<script setup lang="ts">
import { useRouter } from 'vue-router'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import { fmtWan } from '@/lib/format'
import type { MilestoneStatusRow } from '@/lib/milestoneAnalytics'

const props = defineProps<{ modelValue: boolean; title: string; rows: MilestoneStatusRow[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const router = useRouter()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 140 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'manager', label: '经理', width: 80 },
  { key: 'orgL4', label: 'L4', width: 110 },
  { key: 'contract', label: '合同(万)', width: 110, num: true, formatter: (v) => fmtWan(v as number) },
  { key: 'status', label: '状态', width: 90 },
]

function onRow(row: Record<string, any>) {
  emit('update:modelValue', false)
  router.push('/project/' + row.projectId)
}
</script>

<template>
  <Modal :model-value="props.modelValue" :title="props.title" width="60%"
    @update:model-value="emit('update:modelValue', $event)">
    <DataTable :columns="COLS" :rows="props.rows" :show-count="false" clickable @row-click="onRow">
      <template #cell-projectId="{ value }"><span class="msm-link">{{ value }}</span></template>
    </DataTable>
  </Modal>
</template>

<style scoped>
.msm-link { color: var(--accent); cursor: pointer; }
</style>
