<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { PAGE_OPTIONS } from '@/lib/pageAccess'
import { NAV_SECTIONS, sectionPageLinks } from '@/nav'
import { PAGE_DOMAINS } from '@/lib/pageScope'
import {
  listAccounts, createAccount, updateAccount, deleteAccount, listRoster,
  type AdminAccount, type RosterEntry,
} from '@/lib/admin'
import AuditLogTab from '@/components/AuditLogTab.vue'
import PageHeader from '@/components/PageHeader.vue'

const activeTab = ref('accounts')
const store = useDataStore()
const accounts = ref<AdminAccount[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref(false) // true=编辑(account 只读),false=新建

// 组级选页:分组与侧栏同源;sectionPageLinks 会把 tab 容器入口展开成其下 tab 页,
// 否则 10 个分析页在本配置界面里整个消失、无法勾选。
const NAV_GROUPS = NAV_SECTIONS.map((s) => ({ key: s.id, label: s.label, links: sectionPageLinks(s) }))

const advancedOpen = ref(false)

/** 例外目标:该账号已勾选(或 '*')∩ 有数据域 ∩ 非 governance(沿既有语义排除)。
 *  给没勾的页配范围本是无意义配置,顺手堵死;配「只看成本分析」的账号这里只有 1 项。 */
const overrideTargets = computed(() => {
  const all = NAV_GROUPS.flatMap((g) => g.links)
  const star = form.allowedPages.includes('*')
  return all
    .filter((l) => (star || form.allowedPages.includes(l.key)))
    .filter((l) => PAGE_DOMAINS[l.key] && l.key !== 'governance')
    .map((l) => ({ value: l.key, label: l.label }))
})
function targetIsOpp(key: string): boolean {
  return PAGE_DOMAINS[key] === 'opportunity'
}

/** 已勾选、有数据域、但生效范围为空的页(按 页级例外 ?? 默认 解析)。仅提示,不阻断。
 *  必须按 PAGE_DOMAINS 判定 —— data/budget/about 无数据域,拦它们会重蹈「配不出来」。 */
const emptyScopePages = computed(() => {
  const star = form.allowedPages.includes('*')
  const ovs = new Map(form.overrides.filter((o) => o.target).map((o) => [o.target, o]))
  return NAV_GROUPS.flatMap((g) => g.links)
    .filter((l) => (star || form.allowedPages.includes(l.key)) && PAGE_DOMAINS[l.key])
    .filter((l) => {
      const o = ovs.get(l.key)
      const l4 = o ? o.l4 : form.allowedL4
      const staff = o ? o.staff : form.allowedStaff
      return !l4.length && !staff.length
    })
    .map((l) => l.label)
})

const blankForm = () => ({
  account: '', password: '', displayName: '',
  allowedPages: [] as string[], allowedL4: [] as string[], allowedStaff: [] as string[],
  overrides: [] as { target: string; l4: string[]; staff: string[] }[],
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

const roster = ref<RosterEntry[]>([])
const nameCount = computed(() => {
  const m = new Map<string, number>()
  for (const r of roster.value) m.set(r.name, (m.get(r.name) ?? 0) + 1)
  return m
})
const staffOptions = computed(() =>
  roster.value.map((r) => ({
    value: r.id,
    label: (nameCount.value.get(r.name) ?? 0) > 1 ? `${r.name}（${r.id}）` : r.name,
  })),
)
const idToName = computed(() => {
  const m = new Map<string, string>()
  for (const r of roster.value) m.set(r.id, r.name)
  return m
})
function staffLabels(ids: string[] | undefined): string {
  if (!ids || !ids.length) return ''
  return ids.map((id) => idToName.value.get(id) || id).join('、')
}
function scopeLabel(row: AdminAccount): string {
  const l4 = row.allowedL4.includes('*') ? '全部' : (row.allowedL4.join('、') || '')
  const staff = staffLabels(row.allowedStaff)
  const base = [l4, staff].filter(Boolean).join('；') || '—'
  const n = Object.keys(row.pageScopes ?? {}).length
  return n > 0 ? `${base}　＋${n} 覆盖` : base
}

function toggleGroup(groupKey: string, on: boolean) {
  const g = NAV_GROUPS.find((x) => x.key === groupKey); if (!g) return
  const keys = g.links.map((l) => l.key)
  const set = new Set(form.allowedPages.filter((k) => k !== '*'))
  keys.forEach((k) => (on ? set.add(k) : set.delete(k)))
  form.allowedPages = [...set]
}
function togglePage(key: string, on: boolean) {
  const set = new Set(form.allowedPages.filter((k) => k !== '*'))
  on ? set.add(key) : set.delete(key)
  form.allowedPages = [...set]
}
function groupIndeterminate(groupKey: string): boolean {
  if (form.allowedPages.includes('*')) return false
  const g = NAV_GROUPS.find((x) => x.key === groupKey)
  if (!g) return false
  const n = g.links.filter((l) => form.allowedPages.includes(l.key)).length
  return n > 0 && n < g.links.length
}
function groupChecked(groupKey: string): boolean {
  if (form.allowedPages.includes('*')) return true
  const g = NAV_GROUPS.find((x) => x.key === groupKey)
  return !!g && g.links.every((l) => form.allowedPages.includes(l.key))
}
function addOverride() { form.overrides.push({ target: '', l4: [], staff: [] }) }
function removeOverride(i: number) { form.overrides.splice(i, 1) }
function buildScopes(): { pageScopes: Record<string, { l4: string[]; staff: string[] }> } {
  const star = form.allowedPages.includes('*')
  const pageScopes: Record<string, { l4: string[]; staff: string[] }> = {}
  for (const o of form.overrides) {
    if (!o.target) continue
    if (!star && !form.allowedPages.includes(o.target)) continue   // 孤儿:该页已不可访问
    pageScopes[o.target] = { l4: o.l4, staff: targetIsOpp(o.target) ? [] : o.staff }
  }
  return { pageScopes }
}

async function reload() {
  loading.value = true
  try {
    accounts.value = await listAccounts()
    try {
      roster.value = await listRoster()
    } catch {
      roster.value = []   // 花名册缺失/失败 → 选择器空,不阻断账号管理
    }
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
  advancedOpen.value = false
}

function openEdit(row: AdminAccount) {
  editing.value = true
  Object.assign(form, blankForm())
  Object.assign(form, {
    account: row.account, password: '', displayName: row.displayName,
    allowedPages: [...row.allowedPages], allowedL4: [...row.allowedL4],
    allowedStaff: [...(row.allowedStaff ?? [])],
  })
  form.overrides = Object.entries(row.pageScopes ?? {}).map(([pk, v]) => ({
    target: pk, l4: [...(v.l4 ?? [])], staff: [...(v.staff ?? [])],
  }))
  advancedOpen.value = form.overrides.length > 0
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
        allowedStaff: form.allowedStaff,
        ...buildScopes(),
        ...(form.password ? { password: form.password } : {}),
      })
      ElMessage.success('已保存')
    } else {
      await createAccount({
        account: form.account, password: form.password, displayName: form.displayName,
        allowedPages: form.allowedPages, allowedL4: form.allowedL4, allowedStaff: form.allowedStaff,
        ...buildScopes(),
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
onMounted(reload)
defineExpose({
  dialogVisible, editing, form, openCreate, openEdit, submitForm, onDelete, reload, staffOptions, roster,
  NAV_GROUPS, toggleGroup, groupChecked, togglePage, groupIndeterminate, addOverride, removeOverride,
  advancedOpen, overrideTargets, emptyScopePages, accounts,
})
</script>

<template>
  <el-tabs v-model="activeTab" class="admin-tabs">
    <el-tab-pane label="账号管理" name="accounts">
  <div class="admin-view">
    <div class="admin-head">
      <PageHeader title="账号管理" />
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
      <el-table-column label="可见范围" min-width="220">
        <template #default="{ row }">{{ row ? scopeLabel(row) : '' }}</template>
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

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑账号' : '新建账号'" width="640px">
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
          <el-checkbox :model-value="form.allowedPages.includes('*')"
            @change="(v:boolean)=> form.allowedPages = v ? ['*'] : []">全部页面（含未来新增）</el-checkbox>
          <div v-if="!form.allowedPages.includes('*')" class="admin-pages">
            <div v-for="g in NAV_GROUPS" :key="g.key" class="admin-pgroup">
              <el-checkbox class="admin-pgroup-h" :model-value="groupChecked(g.key)"
                :indeterminate="groupIndeterminate(g.key)"
                @change="(v:boolean)=> toggleGroup(g.key, v)">{{ g.label }}</el-checkbox>
              <div class="admin-pgroup-items">
                <el-checkbox v-for="l in g.links" :key="l.key"
                  :model-value="form.allowedPages.includes(l.key)"
                  @change="(v:boolean)=> togglePage(l.key, v)">{{ l.label }}</el-checkbox>
              </div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="可见 L4">
          <el-select v-model="form.allowedL4" multiple filterable class="admin-select" placeholder="选择可见 L4 组织">
            <el-option label="全部 L4" value="*" />
            <el-option v-for="l4 in l4Options" :key="l4" :label="l4" :value="l4" />
          </el-select>
        </el-form-item>
        <el-form-item label="额外放行员工">
          <el-select v-model="form.allowedStaff" multiple filterable class="admin-select"
            placeholder="按姓名选择员工(实际存工号)">
            <el-option v-for="o in staffOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <span class="admin-hint">按姓名选择;实际按工号隔离。空=不额外放行个人</span>
        </el-form-item>
        <button type="button" class="admin-adv-h" @click="advancedOpen = !advancedOpen">
          {{ advancedOpen ? '▾' : '▸' }} 高级 · 个别页面单设范围
        </button>
        <div v-show="advancedOpen" class="admin-adv">
          <el-form-item v-for="(o,i) in form.overrides" :key="i" label="例外">
            <el-select v-model="o.target" filterable class="admin-select" placeholder="选页面">
              <el-option v-for="t in overrideTargets" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
            <el-select v-model="o.l4" multiple filterable class="admin-select" placeholder="L4">
              <el-option label="全部 L4" value="*" />
              <el-option v-for="l4 in l4Options" :key="l4" :label="l4" :value="l4" />
            </el-select>
            <el-select v-if="!targetIsOpp(o.target)" v-model="o.staff" multiple filterable
              class="admin-select" placeholder="员工(按姓名)">
              <el-option v-for="op in staffOptions" :key="op.value" :label="op.label" :value="op.value" />
            </el-select>
            <el-button link type="danger" @click="removeOverride(i)">删除</el-button>
          </el-form-item>
          <el-button link type="primary" @click="addOverride">+ 添加例外</el-button>
        </div>
        <div v-if="emptyScopePages.length" class="admin-warn">
          已勾选的「{{ emptyScopePages.slice(0, 3).join('、') }}」{{ emptyScopePages.length > 3 ? ` 等 ${emptyScopePages.length} 页` : '' }}生效范围为空，该账号能进入页面但看不到任何数据。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">{{ editing ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
    </el-tab-pane>
    <el-tab-pane label="审计日志" name="audit">
      <AuditLogTab v-if="activeTab === 'audit'" />
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.admin-view { padding: var(--sp-5); }
.admin-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-4); }
/* 「新建账号」按本期判据留在原地(见 plan Task 7 对照表),故页头与它同处一行,
   下间距由 .admin-head 统一管理,置 0 以保持标题与按钮同一基线。 */
.admin-head .ph { margin-bottom: 0; }
.admin-table { margin-top: var(--sp-3); }
.admin-select { width: 100%; }
.role-tag { display: inline-block; padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.role-super { background: var(--card2); color: var(--accent); }
.role-normal { background: var(--ok-bg); color: var(--ok-text); }
.pw-tag { display: inline-block; padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.pw-must { background: var(--warn-bg); color: var(--warn-text); }
.pw-done { background: var(--ok-bg); color: var(--ok-text); }
.admin-hint { display: block; margin-top: var(--sp-1); font-size: var(--fs-1); color: var(--mut); }
.admin-pages { width: 100%; }
.admin-pgroup { margin-top: var(--sp-2); }
.admin-pgroup-h { font-weight: 700; }
.admin-pgroup-items { display: flex; flex-wrap: wrap; gap: 0 var(--sp-3); padding-left: var(--sp-4); }
.admin-adv-h { display: block; width: 100%; text-align: left; background: none; border: 0;
  font-family: inherit; margin: var(--sp-3) 0 var(--sp-2); color: var(--accent);
  cursor: pointer; font-size: var(--fs-2); }
.admin-adv-h:hover { background: var(--hover-tint); }
.admin-adv { padding-left: var(--sp-2); border-left: var(--sp-0) solid var(--line); }
.admin-warn { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm);
  background: var(--warn-bg); color: var(--warn-text); font-size: var(--fs-1); }
</style>
