<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { InsightRow } from '@/lib/projectPivot'
import { fmtWan, fmtRatio } from '@/lib/format'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'

const props = defineProps<{ modelValue: boolean; title: string; rows: InsightRow[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const router = useRouter()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 190 },
  { key: 'projectName', label: '项目名称' },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'stage', label: '阶段', width: 90 },
  { key: 'health', label: '健康度', width: 80 },
  { key: 'contractAmount', label: '合同总额(万)', width: 110, formatter: (v) => fmtWan(v as number) },
  { key: 'paymentRatio', label: '回款完成率', width: 100, formatter: (_v, r) => fmtRatio(r.expectedTotal > 0 ? r.actualTotal / r.expectedTotal : null) },
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
