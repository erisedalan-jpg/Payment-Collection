<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { PAGE_OPTIONS } from '@/lib/pageAccess'
import {
  listAccounts, createAccount, updateAccount, deleteAccount,
  type AdminAccount,
} from '@/lib/admin'

const store = useDataStore()
const accounts = ref<AdminAccount[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref(false) // true=编辑(account 只读),false=新建

const blankForm = () => ({
  account: '', password: '', displayName: '',
  allowedPages: [] as string[], allowedL4: [] as string[],
})
const form = reactive(blankForm())

const l4Options = computed<string[]>(() => {
  const set = new Set<string>()
  for (const p of (store.data?.projects ?? []) as { orgL4?: string }[]) {
    const v = (p.orgL4 || '').trim()
    if (v) set.add(v)
  }
  return Array.from(set).sort()
})

async function reload() {
  loading.value = true
  try {
    accounts.value = await listAccounts()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = false
  Object.assign(form, blankForm())
  dialogVisible.value = true
}

function openEdit(row: AdminAccount) {
  editing.value = true
  Object.assign(form, {
    account: row.account, password: '', displayName: row.displayName,
    allowedPages: [...row.allowedPages], allowedL4: [...row.allowedL4],
  })
  dialogVisible.value = true
}

async function submitForm() {
  try {
    if (editing.value) {
      await updateAccount({
        account: form.account,
        displayName: form.displayName,
        allowedPages: form.allowedPages,
        allowedL4: form.allowedL4,
        ...(form.password ? { password: form.password } : {}),
      })
      ElMessage.success('已保存')
    } else {
      await createAccount({
        account: form.account, password: form.password, displayName: form.displayName,
        allowedPages: form.allowedPages, allowedL4: form.allowedL4,
      })
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    await reload()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

async function onDelete(row: AdminAccount) {
  try {
    await ElMessageBox.confirm(`确认删除账号「${row.account}」?`, '删除确认', { type: 'warning' })
  } catch {
    return // 取消
  }
  try {
    await deleteAccount(row.account)
    ElMessage.success('已删除')
    await reload()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

function pageLabels(keys: string[]): string {
  if (keys.includes('*')) return '全部'
  const map = new Map(PAGE_OPTIONS.map((o) => [o.key, o.label]))
  return keys.map((k) => map.get(k) || k).join('、') || '—'
}
function l4Labels(keys: string[]): string {
  if (keys.includes('*')) return '全部'
  return keys.join('、') || '—'
}

onMounted(reload)
defineExpose({ dialogVisible, editing, form, openCreate, openEdit, submitForm, onDelete, reload })
</script>

<template>
  <div class="admin-view">
    <div class="admin-head">
      <h2 class="admin-title">账号管理</h2>
      <el-button type="primary" data-test="admin-create" @click="openCreate">新建账号</el-button>
    </div>

    <el-table :data="accounts" v-loading="loading" class="admin-table" stripe>
      <el-table-column prop="account" label="账号" min-width="120" />
      <el-table-column prop="displayName" label="显示名" min-width="120" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <template v-if="row">
            <span class="role-tag" :class="row.isSuper ? 'role-super' : 'role-normal'">
              {{ row.isSuper ? '超级管理员' : '普通管理员' }}
            </span>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="可访问页面" min-width="200">
        <template #default="{ row }">{{ row ? pageLabels(row.allowedPages) : '' }}</template>
      </el-table-column>
      <el-table-column label="可见 L4" min-width="160">
        <template #default="{ row }">{{ row ? l4Labels(row.allowedL4) : '' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <template v-if="row && !row.isSuper">
            <span class="pw-tag" :class="row.mustChangePassword ? 'pw-must' : 'pw-done'">
              {{ row.mustChangePassword ? '首次须改密' : '已改密' }}
            </span>
          </template>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <template v-if="row">
            <el-button link type="primary" :disabled="row.isSuper" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" :disabled="row.isSuper" @click="onDelete(row)">删除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑账号' : '新建账号'" width="520px">
      <el-form label-width="92px">
        <el-form-item label="账号">
          <el-input v-model="form.account" :disabled="editing" placeholder="字母/数字/_-." />
        </el-form-item>
        <el-form-item :label="editing ? '重置密码' : '密码'">
          <el-input v-model="form.password" type="password" show-password
            :placeholder="editing ? '留空表示不修改' : '设置初始密码'" />
          <span v-if="!editing" class="admin-hint">新账号首次登录须修改密码</span>
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="form.displayName" placeholder="展示用名称" />
        </el-form-item>
        <el-form-item label="可访问页面">
          <el-select v-model="form.allowedPages" multiple filterable class="admin-select" placeholder="选择可访问页面">
            <el-option v-for="o in PAGE_OPTIONS" :key="o.key" :label="o.label" :value="o.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="可见 L4">
          <el-select v-model="form.allowedL4" multiple filterable class="admin-select" placeholder="选择可见 L4 组织">
            <el-option label="全部 L4" value="*" />
            <el-option v-for="l4 in l4Options" :key="l4" :label="l4" :value="l4" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">{{ editing ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-view { padding: var(--sp-5); }
.admin-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-4); }
.admin-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.admin-table { margin-top: var(--sp-3); }
.admin-select { width: 100%; }
.role-tag { display: inline-block; padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.role-super { background: var(--card2); color: var(--accent); }
.role-normal { background: var(--ok-bg); color: var(--ok-text); }
.pw-tag { display: inline-block; padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.pw-must { background: var(--warn-bg); color: var(--warn-text); }
.pw-done { background: var(--ok-bg); color: var(--ok-text); }
.admin-hint { display: block; margin-top: var(--sp-1); font-size: var(--fs-1); color: var(--mut); }
</style>
