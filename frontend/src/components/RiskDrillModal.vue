<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { RiskRow } from '@/lib/riskBoard'
import { fmtWan } from '@/lib/format'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'

const props = defineProps<{ modelValue: boolean; title: string; rows: RiskRow[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const router = useRouter()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 190 },
  { key: 'projectName', label: '项目名称' },
  { key: 'orgL4', label: 'L4组织', width: 110 },
  { key: 'riskLevel', label: '风险等级', width: 90 },
  { key: 'openRisks', label: '未关闭数', width: 90, num: true },
  { key: 'contractAmount', label: '合同总额(万)', width: 110, num: true, formatter: (v) => fmtWan(v as number) },
]

function onRow(row: Record<string, any>) {
  emit('update:modelValue', false)
  router.push(`/project/${row.projectId}`)
}
</script>

<template>
  <Modal :model-value="props.modelValue" :title="`${props.title}（${props.rows.length} 个项目）`"
    @update:model-value="emit('update:modelValue', $event)">
    <DataTable :columns="COLS" :rows="props.rows" :show-count="false" clickable @row-click="onRow" />
  </Modal>
</template>
