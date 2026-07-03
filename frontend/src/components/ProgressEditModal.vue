<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import Modal from './Modal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useOpportunityFollowupStore } from '@/stores/opportunityFollowup'
import { useRiskFollowupStore } from '@/stores/riskFollowup'
import { usePaymentKeyFollowupStore } from '@/stores/paymentKeyFollowup'

const props = defineProps<{
  modelValue: boolean; projectId: string; projectName: string
  field: 'weekProgress' | 'nextPlan' | 'followAction' | 'revConclusion'; initial: string
  store?: 'key' | 'temp' | 'oppFollowup' | 'riskFollowup' | 'paymentKey'
  headText?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const keyStore = useProjectProgressStore()
const tempStore = useTempFollowupStore()
const oppStore = useOpportunityFollowupStore()
const riskStore = useRiskFollowupStore()
const payKeyStore = usePaymentKeyFollowupStore()
const activeStore = computed(() =>
  props.store === 'temp' ? tempStore
    : props.store === 'oppFollowup' ? oppStore
      : props.store === 'riskFollowup' ? riskStore
        : props.store === 'paymentKey' ? payKeyStore
          : keyStore)
const text = ref(props.initial)
const saving = ref(false)
watch(() => props.modelValue, (v) => { if (v) text.value = props.initial })

const FIELD_LABEL = { weekProgress: '本周工作进展', nextPlan: '后续工作计划',
  followAction: '跟进动作', revConclusion: 'rev结论' } as const

async function save() {
  saving.value = true
  try {
    // 各 store 的 update field 联合类型不同,此处用通用键透传(后端亦校验 field 合法性)
    await (activeStore.value as { update: (id: string, field: string, content: string) => Promise<unknown> })
      .update(props.projectId, props.field, text.value)
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error('保存失败: ' + (e as Error).message)
  } finally {
    saving.value = false
  }
}
defineExpose({ save, text, saving })
</script>

<template>
  <Modal :model-value="modelValue" :title="'编辑 ' + FIELD_LABEL[field]" width="480px"
    @update:model-value="emit('update:modelValue', $event)">
    <div class="pem-head">{{ headText || (projectName + ' / 编号 ' + projectId) }}</div>
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
  padding: 4px var(--sp-3); cursor: pointer; background: var(--card2); color: var(--txt); }
.pem-save { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.pem-save:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
</style>
