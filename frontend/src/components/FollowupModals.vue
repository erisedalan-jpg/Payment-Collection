<script setup lang="ts">
import Modal from '@/components/Modal.vue'

defineProps<{
  historyLabel: string
  deleting: boolean
  archiving: boolean
  retain: boolean
  datasetOpts: { value: string; label: string }[]
  allSelected: boolean
  exportIndeterminate: boolean
  exportCount: number
}>()

const delConfirm = defineModel<boolean>('delConfirm', { default: false })
const exportOpen = defineModel<boolean>('exportOpen', { default: false })
const archiveOpen = defineModel<boolean>('archiveOpen', { default: false })
const exportSel = defineModel<string[]>('exportSel', { default: () => [] })

const emit = defineEmits<{
  confirmDelete: []
  confirmArchive: []
  doExport: []
  toggleAll: [val: boolean]
}>()
</script>

<template>
  <div class="followup-modals">
    <Modal v-model="delConfirm" title="删除历史快照" width="420px">
      <div>将永久删除该条历史快照（{{ historyLabel }}），不可恢复。确认删除？</div>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="delConfirm = false">取消</button>
        <button class="kp-archive-btn" :disabled="deleting" @click="emit('confirmDelete')">确认删除</button>
      </div>
    </Modal>

    <Modal
      v-model="archiveOpen"
      :title="retain ? '归档（留存跟进）' : '更新（归档）'"
      :width="retain ? '460px' : '420px'"
    >
      <slot name="archive-body">
        <div>归档当前数据为历史快照。确认归档？</div>
      </slot>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="archiveOpen = false">取消</button>
        <button class="kp-archive-btn" :disabled="archiving" @click="emit('confirmArchive')">{{ retain ? '确认归档' : '确认更新' }}</button>
      </div>
    </Modal>

    <Modal v-model="exportOpen" title="导出数据集" width="420px">
      <el-checkbox :model-value="allSelected" :indeterminate="exportIndeterminate"
        @change="emit('toggleAll', $event as boolean)">全选</el-checkbox>
      <el-checkbox-group v-model="exportSel">
        <el-checkbox v-for="o in datasetOpts" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
      </el-checkbox-group>
      <div style="margin-top: var(--gap-card)">
        <button
          class="kp-export-btn"
          :disabled="!exportSel.length"
          @click="emit('doExport')"
        >导出 xlsx（{{ exportCount }} 个数据集，按当前列筛选）</button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
@import '@/styles/followup.css';
</style>
