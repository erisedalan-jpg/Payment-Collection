<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { followupApi, type FollowupRecord, type FollowupFormData } from '@/lib/followupApi'
import FollowupRecordForm from './FollowupRecordForm.vue'

const props = defineProps<{ projectId: string; projectName: string; defaultNextDate?: string }>()

const records = ref<FollowupRecord[]>([])
const types = ref<string[]>([])
const statuses = ref<string[]>([])
const showForm = ref(false)
const editRecord = ref<FollowupRecord | null>(null)
const expandedIdx = ref(-1)

const latest = computed(() => records.value[0] || null)
const history = computed(() => records.value.slice(1))

async function loadTypes() {
  try {
    const r = await followupApi.types()
    types.value = r['跟进类型'] || []
    statuses.value = r['跟进状态'] || []
  } catch {
    /* 保留空，表单仍可用默认 */
  }
}
async function loadRecords() {
  try {
    const r = await followupApi.list(props.projectId, 20)
    records.value = (r.records || [])
      .slice()
      .sort((a, b) => String(b['跟进时间'] || '').localeCompare(String(a['跟进时间'] || '')))
  } catch {
    records.value = []
  }
}
onMounted(async () => {
  await loadTypes()
  await loadRecords()
})

function openAdd() {
  editRecord.value = null
  showForm.value = true
}
function openEdit(r: FollowupRecord) {
  editRecord.value = r
  showForm.value = true
  expandedIdx.value = -1
}
function cancelForm() {
  showForm.value = false
  editRecord.value = null
}
function toggleHistory(i: number) {
  expandedIdx.value = expandedIdx.value === i ? -1 : i
}

async function onSubmit(data: FollowupFormData) {
  try {
    const res = data.记录编号 ? await followupApi.update(data) : await followupApi.add(data)
    showForm.value = false
    editRecord.value = null
    ElMessage.success(res.message || '已保存到本地')
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e?.message || ''))
  } finally {
    await loadRecords()
  }
}
async function onDelete(r: FollowupRecord) {
  const id = r['记录编号'] || ''
  if (!id) return
  try {
    await ElMessageBox.confirm(`确定要删除此跟进记录吗？\n\n记录编号: ${id}\n删除后无法恢复。`, '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    const res = await followupApi.remove(id)
    ElMessage.success(res.message || '已删除')
    await loadRecords()
  } catch (e: any) {
    ElMessage.error('删除失败: ' + (e?.message || ''))
  }
}
defineExpose({ loadRecords, onSubmit, onDelete, openAdd })
</script>

<template>
  <div class="fr">
    <div class="fr-head">
      <span class="fr-title">跟进记录</span>
      <button v-if="!showForm" class="fr-addbtn" @click="openAdd">+ 添加</button>
    </div>

    <div v-if="latest" class="fr-record">
      <div class="fr-meta">
        <span>{{ (latest['跟进时间'] || '').substring(0, 16) }}</span>
        <span>{{ latest['跟进人'] }}</span>
        <span>{{ latest['跟进类型'] }}</span>
      </div>
      <div class="fr-content">{{ latest['跟进内容'] }}</div>
      <div class="fr-footer">
        <span class="fr-status">{{ latest['跟进状态'] }}</span>
        <span v-if="latest['下次跟进计划日期']" class="fr-next">下次: {{ latest['下次跟进计划日期'] }}</span>
        <button class="fr-link edit" @click="openEdit(latest!)">编辑</button>
        <button class="fr-link del" @click="onDelete(latest!)">删除</button>
      </div>
    </div>

    <div v-if="history.length" class="fr-history">
      <span class="fr-hist-label">历史:</span>
      <button
        v-for="(r, i) in history"
        :key="r['记录编号'] || i"
        class="fr-hist-btn"
        :class="{ active: expandedIdx === i }"
        @click="toggleHistory(i)"
      >
        {{ (r['跟进时间'] || '').substring(0, 16) }}
      </button>
    </div>
    <div v-if="expandedIdx >= 0 && history[expandedIdx]" class="fr-expanded">
      <div class="fr-meta">
        <span>{{ (history[expandedIdx]['跟进时间'] || '').substring(0, 16) }}</span>
        <span>{{ history[expandedIdx]['跟进人'] }}</span>
        <span>{{ history[expandedIdx]['跟进类型'] }}</span>
      </div>
      <div class="fr-content">{{ history[expandedIdx]['跟进内容'] }}</div>
      <div class="fr-footer">
        <span class="fr-status">{{ history[expandedIdx]['跟进状态'] }}</span>
        <button class="fr-link edit" @click="openEdit(history[expandedIdx])">编辑</button>
        <button class="fr-link del" @click="onDelete(history[expandedIdx])">删除</button>
      </div>
    </div>

    <FollowupRecordForm
      v-if="showForm"
      :project-id="projectId"
      :project-name="projectName"
      :types="types"
      :statuses="statuses"
      :edit-record="editRecord"
      :default-next-date="defaultNextDate"
      @submit="onSubmit"
      @cancel="cancelForm"
    />

  </div>
</template>

<style scoped>
.fr { margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px solid var(--line); }
.fr-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-2); }
.fr-title { font-weight: 700; font-size: var(--fs-1); color: var(--txt); }
.fr-addbtn { background: var(--accent); color: var(--on-accent); border: none; border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-3); font-size: var(--fs-1); cursor: pointer; }
.fr-record, .fr-expanded { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-sm); padding: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-2); }
.fr-expanded { border-color: var(--accent); }
.fr-meta { display: flex; gap: var(--sp-3); font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.fr-content { font-size: var(--fs-2); color: var(--txt); white-space: pre-wrap; }
.fr-footer { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-2); font-size: var(--fs-1); }
.fr-status { color: var(--accent); }
.fr-next { color: var(--mut); }
.fr-link { border: none; background: none; cursor: pointer; font-size: var(--fs-1); }
.fr-link.edit { color: var(--accent); margin-left: auto; }
.fr-link.del { color: var(--danger); }
.fr-history { display: flex; flex-wrap: wrap; gap: var(--sp-1); align-items: center; margin-bottom: var(--sp-2); }
.fr-hist-label { font-size: var(--fs-1); color: var(--mut); }
.fr-hist-btn { border: 1px solid var(--accent); color: var(--accent); background: var(--card); border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-2); font-size: var(--fs-1); cursor: pointer; }
.fr-hist-btn.active { background: var(--accent); color: var(--on-accent); }
</style>
