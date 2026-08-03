<script setup lang="ts">
import { computed } from 'vue'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import { DRILL_ROW_LIMIT } from '@/lib/tableLayout'
import { useDialogTableHeight } from '@/composables/useDialogTableHeight'

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
const tableMaxH = useDialogTableHeight(() => props.modelValue)
const rows = computed(() => props.nodes.slice(0, DRILL_ROW_LIMIT))
const truncated = computed(() => props.nodes.length - rows.value.length)
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="title"
    width="80%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <DataTable :columns="COLS" :rows="rows" sticky-header :max-height-px="tableMaxH" />
    <div v-if="truncated > 0" class="dd-trunc">
      共 {{ props.nodes.length }} 条，此处只显示前 {{ DRILL_ROW_LIMIT }} 条（另有 {{ truncated }} 条未列出）；请在页面上收窄筛选后再下钻。
    </div>
  </Modal>
</template>

<style scoped>
.dd-trunc { margin-top: 10px; font-size: var(--fs-1); color: var(--warn-text); }
</style>
