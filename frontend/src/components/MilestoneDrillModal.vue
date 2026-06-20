<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import DataTable, { type DataColumn } from './DataTable.vue'
import type { MilestoneDrillRow } from '@/lib/milestoneAnalytics'

const props = defineProps<{ modelValue: boolean; title: string; rows: MilestoneDrillRow[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const router = useRouter()

const open = computed({ get: () => props.modelValue, set: (v: boolean) => emit('update:modelValue', v) })

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 140 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'manager', label: '经理', width: 80 },
  { key: 'orgL4', label: 'L4', width: 110 },
  { key: 'node', label: '节点', width: 100 },
  { key: 'planDate', label: '计划时间', width: 110, num: true },
  { key: 'status', label: '状态', width: 90 },
]

function onRow(row: Record<string, any>) {
  emit('update:modelValue', false)
  router.push('/project/' + row.projectId)
}
</script>

<template>
  <!-- uses el-dialog via el-dialog directly so DataTable is always in the VNode tree -->
  <div class="mdm-wrapper" :class="{ 'mdm-hidden': !open }">
    <div class="mdm-overlay" @click.self="open = false" />
    <div class="mdm-panel">
      <div class="mdm-header">
        <span class="mdm-title">{{ title }}</span>
        <button class="mdm-close" @click="open = false">x</button>
      </div>
      <div class="mdm-body">
        <DataTable :columns="COLS" :rows="rows" clickable @row-click="onRow">
          <template #cell-projectId="{ value }"><span class="mdm-link">{{ value }}</span></template>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mdm-hidden { display: none; }
.mdm-wrapper {
  position: fixed;
  inset: 0;
  z-index: var(--z-panel);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mdm-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}
.mdm-panel {
  position: relative;
  z-index: 1;
  background: var(--bg);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  width: 60%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.mdm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border);
}
.mdm-title {
  font-size: var(--fs-4);
  font-weight: 600;
  color: var(--txt);
}
.mdm-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--sub);
  font-size: var(--fs-3);
}
.mdm-body {
  padding: var(--sp-3) var(--sp-4);
  overflow-y: auto;
}
.mdm-link { color: var(--accent); cursor: pointer; }
</style>
