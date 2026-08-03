<script setup lang="ts">
import { computed } from 'vue'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import { formatCellValue } from '@/lib/cellFormat'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { DRILL_ROW_LIMIT } from '@/lib/tableLayout'
import { useDialogTableHeight } from '@/composables/useDialogTableHeight'

const props = defineProps<{
  modelValue: boolean
  title: string
  projects: Record<string, any>[]
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const pd = useProjectDetailStore()
const tableMaxH = useDialogTableHeight(() => props.modelValue)
const rows = computed(() => props.projects.slice(0, DRILL_ROW_LIMIT))
const truncated = computed(() => props.projects.length - rows.value.length)

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
    <DataTable :columns="COLS" :rows="rows" sticky-header :max-height-px="tableMaxH" clickable @row-click="onRowClick" />
    <div class="bd-hint">点击任意项目行查看详情</div>
    <div v-if="truncated > 0" class="bd-hint bd-trunc">
      共 {{ props.projects.length }} 条，此处只显示前 {{ DRILL_ROW_LIMIT }} 条（另有 {{ truncated }} 条未列出）；请在页面上收窄筛选后再下钻。
    </div>
  </Modal>
</template>

<style scoped>
.bd-hint { margin-top: 10px; font-size: var(--fs-1); color: var(--mut); }
.bd-trunc { color: var(--warn-text); }
</style>
