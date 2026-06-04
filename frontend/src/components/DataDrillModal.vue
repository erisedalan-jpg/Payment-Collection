<script setup lang="ts">
import { computed } from 'vue'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  nodes: Record<string, any>[]
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'tier', label: '金额区间' },
  { key: 'orgL4', label: '服务组' },
  { key: 'projectManager', label: '项目经理' },
]
const rows = computed(() => props.nodes.slice(0, 200))
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="title"
    width="80%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <DataTable :columns="COLS" :rows="rows" />
  </Modal>
</template>
