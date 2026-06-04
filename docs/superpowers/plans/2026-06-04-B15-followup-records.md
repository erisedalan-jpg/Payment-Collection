# 临期跟进 跟进记录 CRUD + 云回写 + 同步轮询 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 B14 展开面板的项目卡里嵌入"跟进记录"区：列表（最新详情 + 历史时间戳展开）、新增/编辑/删除表单（走 `/api/followup/*`）、云文档异步回写的同步状态 toast（轮询 `/api/followup/sync-status`）。这是首个后端写操作页。

**范围（两步拆分的第 2 步）：** 承接 B14（展开面板/项目列表/本地标记），本 B15 补上**跟进记录 CRUD + 云同步反馈**。`cloudUrl` 由数据管理页（B16）的云文档地址提供，本期表单不传 cloudUrl，后端回退全局 `sync_url`（已设置则云同步、未设置则仅本地），与旧逻辑一致。

**Architecture:** 后端调用抽到 `lib/followupApi.ts`（基于现有 `@/api/client` 的 api.get/post，类型化 list/types/add/update/delete/syncStatus）。同步 toast + 轮询抽到组合式 `composables/useFollowupSync.ts`（toast 列表 + notify + 轮询，时间/轮询函数可注入便于测试）。表单 `FollowupRecordForm.vue`（3 只读 + 5 可编辑 + 校验）。记录区 `FollowupRecords.vue`（列表 + 增删改 + 同步反馈）嵌入 B14 的 `FuProjectRow.vue` 展开区。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Vitest（fetch/api/timer mock）。

**忠实移植基准（旧 app.js + server.py）：** `_renderFollowupSection`(7461) / `_loadFollowupRecords`(7521) / `_submitFollowupRecord`(7634) / `_editFollowupRecord`(7712) / `_deleteFollowupRecord`(7770) / `_showFollowupSyncToast`(7812) / `_pollFollowupSyncStatus`(7841)；后端 `handle_followup_add/update/delete/list/types/sync_status`(512-747)。

**后端 API 契约（已核对 server.py）：**
- `GET /api/followup/types` → `{success, 跟进类型:[], 跟进状态:[]}`
- `GET /api/followup/list/<projectId>?limit=N` → `{success, records:[], total}`（records 已去 syncStatus；字段：记录编号/跟进时间/跟进人/跟进类型/跟进内容/跟进状态/下次跟进计划日期/项目编号/项目名称/节点动作完成时间）
- `POST /api/followup/add` body `{项目编号,项目名称,跟进人,跟进类型,跟进内容,跟进状态,下次跟进计划日期?,cloudUrl?}` → `{success, 记录编号, message}`（message 含"正在同步到云文档"=云，含"仅本地保存"=本地）
- `POST /api/followup/update` body `{记录编号, 跟进人?,跟进类型?,跟进内容?,跟进状态?,下次跟进计划日期?,cloudUrl?}` → `{success, 记录编号, message}`
- `POST /api/followup/delete` body `{记录编号, cloudUrl?}` → `{success, message}`
- `GET /api/followup/sync-status?recordId=X` → `{success, recordId, state:{status:'syncing'|'success'|'failed'|'unknown', message}}`
- 失败统一 `{success:false, code, message}`（`@/api/client` 已转 `ApiRequestError`）。

**关键忠实性要点：**
- 表单字段（CLAUDE.md 约定）：只读 **记录编号 / 项目编号 / 项目名称** 三项；可编辑 跟进类型(select，含"邮件推动") / 跟进人(≤20) / 跟进内容(textarea ≤500) / 跟进状态(select) / 下次跟进计划日期(date)。**不含** amountTier。
- 校验：跟进人必填、跟进内容必填且 ≤500（前端先校验，后端再校验）。
- 记录列表按 `跟进时间` 降序；最新一条展示详情 + 编辑/删除；其余为时间戳按钮，点击展开详情（再点收起）。
- 提交：有 `记录编号` 走 update，否则 add；成功后隐藏表单 + 重载列表 + 按 message 触发同步 toast。
- 删除：confirm 确认 → delete → toast + 重载。
- 同步 toast：message 含"正在同步/正在重新同步"且有 recordId → 云同步 toast + 轮询；否则本地 toast（4s 后消失）。轮询每 2s、最多 60 次：syncing→更新文案；success→"已同步到云文档"（5s 后消失）；failed→"同步失败"（8s 后消失）；超时→"同步耗时较长，状态未知"（8s 后消失）。
- 时间/轮询函数注入参数，便于测试。

**展示从简（已记录，非偏差）：**
- toast 用组件内固定区渲染（替代旧 DOM 注入 + spinner SVG）。
- 记录列表"右下角蓝色三角角标(记录数)"、历史按钮高亮等纯样式细节从简。
- 表单用原生 input/select/textarea（与既有轻表单一致），校验用内联错误文本（替代 alert）。
- `cloudUrl` 不从表单传（B16 数据管理页负责云地址），后端回退全局 sync_url。

---

## File Structure

| 文件 | 职责 | 任务 |
|---|---|---|
| `frontend/src/lib/followupApi.ts` | 类型化后端调用（types/list/add/update/delete/syncStatus）+ 类型 | T1 |
| `frontend/src/composables/useFollowupSync.ts` | 同步 toast 列表 + notify + 轮询（可注入） | T2 |
| `frontend/src/components/FollowupRecordForm.vue` | 跟进记录表单（3 只读 + 5 可编辑 + 校验） | T3 |
| `frontend/src/components/FollowupRecords.vue` | 记录区（列表 + 增删改 + 同步反馈） | T4 |
| `frontend/src/components/FuProjectRow.vue`(改) | 展开区嵌入 FollowupRecords | T5 |

新建文件配 `*.test.ts`。

---

### Task 1: lib/followupApi.ts（类型化 API + 测试）

**Files:**
- Create: `frontend/src/lib/followupApi.ts`
- Test: `frontend/src/lib/followupApi.test.ts`

依赖：`api` 来自 `@/api/client`（get/post，已对 {success:false} 抛 ApiRequestError）。

- [ ] **Step 1: 写失败测试** — `frontend/src/lib/followupApi.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { followupApi } from './followupApi'

afterEach(() => vi.restoreAllMocks())

function mockFetch(body: any) {
  return vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => body } as any)
}

describe('followupApi', () => {
  it('types 解析类型/状态', async () => {
    mockFetch({ success: true, 跟进类型: ['邮件推动'], 跟进状态: ['跟进中'] })
    const r = await followupApi.types()
    expect(r['跟进类型']).toEqual(['邮件推动'])
  })
  it('list 编码 projectId 并带 limit', async () => {
    const f = mockFetch({ success: true, records: [{ 记录编号: 'FU-1' }], total: 1 })
    const r = await followupApi.list('P 1', 20)
    expect(r.records[0]['记录编号']).toBe('FU-1')
    expect((f.mock.calls[0][0] as string)).toBe('/api/followup/list/P%201?limit=20')
  })
  it('add POST 到 /api/followup/add', async () => {
    const f = mockFetch({ success: true, 记录编号: 'FU-2', message: '已保存' })
    const r = await followupApi.add({ 项目编号: 'P1', 项目名称: '甲', 跟进人: '张', 跟进类型: '邮件推动', 跟进内容: '催', 跟进状态: '跟进中' })
    expect(r['记录编号']).toBe('FU-2')
    expect(f.mock.calls[0][0]).toBe('/api/followup/add')
    expect((f.mock.calls[0][1] as any).method).toBe('POST')
  })
  it('remove 仅传记录编号（无 cloudUrl）', async () => {
    const f = mockFetch({ success: true, message: '已删除' })
    await followupApi.remove('FU-9')
    expect(JSON.parse((f.mock.calls[0][1] as any).body)).toEqual({ 记录编号: 'FU-9' })
  })
  it('syncStatus 解析 state', async () => {
    mockFetch({ success: true, recordId: 'FU-1', state: { status: 'success', message: 'ok' } })
    const r = await followupApi.syncStatus('FU-1')
    expect(r.state.status).toBe('success')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/lib/followupApi.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/lib/followupApi.ts`:

```ts
import { api } from '@/api/client'

export interface FollowupRecord {
  记录编号?: string
  跟进时间?: string
  跟进人?: string
  跟进类型?: string
  跟进内容?: string
  跟进状态?: string
  下次跟进计划日期?: string
  项目编号?: string
  项目名称?: string
  节点动作完成时间?: string
}

export interface FollowupFormData {
  项目编号: string
  项目名称: string
  跟进人: string
  跟进类型: string
  跟进内容: string
  跟进状态: string
  下次跟进计划日期?: string
  记录编号?: string
  cloudUrl?: string
}

interface TypesResp {
  success: true
  跟进类型: string[]
  跟进状态: string[]
}
interface ListResp {
  success: true
  records: FollowupRecord[]
  total: number
}
interface MutResp {
  success: true
  记录编号?: string
  message: string
}
interface DelResp {
  success: true
  message: string
}
interface SyncResp {
  success: true
  recordId: string
  state: { status: string; message: string }
}

/** 跟进记录后端调用（忠实对接 server.py handle_followup_*）。 */
export const followupApi = {
  types: () => api.get<TypesResp>('/api/followup/types'),
  list: (projectId: string, limit = 20) =>
    api.get<ListResp>(`/api/followup/list/${encodeURIComponent(projectId)}?limit=${limit}`),
  add: (data: FollowupFormData) => api.post<MutResp>('/api/followup/add', data),
  update: (data: FollowupFormData) => api.post<MutResp>('/api/followup/update', data),
  remove: (recordId: string, cloudUrl?: string) =>
    api.post<DelResp>('/api/followup/delete', cloudUrl ? { 记录编号: recordId, cloudUrl } : { 记录编号: recordId }),
  syncStatus: (recordId: string) =>
    api.get<SyncResp>(`/api/followup/sync-status?recordId=${encodeURIComponent(recordId)}`),
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/lib/followupApi.test.ts`（全绿）
- [ ] **Step 5: typecheck** — `cd frontend && npm run typecheck`（无新增错误）。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/followupApi.ts frontend/src/lib/followupApi.test.ts
git commit -m "feat(frontend): 新增 followupApi 类型化后端调用（types/list/add/update/delete/syncStatus）"
```

---

### Task 2: composables/useFollowupSync.ts（同步 toast + 轮询 + 测试）

**Files:**
- Create: `frontend/src/composables/useFollowupSync.ts`
- Test: `frontend/src/composables/useFollowupSync.test.ts`

依赖：`followupApi`（默认轮询函数）。

- [ ] **Step 1: 写失败测试** — `frontend/src/composables/useFollowupSync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFollowupSync } from './useFollowupSync'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useFollowupSync', () => {
  it('本地 message → local toast，4s 后消失', () => {
    const { toasts, notify } = useFollowupSync()
    notify('跟进记录已保存（仅本地保存）', '')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].status).toBe('local')
    vi.advanceTimersByTime(4000)
    expect(toasts.value).toHaveLength(0)
  })

  it('云 message → 轮询至 success 后绿并消失', async () => {
    const syncStatusFn = vi.fn().mockResolvedValue({ state: { status: 'success', message: 'ok' } })
    const { toasts, notify } = useFollowupSync({ pollMs: 1000, syncStatusFn })
    notify('跟进记录已保存，正在同步到云文档', 'FU-1')
    expect(toasts.value[0].status).toBe('syncing')
    await vi.advanceTimersByTimeAsync(1000)
    expect(syncStatusFn).toHaveBeenCalledWith('FU-1')
    expect(toasts.value[0].status).toBe('success')
    await vi.advanceTimersByTimeAsync(5000)
    expect(toasts.value).toHaveLength(0)
  })

  it('云 message → 轮询 failed 后红', async () => {
    const syncStatusFn = vi.fn().mockResolvedValue({ state: { status: 'failed', message: 'x' } })
    const { toasts, notify } = useFollowupSync({ pollMs: 1000, syncStatusFn })
    notify('正在同步到云文档', 'FU-2')
    await vi.advanceTimersByTimeAsync(1000)
    expect(toasts.value[0].status).toBe('failed')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/composables/useFollowupSync.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/composables/useFollowupSync.ts`:

```ts
import { ref } from 'vue'
import { followupApi } from '@/lib/followupApi'

export type SyncStatus = 'syncing' | 'success' | 'failed' | 'local' | 'unknown'
export interface SyncToast {
  id: string
  status: SyncStatus
  text: string
}
export interface SyncOpts {
  pollMs?: number
  maxPolls?: number
  syncStatusFn?: (recordId: string) => Promise<{ state: { status: string; message: string } }>
}

let _seq = 0

/** 同步状态 toast + 轮询（忠实移植 _showFollowupSyncToast/_pollFollowupSyncStatus）。时间/轮询函数可注入便于测试。 */
export function useFollowupSync(opts: SyncOpts = {}) {
  const pollMs = opts.pollMs ?? 2000
  const maxPolls = opts.maxPolls ?? 60
  const syncStatusFn = opts.syncStatusFn ?? ((id: string) => followupApi.syncStatus(id))

  const toasts = ref<SyncToast[]>([])
  function add(t: SyncToast) {
    toasts.value = [...toasts.value, t]
  }
  function update(id: string, patch: Partial<SyncToast>) {
    toasts.value = toasts.value.map((t) => (t.id === id ? { ...t, ...patch } : t))
  }
  function remove(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function notify(message: string, recordId: string) {
    const id = 'to_' + ++_seq
    const isCloud = !!recordId && (message.includes('正在同步') || message.includes('正在重新同步'))
    if (!isCloud) {
      add({ id, status: 'local', text: message || '已保存到本地' })
      setTimeout(() => remove(id), 4000)
      return
    }
    add({ id, status: 'syncing', text: '正在同步到云文档...' })
    let polls = 0
    const timer = setInterval(async () => {
      polls++
      if (polls > maxPolls) {
        clearInterval(timer)
        update(id, { status: 'unknown', text: '同步耗时较长，状态未知' })
        setTimeout(() => remove(id), 8000)
        return
      }
      try {
        const r = await syncStatusFn(recordId)
        const st = r.state || { status: 'unknown', message: '' }
        if (st.status === 'syncing') {
          update(id, { text: st.message || '同步中...' })
        } else if (st.status === 'success') {
          clearInterval(timer)
          update(id, { status: 'success', text: '已同步到云文档' })
          setTimeout(() => remove(id), 5000)
        } else if (st.status === 'failed') {
          clearInterval(timer)
          update(id, { status: 'failed', text: '同步失败' })
          setTimeout(() => remove(id), 8000)
        }
      } catch {
        /* 网络错误，继续轮询 */
      }
    }, pollMs)
  }

  return { toasts, notify }
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/composables/useFollowupSync.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/composables/useFollowupSync.ts frontend/src/composables/useFollowupSync.test.ts
git commit -m "feat(frontend): 新增 useFollowupSync 同步 toast + 轮询组合式"
```

---

### Task 3: components/FollowupRecordForm.vue（表单 + 测试）

**Files:**
- Create: `frontend/src/components/FollowupRecordForm.vue`
- Test: `frontend/src/components/FollowupRecordForm.test.ts`

依赖：类型 `FollowupRecord`/`FollowupFormData` 来自 `@/lib/followupApi`。无需 Element Plus（原生表单）。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/FollowupRecordForm.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FollowupRecordForm from './FollowupRecordForm.vue'

function mountForm(props = {}) {
  return mount(FollowupRecordForm, {
    props: {
      projectId: 'P1',
      projectName: '甲项目',
      types: ['邮件推动', '电话沟通'],
      statuses: ['跟进中', '已解决'],
      ...props,
    },
  })
}

describe('FollowupRecordForm', () => {
  it('新增模式：只读三字段 + 默认标题', () => {
    const w = mountForm()
    expect(w.text()).toContain('添加跟进记录')
    expect(w.text()).toContain('保存后自动生成')
    const ro = w.findAll('input[readonly]')
    expect(ro).toHaveLength(3) // 记录编号/项目编号/项目名称
  })
  it('校验：缺跟进人/内容不 emit submit', async () => {
    const w = mountForm()
    await w.find('.frf-btn.primary').trigger('click')
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toContain('请填写跟进人')
  })
  it('填写后 emit submit 含表单数据', async () => {
    const w = mountForm()
    await w.find('input[data-f="person"]').setValue('张三')
    await w.find('textarea').setValue('电话催款')
    await w.find('.frf-btn.primary').trigger('click')
    const ev = w.emitted('submit')
    expect(ev).toBeTruthy()
    expect((ev![0][0] as any)['跟进人']).toBe('张三')
    expect((ev![0][0] as any)['项目编号']).toBe('P1')
  })
  it('编辑模式：标题含记录编号，预填字段，submit 带记录编号', async () => {
    const w = mountForm({ editRecord: { 记录编号: 'FU-9', 跟进人: '李四', 跟进内容: '已回款', 跟进类型: '电话沟通', 跟进状态: '已解决' } })
    expect(w.text()).toContain('编辑跟进记录 (FU-9)')
    await w.find('.frf-btn.primary').trigger('click')
    const ev = w.emitted('submit')
    expect((ev![0][0] as any)['记录编号']).toBe('FU-9')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/components/FollowupRecordForm.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/components/FollowupRecordForm.vue`:

```vue
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
    <div class="frf-row"><label>记录编号</label><input :value="recordIdLabel" readonly /></div>
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
.frf { background: #fafbfc; border: 1px solid #ebe7e2; border-radius: 8px; padding: 12px; margin-top: 8px; }
.frf-title { font-weight: 700; font-size: 13px; color: #1a1a2e; margin-bottom: 8px; }
.frf-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
.frf-row label { width: 84px; flex-shrink: 0; color: #475569; }
.frf-row input, .frf-row select, .frf-row textarea { flex: 1; padding: 4px 8px; border: 1px solid #e2e0dc; border-radius: 4px; font-size: 12px; box-sizing: border-box; }
.frf-row input[readonly] { background: #f5f5f4; color: #8c8c9e; cursor: default; }
.frf-hint { font-size: 11px; color: #8c8c9e; margin: 2px 0 6px 92px; }
.frf-error { color: #ef4444; font-size: 12px; margin: 4px 0; }
.frf-actions { display: flex; gap: 8px; justify-content: flex-end; }
.frf-btn { border: 1px solid #e2e8f0; background: #fff; border-radius: 6px; padding: 4px 14px; font-size: 12px; cursor: pointer; color: #475569; }
.frf-btn.primary { background: #6366f1; color: #fff; border-color: #6366f1; }
</style>
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/components/FollowupRecordForm.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/FollowupRecordForm.vue frontend/src/components/FollowupRecordForm.test.ts
git commit -m "feat(frontend): 新增 FollowupRecordForm 跟进记录表单（3只读+5可编辑+校验）"
```

---

### Task 4: components/FollowupRecords.vue（记录区 + 测试）

**Files:**
- Create: `frontend/src/components/FollowupRecords.vue`
- Test: `frontend/src/components/FollowupRecords.test.ts`

依赖：`@/lib/followupApi`(followupApi/FollowupRecord/FollowupFormData)、`@/composables/useFollowupSync`、`./FollowupRecordForm.vue`。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/FollowupRecords.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FollowupRecords from './FollowupRecords.vue'

vi.mock('@/lib/followupApi', () => ({
  followupApi: {
    types: vi.fn().mockResolvedValue({ 跟进类型: ['邮件推动', '电话沟通'], 跟进状态: ['跟进中', '已解决'] }),
    list: vi.fn().mockResolvedValue({
      records: [
        { 记录编号: 'FU-2', 跟进时间: '2026-06-02 10:00', 跟进人: '李', 跟进类型: '电话沟通', 跟进内容: '二次催款', 跟进状态: '跟进中' },
        { 记录编号: 'FU-1', 跟进时间: '2026-06-01 10:00', 跟进人: '张', 跟进类型: '邮件推动', 跟进内容: '首次催款', 跟进状态: '跟进中' },
      ],
      total: 2,
    }),
    add: vi.fn().mockResolvedValue({ 记录编号: 'FU-3', message: '跟进记录已保存（仅本地保存）' }),
    update: vi.fn().mockResolvedValue({ 记录编号: 'FU-1', message: '跟进记录已更新（仅本地保存）' }),
    remove: vi.fn().mockResolvedValue({ message: '已删除（仅本地）' }),
    syncStatus: vi.fn(),
  },
}))

import { followupApi } from '@/lib/followupApi'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

function mountRecords() {
  return mount(FollowupRecords, { props: { projectId: 'P1', projectName: '甲项目' } })
}

describe('FollowupRecords', () => {
  it('挂载加载类型与记录，最新条展示详情', async () => {
    const w = mountRecords()
    await flushPromises()
    expect(followupApi.list).toHaveBeenCalledWith('P1', 20)
    expect(w.text()).toContain('二次催款') // 最新（按时间降序）
    expect(w.text()).toContain('跟进记录')
  })
  it('点击添加显示表单', async () => {
    const w = mountRecords()
    await flushPromises()
    expect(w.findComponent({ name: 'FollowupRecordForm' }).exists()).toBe(false)
    await w.find('.fr-addbtn').trigger('click')
    expect(w.findComponent({ name: 'FollowupRecordForm' }).exists()).toBe(true)
  })
  it('表单提交调用 add 并重载', async () => {
    const w = mountRecords()
    await flushPromises()
    await w.find('.fr-addbtn').trigger('click')
    ;(w.vm as any).onSubmit({ 项目编号: 'P1', 项目名称: '甲项目', 跟进人: '王', 跟进类型: '邮件推动', 跟进内容: '催', 跟进状态: '跟进中' })
    await flushPromises()
    expect(followupApi.add).toHaveBeenCalled()
    expect(followupApi.list).toHaveBeenCalledTimes(2) // mount + reload
  })
  it('删除走 confirm + remove', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = mountRecords()
    await flushPromises()
    await (w.vm as any).onDelete({ 记录编号: 'FU-2' })
    await flushPromises()
    expect(followupApi.remove).toHaveBeenCalledWith('FU-2')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/components/FollowupRecords.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/components/FollowupRecords.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { followupApi, type FollowupRecord, type FollowupFormData } from '@/lib/followupApi'
import { useFollowupSync } from '@/composables/useFollowupSync'
import FollowupRecordForm from './FollowupRecordForm.vue'

const props = defineProps<{ projectId: string; projectName: string; defaultNextDate?: string }>()

const records = ref<FollowupRecord[]>([])
const types = ref<string[]>([])
const statuses = ref<string[]>([])
const showForm = ref(false)
const editRecord = ref<FollowupRecord | null>(null)
const expandedIdx = ref(-1)
const { toasts, notify } = useFollowupSync()

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
    notify(res.message, res.记录编号 || data.记录编号 || '')
    await loadRecords()
  } catch (e: any) {
    notify('保存失败: ' + (e?.message || ''), '')
  }
}
async function onDelete(r: FollowupRecord) {
  const id = r['记录编号'] || ''
  if (!id) return
  if (!window.confirm(`确定要删除此跟进记录吗？\n\n记录编号: ${id}\n删除后无法恢复。`)) return
  try {
    const res = await followupApi.remove(id)
    notify(res.message, id)
    await loadRecords()
  } catch (e: any) {
    notify('删除失败: ' + (e?.message || ''), '')
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

    <div class="fr-toasts">
      <div v-for="t in toasts" :key="t.id" class="fr-toast" :class="t.status">{{ t.text }}</div>
    </div>
  </div>
</template>

<style scoped>
.fr { margin-top: 10px; padding-top: 10px; border-top: 1px solid #ebe7e2; }
.fr-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.fr-title { font-weight: 700; font-size: 12px; color: #1a1a2e; }
.fr-addbtn { background: #6366f1; color: #fff; border: none; border-radius: 6px; padding: 3px 12px; font-size: 12px; cursor: pointer; }
.fr-record, .fr-expanded { background: #fff; border: 1px solid #ebe7e2; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
.fr-expanded { border-color: #6366f1; }
.fr-meta { display: flex; gap: 10px; font-size: 11px; color: #8c8c9e; margin-bottom: 4px; }
.fr-content { font-size: 13px; color: #1a1a2e; white-space: pre-wrap; }
.fr-footer { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 11px; }
.fr-status { color: #6366f1; }
.fr-next { color: #8c8c9e; }
.fr-link { margin-left: auto; border: none; background: none; cursor: pointer; font-size: 11px; }
.fr-link.edit { color: #6366f1; margin-left: auto; }
.fr-link.del { color: #ef4444; margin-left: 0; }
.fr-history { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 6px; }
.fr-hist-label { font-size: 10px; color: #8c8c9e; }
.fr-hist-btn { border: 1px solid #6366f1; color: #6366f1; background: #fff; border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.fr-hist-btn.active { background: #6366f1; color: #fff; }
.fr-toasts { position: fixed; bottom: 24px; right: 24px; z-index: 3000; display: flex; flex-direction: column; gap: 8px; }
.fr-toast { padding: 10px 16px; background: #fff; border: 1px solid #e2e0dc; border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); font-size: 13px; }
.fr-toast.success { color: #10b981; }
.fr-toast.failed { color: #ef4444; }
.fr-toast.local { color: #f59e0b; }
</style>
```

注：`onSubmit`/`onDelete`/`loadRecords`/`openAdd` 用 `defineExpose` 暴露以便测试直接调用。

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/components/FollowupRecords.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/FollowupRecords.vue frontend/src/components/FollowupRecords.test.ts
git commit -m "feat(frontend): 新增 FollowupRecords 记录区（列表+增删改+同步反馈）"
```

---

### Task 5: 嵌入 FuProjectRow + verify + PROGRESS

**Files:**
- Modify: `frontend/src/components/FuProjectRow.vue`
- Modify: `frontend/src/components/FuProjectRow.test.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改 FuProjectRow.vue —— 展开区嵌入 FollowupRecords**

import 增加：

```ts
import FollowupRecords from './FollowupRecords.vue'
```

把展开区：

```html
    <div v-if="open" class="fpr-nodes">
      <FuNodeTable :nodes="project.nodes as Record<string, any>[]" />
    </div>
```

改为（节点表后追加记录区，defaultNextDate 取首个节点的 nextActionDate）：

```html
    <div v-if="open" class="fpr-nodes">
      <FuNodeTable :nodes="project.nodes as Record<string, any>[]" />
      <FollowupRecords
        :project-id="project.projectId"
        :project-name="project.projectName"
        :default-next-date="(project.nodes[0] as Record<string, any>)?.nextActionDate || ''"
      />
    </div>
```

- [ ] **Step 2: 改 FuProjectRow.test.ts —— mock followupApi 避免展开时真实请求**

在文件顶部 import 之后加入对 followupApi 的 mock（FollowupRecords 展开时会调用），避免测试报错；并保留 B14 原有断言：

```ts
vi.mock('@/lib/followupApi', () => ({
  followupApi: {
    types: vi.fn().mockResolvedValue({ 跟进类型: [], 跟进状态: [] }),
    list: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    add: vi.fn(), update: vi.fn(), remove: vi.fn(), syncStatus: vi.fn(),
  },
}))
```

（需确保顶部已 `import { ... vi } from 'vitest'`；B14 该测试已 import vi 用于 beforeEach？若未 import vi 则补上。其余断言不动。展开后断言 `FuNodeTable` 存在的用例仍成立，新增的 FollowupRecords 异步加载不影响该断言。）

- [ ] **Step 3: 跑相关测试** — `cd frontend && npx vitest run src/components/FuProjectRow.test.ts`（全绿）

- [ ] **Step 4: 全量验证** — `bash verify.sh`，期望 `[PASS] verify.sh 全部通过 ✓`（~1MB chunk 警告属已知 B-opt，非失败）。

- [ ] **Step 5: 更新 PROGRESS.md**
  - "最近更新"改当日，注明 B15 临期跟进 跟进记录 CRUD + 云回写 + 轮询 完成。
  - Backlog：B15 行改 `[x] **B15** 临期跟进：跟进记录 CRUD + 云回写 + 轮询：followupApi、useFollowupSync、FollowupRecordForm、FollowupRecords，嵌入 FuProjectRow。临期跟进页全功能完成。`；其余顺延 `[ ] **B16** 数据管理(data)`、`[ ] **B17** 区间对比(compare) + 关于(about)`。
  - Handoff 追加 B15 完成段（提交 SHA；后端 API 契约；忠实性：表单 3 只读+5 可编辑(邮件推动)、校验、列表降序+历史展开、提交 add/update、删除 confirm、同步 toast 轮询语义；范围：cloudUrl 由 B16 提供本期不传后端回退 sync_url；展示从简：toast 组件化、原生表单、内联校验；time/poll 注入）。下一步指向 B16。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/FuProjectRow.vue frontend/src/components/FuProjectRow.test.ts PROGRESS.md
git commit -m "feat(frontend): FuProjectRow 展开区嵌入 FollowupRecords，临期跟进全功能；更新 PROGRESS(B15)"
```

---

## Self-Review

- **Spec 覆盖：** 后端调用 types/list/add/update/delete/syncStatus(`followupApi`)✓；同步 toast + 轮询(`useFollowupSync`)✓；表单 3 只读+5 可编辑+校验(`FollowupRecordForm`)✓；记录列表(最新详情+历史展开)+增删改+反馈(`FollowupRecords`)✓；嵌入 FuProjectRow 展开区✓。
- **占位符扫描：** 各 step 含完整代码/命令/预期或精确改法；无 TODO/TBD。
- **类型一致性：** `FollowupRecord`/`FollowupFormData`(followupApi) 贯穿 form/records；`SyncToast`(useFollowupSync) 在 records 渲染；`followupApi.add/update/remove/list/types/syncStatus` 签名在 records/useFollowupSync 调用一致；复用 `@/api/client` 的 api.get/post。
- **忠实性/范围取舍：** 表单字段(3 只读，无 amountTier，邮件推动)、校验、列表降序+历史展开、提交分流 add/update、删除 confirm、toast 轮询语义(success 5s/failed 8s/超时 8s/本地 4s)、cloudUrl 延后 B16(后端回退 sync_url)、toast 组件化/原生表单/内联校验/time-poll 注入——均已在头部"关键忠实性/展示从简"列明。
