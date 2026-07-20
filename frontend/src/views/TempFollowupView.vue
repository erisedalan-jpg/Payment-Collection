<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { userScopedKey } from '@/lib/userScopedKey'
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'
import TempInstancePanel from '@/components/TempInstancePanel.vue'

defineOptions({ name: 'TempFollowupView' })
useViewScrollMemory()

const data = useDataStore()
const auth = useAuthStore()
const temp = useTempFollowupStore()

// V4.0.2 一次性迁移:多实例后表 key 从 'temp-followup' 变为 'temp-followup:{instanceId}',
// 老用户已存的选列/排序会读不到而回落默认列 —— 用户会以为配置丢了。
// 把旧 key 的值复制到【第一个实例】的新 key 下。标记位必须有,否则用户之后自己改的配置
// 会在下次进页面时被旧值反复覆盖。getItem 也要包 try:浏览器禁用 storage 时访问该属性即抛。
const TABLE_BASE = 'temp-followup'

function migrateLegacyTableKeys(firstInstanceId: string) {
  if (!firstInstanceId) return
  const flag = userScopedKey('tablekeys-migrated:temp-followup:v402')
  let done = true
  try { done = !!localStorage.getItem(flag) } catch { return }
  if (done) return
  try { localStorage.setItem(flag, '1') } catch { /* 隐私模式/配额,忽略 */ }
  for (const prefix of ['colprefs:', 'colsort:']) {
    try {
      const oldKey = prefix + userScopedKey(TABLE_BASE)
      const newKey = prefix + userScopedKey(`${TABLE_BASE}:${firstInstanceId}`)
      const val = localStorage.getItem(oldKey)
      if (val !== null && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, val)
    } catch { /* 单个 key 迁移失败不影响另一个 */ }
  }
}

const ready = ref(false)
onMounted(async () => {
  if (!data.data) data.load()
  if (!temp.loaded) await temp.load()
  migrateLegacyTableKeys(temp.instances[0]?.id ?? '')
  try {
    const last = localStorage.getItem(userScopedKey('temp-active'))
    if (last) temp.setActive(last)      // 该 id 已不存在时 store 会自动回落到第一个
  } catch { /* 忽略 */ }
  ready.value = true
})

function switchInstance(id: string) {
  if (id === temp.activeId) return
  temp.setActive(id)
  try { localStorage.setItem(userScopedKey('temp-active'), id) } catch { /* 忽略 */ }
}

// 新建跟进事项(超管)
const newOpen = ref(false)
const newName = ref('')
const newFrom = ref('')
async function doCreate() {
  await temp.createInstance(newName.value.trim(), newFrom.value || undefined)
  newOpen.value = false
  newName.value = ''
  newFrom.value = ''
}

// 重命名 / 删除跟进事项(超管)
const menuOpen = ref(false)
const renameName = ref('')
watch(menuOpen, (v) => { if (v) renameName.value = temp.activeInstance?.name ?? '' })
async function doRename() {
  if (!temp.activeInstance) return
  await temp.renameInstance(temp.activeInstance.id, renameName.value.trim())
  menuOpen.value = false
}
async function doDeleteInstance() {
  const inst = temp.activeInstance
  if (!inst) return
  await ElMessageBox.confirm(
    `将删除跟进事项「${inst.name}」，同时删除其 ${inst.archives.length} 条归档。此操作不可撤销。`,
    '删除跟进事项', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  await temp.deleteInstance(inst.id)
  menuOpen.value = false
}
</script>

<template>
  <div class="temp-followup-view">
    <h2 class="kp-title">临时重点跟进</h2>

    <div class="tf-insts">
      <button v-for="i in temp.instances" :key="i.id" data-test="temp-inst-tab"
        class="tf-inst" :class="{ active: i.id === temp.activeId }" @click="switchInstance(i.id)">
        {{ i.name }}
      </button>
      <button v-if="auth.isSuper" data-test="temp-inst-new" class="tf-inst tf-inst-new"
        @click="newOpen = true">+ 新建</button>
      <button v-if="auth.isSuper && temp.activeInstance" data-test="temp-inst-menu"
        class="tf-inst tf-inst-menu" title="重命名 / 删除" @click="menuOpen = true">▾</button>
    </div>

    <TempInstancePanel v-if="ready && temp.activeId" :key="temp.activeId" />

    <el-dialog v-model="newOpen" title="新建跟进事项" width="420px">
      <div class="tf-form-row">
        <span class="tf-form-label">名称</span>
        <el-input v-model="newName" maxlength="20" show-word-limit placeholder="如：7月回款攻坚" />
      </div>
      <div class="tf-form-row">
        <span class="tf-form-label">范围</span>
        <el-radio-group v-model="newFrom">
          <el-radio value="">空白</el-radio>
          <el-radio v-for="i in temp.instances" :key="i.id" :value="i.id">复制自 {{ i.name }}</el-radio>
        </el-radio-group>
      </div>
      <template #footer>
        <el-button @click="newOpen = false">取消</el-button>
        <el-button type="primary" :disabled="!newName.trim()" @click="doCreate">新建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="menuOpen" title="管理跟进事项" width="420px">
      <div class="tf-form-row">
        <span class="tf-form-label">名称</span>
        <el-input v-model="renameName" maxlength="20" show-word-limit />
      </div>
      <template #footer>
        <el-button @click="doDeleteInstance">删除</el-button>
        <el-button @click="menuOpen = false">取消</el-button>
        <el-button type="primary" :disabled="!renameName.trim()" @click="doRename">重命名</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
@import '@/styles/followup.css';
.temp-followup-view { padding: var(--sp-4); }
.tf-insts { display: flex; gap: var(--sp-2); overflow-x: auto; margin-bottom: var(--sp-3); }
.tf-inst {
  flex: 0 0 auto; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--card); color: var(--sub);
  font-size: var(--fs-2); cursor: pointer; transition: background var(--dur-1) var(--ease);
}
.tf-inst:hover { background: var(--hover-tint); }
.tf-inst.active { background: var(--selected-tint); color: var(--txt); font-weight: 600; }
.tf-form-row { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.tf-form-label { flex: 0 0 auto; width: 48px; font-size: var(--fs-2); color: var(--sub); }
</style>
