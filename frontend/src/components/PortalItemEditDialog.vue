<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue'
import { isSafeUrl, newItemId, type PortalItem, type PortalFileRef, type PortalVisibility } from '@/lib/portal'
import { uploadPortalFile } from '@/lib/portalApi'
import { listAccounts, type AdminAccount } from '@/lib/admin'

const props = defineProps<{ modelValue: boolean; item: PortalItem | null; groups: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'save', item: PortalItem): void }>()

const accounts = ref<AdminAccount[]>([])
onMounted(async () => { try { accounts.value = await listAccounts() } catch { accounts.value = [] } })

const form = reactive({
  id: '', type: 'url' as 'url' | 'file', name: '', group: '', emoji: '', featured: false,
  url: '', file: null as PortalFileRef | null,
  visMode: 'all' as 'all' | 'accounts', visAccounts: [] as string[],
})
const error = ref('')
const uploading = ref(false)

function loadFromProps() {
  const it = props.item
  error.value = ''
  if (it) {
    form.id = it.id; form.type = it.type; form.name = it.name; form.group = it.group
    form.emoji = it.emoji; form.featured = it.featured; form.url = it.url; form.file = it.file
    form.visMode = it.visibility.mode
    form.visAccounts = it.visibility.mode === 'accounts' ? [...it.visibility.accounts] : []
  } else {
    form.id = newItemId(); form.type = 'url'; form.name = ''; form.group = props.groups[0] ?? ''
    form.emoji = ''; form.featured = false; form.url = ''; form.file = null
    form.visMode = 'all'; form.visAccounts = []
  }
}
watch(() => props.modelValue, (v) => { if (v) loadFromProps() }, { immediate: true })

async function onPickFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  uploading.value = true; error.value = ''
  try {
    form.file = await uploadPortalFile(f)
  } catch (err) {
    error.value = '上传失败：' + (err instanceof Error ? err.message : String(err))
  } finally {
    uploading.value = false
  }
}

async function onSave() {
  error.value = ''
  if (!form.name.trim()) { error.value = '请填写名称'; return }
  if (!form.group) { error.value = '请选择或新建分组'; return }
  if (form.type === 'url' && !isSafeUrl(form.url)) { error.value = '链接须为 http/https 开头'; return }
  if (form.type === 'file' && !form.file) { error.value = '请先上传文件'; return }
  const visibility: PortalVisibility = form.visMode === 'accounts'
    ? { mode: 'accounts', accounts: [...form.visAccounts] }
    : { mode: 'all' }
  const out: PortalItem = {
    id: form.id, type: form.type, name: form.name.trim(), group: form.group,
    emoji: form.emoji.trim(), featured: form.featured,
    url: form.type === 'url' ? form.url.trim() : '',
    file: form.type === 'file' ? form.file : null,
    visibility,
  }
  emit('save', out)
  emit('update:modelValue', false)
}
function onClose() { emit('update:modelValue', false) }

defineExpose({ form, error, onSave })
</script>

<template>
  <el-dialog :model-value="modelValue" :title="item ? '编辑门户项' : '新建门户项'" width="440px"
             @update:model-value="onClose" append-to-body>
    <div class="pe-form">
      <div class="pe-row">
        <span class="pe-label">类型</span>
        <el-radio-group v-model="form.type">
          <el-radio value="url">url 跳转</el-radio>
          <el-radio value="file">文件下载</el-radio>
        </el-radio-group>
      </div>
      <div class="pe-row">
        <span class="pe-label">名称</span>
        <el-input v-model="form.name" maxlength="60" placeholder="如 PMIS 系统" style="width: 260px" />
      </div>
      <div class="pe-row">
        <span class="pe-label">分组</span>
        <el-select v-model="form.group" filterable allow-create default-first-option
                   placeholder="选择或新建分组" style="width: 260px">
          <el-option v-for="g in groups" :key="g" :value="g" :label="g" />
        </el-select>
      </div>
      <div class="pe-row">
        <span class="pe-label">图标</span>
        <el-input v-model="form.emoji" maxlength="8" placeholder="可选 emoji，留空用首字母" style="width: 160px" />
        <el-checkbox v-model="form.featured">置顶 ★</el-checkbox>
      </div>
      <div v-if="form.type === 'url'" class="pe-row">
        <span class="pe-label">链接</span>
        <el-input v-model="form.url" placeholder="https://..." style="width: 260px" />
      </div>
      <div v-else class="pe-row">
        <span class="pe-label">文件</span>
        <input type="file" data-test="pe-file" :disabled="uploading" @change="onPickFile" />
        <span v-if="form.file" class="pe-file-name u-num">{{ form.file.originalName }}</span>
      </div>
      <div class="pe-row">
        <span class="pe-label">可见</span>
        <el-radio-group v-model="form.visMode">
          <el-radio value="all">全部账号</el-radio>
          <el-radio value="accounts">指定账号</el-radio>
        </el-radio-group>
      </div>
      <div v-if="form.visMode === 'accounts'" class="pe-row">
        <span class="pe-label"></span>
        <el-select v-model="form.visAccounts" multiple filterable collapse-tags
                   placeholder="勾选可见账号" style="width: 260px">
          <el-option v-for="a in accounts" :key="a.account" :value="a.account"
                     :label="a.displayName + '（' + a.account + '）'" />
        </el-select>
      </div>
      <div v-if="error" class="pe-error">{{ error }}</div>
    </div>
    <template #footer>
      <el-button @click="onClose">取消</el-button>
      <el-button type="primary" :loading="uploading" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.pe-form { display: flex; flex-direction: column; gap: var(--sp-3); }
.pe-row { display: flex; align-items: center; gap: var(--sp-2); }
.pe-label { width: 44px; font-size: var(--fs-2); color: var(--sub); flex-shrink: 0; }
.pe-file-name { font-size: var(--fs-1); color: var(--sub); }
.pe-error { color: var(--danger-text); font-size: var(--fs-1); }
</style>
