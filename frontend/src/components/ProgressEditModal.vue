<script setup lang="ts">
import { ref, watch } from 'vue'
import Modal from './Modal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'

const props = defineProps<{
  modelValue: boolean; projectId: string; projectName: string
  field: 'weekProgress' | 'nextPlan'; initial: string
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const store = useProjectProgressStore()
const text = ref(props.initial)
const saving = ref(false)
watch(() => props.modelValue, (v) => { if (v) text.value = props.initial })

const FIELD_LABEL = { weekProgress: '本周工作进展', nextPlan: '后续工作计划' } as const

async function save() {
  saving.value = true
  try {
    await store.update(props.projectId, props.field, text.value)
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal :model-value="modelValue" :title="'编辑 ' + FIELD_LABEL[field]" width="480px"
    @update:model-value="emit('update:modelValue', $event)">
    <div class="pem-head">{{ projectName }} / 编号 {{ projectId }}</div>
    <el-input v-model="text" type="textarea" :rows="6" placeholder="输入内容..." />
    <div class="pem-actions">
      <button class="pem-cancel" @click="emit('update:modelValue', false)">取消</button>
      <button class="pem-save" :disabled="saving" @click="save">保存</button>
    </div>
  </Modal>
</template>

<style scoped>
.pem-head { font-size: var(--fs-1); color: var(--sub); margin-bottom: var(--sp-2); }
.pem-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-3); }
.pem-cancel, .pem-save { font-size: var(--fs-1); border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 4px 14px; cursor: pointer; background: var(--card2); color: var(--txt); }
.pem-save { background: var(--accent); color: #fff; border-color: var(--accent); }
.pem-save:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
</style>
