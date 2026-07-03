<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FollowupRecord, FollowupFormData } from '@/lib/followupApi'

const props = defineProps<{
  projectId: string
  projectName: string
  types: string[]
  statuses: string[]
  editRecord?: FollowupRecord | null
  defaultNextDate?: string
}>()
const emit = defineEmits<{ submit: [FollowupFormData]; cancel: [] }>()

const form = ref({ 跟进类型: '', 跟进人: '', 跟进内容: '', 跟进状态: '', 下次跟进计划日期: '' })
const error = ref('')

function reset() {
  const r = props.editRecord
  form.value = {
    跟进类型: r?.['跟进类型'] || props.types[0] || '',
    跟进人: r?.['跟进人'] || '',
    跟进内容: r?.['跟进内容'] || '',
    跟进状态: r?.['跟进状态'] || props.statuses[0] || '',
    下次跟进计划日期: r?.['下次跟进计划日期'] || props.defaultNextDate || '',
  }
  error.value = ''
}
watch(() => [props.editRecord, props.types, props.statuses], reset, { immediate: true })

const isEdit = computed(() => !!props.editRecord?.['记录编号'])
const recordIdLabel = computed(() => props.editRecord?.['记录编号'] || '保存后自动生成')

function submit() {
  const person = form.value.跟进人.trim()
  const content = form.value.跟进内容.trim()
  if (!person) {
    error.value = '请填写跟进人姓名'
    return
  }
  if (!content) {
    error.value = '请填写跟进内容'
    return
  }
  if (content.length > 500) {
    error.value = '跟进内容不能超过500字'
    return
  }
  const data: FollowupFormData = {
    项目编号: props.projectId,
    项目名称: props.projectName,
    跟进人: person,
    跟进类型: form.value.跟进类型,
    跟进内容: content,
    跟进状态: form.value.跟进状态,
    下次跟进计划日期: form.value.下次跟进计划日期,
  }
  if (isEdit.value) data.记录编号 = props.editRecord!['记录编号']
  emit('submit', data)
}
</script>

<template>
  <div class="frf">
    <div class="frf-title">{{ isEdit ? `编辑跟进记录 (${recordIdLabel})` : '添加跟进记录' }}</div>
    <div class="frf-row"><label>记录编号</label><input :value="recordIdLabel" readonly /><span class="frf-id-hint">{{ recordIdLabel }}</span></div>
    <div class="frf-row"><label>项目编号</label><input :value="projectId" readonly /></div>
    <div class="frf-row"><label>项目名称</label><input :value="projectName" readonly /></div>
    <div class="frf-row">
      <label>跟进类型</label>
      <select v-model="form.跟进类型" data-f="type">
        <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>
    <div class="frf-row"><label>跟进人</label><input v-model="form.跟进人" data-f="person" maxlength="20" placeholder="请输入姓名" /></div>
    <div class="frf-row"><label>跟进内容</label><textarea v-model="form.跟进内容" rows="3" maxlength="500" placeholder="请输入跟进内容（最多500字）"></textarea></div>
    <div class="frf-row">
      <label>跟进状态</label>
      <select v-model="form.跟进状态" data-f="status">
        <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>
    <div class="frf-row"><label>下次跟进日期</label><input type="date" v-model="form.下次跟进计划日期" /></div>
    <div class="frf-hint">下次跟进日期默认为节点动作完成时间</div>
    <div v-if="error" class="frf-error">{{ error }}</div>
    <div class="frf-actions">
      <button class="frf-btn primary" @click="submit">保存</button>
      <button class="frf-btn" @click="emit('cancel')">取消</button>
    </div>
  </div>
</template>

<style scoped>
.frf { background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); padding: var(--sp-3); margin-top: var(--sp-2); }
.frf-title { font-weight: 700; font-size: var(--fs-2); color: var(--txt); margin-bottom: var(--sp-2); }
.frf-row { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); font-size: var(--fs-1); }
.frf-row label { width: 84px; flex-shrink: 0; color: var(--sub); }
.frf-row input, .frf-row select, .frf-row textarea { flex: 1; padding: var(--sp-1) var(--sp-2); border: 1px solid var(--line); border-radius: var(--r-sm); font-size: var(--fs-1); box-sizing: border-box; }
.frf-row input[readonly] { background: var(--card2); color: var(--mut); cursor: default; }
.frf-hint { font-size: var(--fs-1); color: var(--mut); margin: var(--sp-1) 0 var(--sp-2) 92px; }
.frf-error { color: var(--danger); font-size: var(--fs-1); margin: var(--sp-1) 0; }
.frf-actions { display: flex; gap: var(--sp-2); justify-content: flex-end; }
.frf-btn { border: 1px solid var(--line2); background: var(--card); border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-4); font-size: var(--fs-1); cursor: pointer; color: var(--sub); }
.frf-btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
</style>
