<script setup lang="ts">
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import { PM_PROJ_COLS, PM_DELAY_COLS, type PmColDef } from '@/lib/pmView'
import { formatCellValue } from '@/lib/cellFormat'

const props = defineProps<{
  modelValue: boolean
  pmName: string
  projects: Record<string, any>[]
  delayedNodes: Record<string, any>[]
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const toCols = (defs: PmColDef[]): DataColumn[] =>
  defs.map((c) => ({
    key: c.key,
    label: c.label,
    formatter: (v: unknown) => formatCellValue(v, c.key),
  }))
const projCols = toCols(PM_PROJ_COLS)
const delayCols = toCols(PM_DELAY_COLS)
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="`${pmName} - 项目经理详情`"
    width="90%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <section class="pm-section">
      <div class="pm-sec-title primary">{{ pmName }} - 负责项目信息</div>
      <DataTable :columns="projCols" :rows="props.projects.slice(0, 100)" />
    </section>
    <section class="pm-section">
      <div class="pm-sec-title red">{{ pmName }} - 延期节点信息</div>
      <DataTable :columns="delayCols" :rows="props.delayedNodes.slice(0, 100)" />
    </section>
  </Modal>
</template>

<style scoped>
.pm-section { margin-bottom: 18px; }
.pm-sec-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.pm-sec-title.primary { color: #4f46e5; }
.pm-sec-title.red { color: #ef4444; }
</style>
