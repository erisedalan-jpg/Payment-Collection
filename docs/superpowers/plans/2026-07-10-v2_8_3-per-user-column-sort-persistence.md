# V2.8.3 选列与排序按登录用户持久化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全站表格的选列与排序结果按登录用户持久化到 localStorage，刷新/重开保留、不回默认，并修掉同浏览器多用户互相覆盖选列的缺陷。

**Architecture:** 存储 key 加账号前缀（选列 `colprefs:{account}:{TABLE_ID}`、排序 `colsort:{account}:{TABLE_ID}`）。新增 `userScopedKey`(读账号拼前缀，视图层调)、`sortPrefs`(排序存取纯函数)、`usePersistentSort`(内部排序表用)。`useExternalSort` 加可选 `viewKey` 持久化。`DataTable` 补 `default-sort` 透传。选列 11 表、排序 13 表（外部 4 + 内部 9）接线。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + Vitest（jsdom）。无新增第三方依赖。

## Global Constraints（每个任务都隐含）

- 交流语言简体中文；**不使用任何 emoji**（符号仅 `→ ↓ ❌ ✕ ▾ ⚠`）。
- 只引设计令牌、不手写散值、不引框架/第三方 npm 依赖；前端禁外链字体。
- localStorage 读写一律 `try/catch` 降级（与 `useColumnPrefs`/`settings`/`ui` 同构）。
- 版本单一来源 `frontend/src/version.ts` → `V2.8.3` / `RELEASE_DATE='2026-07-10'`。
- 后端/审计/schema/数据管线**零改动**；升级仅换 dist、无需重启后端、无需点更新数据。
- typecheck 命令：`cd frontend && npm run typecheck`（= `vue-tsc --noEmit`）。
- TDD：先补/改测试再改实现。收尾 `bash verify.sh` 全绿。
- commit 结尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `frontend/src/lib/userScopedKey.ts` | `userScopedKey(base)` 读账号拼前缀 | 新建 |
| `frontend/src/lib/sortPrefs.ts` | 排序状态类型 + localStorage 存取纯函数 | 新建 |
| `frontend/src/lib/usePersistentSort.ts` | 内部排序表：恢复初值 + 变更落库 | 新建 |
| `frontend/src/lib/useExternalSort.ts` | 加可选 `viewKey` 持久化 + 暴露 `defaultSort` | 改 |
| `frontend/src/components/DataTable.vue` | 加可选 `defaultSort` prop 透传 el-table | 改 |
| 11 视图（选列） | 把选列 hook 第一参包 `userScopedKey` | 改 |
| 4 视图（外部排序） | `useExternalSort` 加第三参 + 绑 `:default-sort` | 改 |
| 9 视图（内部排序） | `usePersistentSort` + 绑 `:default-sort`/`@sort-change` | 改 |
| `frontend/src/version.ts` / `PROGRESS.md` | 版本 + 记录 | 改 |

**权威表格清单**（本计划范围来源，行号为当前 master 值）：

- **选列 11 表**：OpportunitiesView `opportunities`(useColumnPrefs L37)、ProjectsView `projects-active`(L74)、ClosedProjectsView `projects-closed`(L55)、KeyProjectsView `key-projects`(L75)、TempFollowupView `temp-followup`(L98)、PaymentKeyFollowupView `payment-key`(L90)、OpportunityFollowupView `opportunity-followup`(L62)、RiskFollowupView `risk-followup`(**useColumnPrefsDynamic** L90)、PayProjectsView `pay-projects`(L75)、CostDetailView `cost-l4-summary`(L102)、MilestoneReminderTab `milestone-reminder`(L61)。
- **外部排序 4 表**：OpportunitiesView `opportunities`(useExternalSort L75，**裸 el-table**)、CostDetailView `cost-detail`(L163，DataTable L216 有 external-sort)、PayProjectsView `pay-projects`(L92，DataTable L120)、PayNodesView `pay-nodes`(L74，DataTable L103)。
- **内部排序 9 表**：ProjectsView `projects-active`、ClosedProjectsView `projects-closed`、KeyProjectsView `key-projects`、TempFollowupView `temp-followup`、PaymentKeyFollowupView `payment-key`、OpportunityFollowupView `opportunity-followup`、RiskFollowupView `risk-followup`、CostDetailView `cost-l4-summary`(DataTable L202)、MilestoneReminderTab `milestone-reminder`(DataTable L110)。

---

### Task 1: `userScopedKey.ts` 账号前缀助手

**Files:** Create `frontend/src/lib/userScopedKey.ts`, Test `frontend/src/lib/userScopedKey.test.ts`

**Interfaces:** Produces `userScopedKey(base: string): string` → `` `${account}:${base}` ``，account 取 `useAuthStore().user?.account || 'anon'`，须在 setup(pinia active) 内调用。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { userScopedKey } from './userScopedKey'

describe('userScopedKey', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('有账号 → 账号:base', () => {
    useAuthStore().user = { account: 'alice', displayName: 'A', isSuper: false, allowedPages: [], allowedL4: [] } as never
    expect(userScopedKey('key-projects')).toBe('alice:key-projects')
  })
  it('未登录(user 为 null) → anon:base', () => {
    useAuthStore().user = null
    expect(userScopedKey('t')).toBe('anon:t')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/userScopedKey.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `frontend/src/lib/userScopedKey.ts`

```ts
import { useAuthStore } from '@/stores/auth'

/** 把持久化 base key(如 TABLE_ID)按当前登录账号加前缀,实现按用户隔离。
 *  须在组件 setup(pinia active)内调用;user 为空(极端兜底)用 'anon'。 */
export function userScopedKey(base: string): string {
  const account = useAuthStore().user?.account || 'anon'
  return `${account}:${base}`
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/userScopedKey.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/userScopedKey.ts frontend/src/lib/userScopedKey.test.ts
git commit -m "feat(prefs): userScopedKey 账号前缀助手"
```

---

### Task 2: `sortPrefs.ts` 排序存取纯函数

**Files:** Create `frontend/src/lib/sortPrefs.ts`, Test `frontend/src/lib/sortPrefs.test.ts`

**Interfaces:** Produces `SortState`(接口)、`loadSort(viewKey)`、`saveSort(viewKey, s)`、`fromElOrder(order)`、`elDefaultSort(s)`。`SortState` 成为排序状态单一类型（`useExternalSort` 后续从此 import）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadSort, saveSort, fromElOrder, elDefaultSort } from './sortPrefs'

describe('sortPrefs', () => {
  beforeEach(() => localStorage.clear())
  it('load 空/坏 JSON/非法 order → 默认空', () => {
    expect(loadSort('x')).toEqual({ prop: '', order: '' })
    localStorage.setItem('colsort:x', '{bad')
    expect(loadSort('x')).toEqual({ prop: '', order: '' })
    localStorage.setItem('colsort:x', JSON.stringify({ prop: 'a', order: 'nope' }))
    expect(loadSort('x')).toEqual({ prop: '', order: '' })
  })
  it('save→load 往返 + 落 colsort: 前缀', () => {
    saveSort('t', { prop: 'amount', order: 'desc' })
    expect(loadSort('t')).toEqual({ prop: 'amount', order: 'desc' })
    expect(JSON.parse(localStorage.getItem('colsort:t')!)).toEqual({ prop: 'amount', order: 'desc' })
  })
  it('fromElOrder 三态', () => {
    expect(fromElOrder('ascending')).toBe('asc')
    expect(fromElOrder('descending')).toBe('desc')
    expect(fromElOrder(null)).toBe('')
  })
  it('elDefaultSort 空→undefined,有值→el 格式', () => {
    expect(elDefaultSort({ prop: '', order: '' })).toBeUndefined()
    expect(elDefaultSort({ prop: 'a', order: '' })).toBeUndefined()
    expect(elDefaultSort({ prop: 'a', order: 'asc' })).toEqual({ prop: 'a', order: 'ascending' })
    expect(elDefaultSort({ prop: 'a', order: 'desc' })).toEqual({ prop: 'a', order: 'descending' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/sortPrefs.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `frontend/src/lib/sortPrefs.ts`

```ts
/** 表头排序状态:prop 为空列 key、order 为空/asc/desc。全站排序状态单一类型。 */
export interface SortState {
  prop: string
  order: '' | 'asc' | 'desc'
}

const PREFIX = 'colsort:'

/** 读 localStorage['colsort:'+viewKey];坏/空/非法 → {prop:'',order:''}。 */
export function loadSort(viewKey: string): SortState {
  try {
    const raw = localStorage.getItem(PREFIX + viewKey)
    if (raw) {
      const o = JSON.parse(raw)
      if (o && typeof o.prop === 'string' && (o.order === 'asc' || o.order === 'desc' || o.order === '')) {
        return { prop: o.prop, order: o.order }
      }
    }
  } catch {
    /* localStorage 不可用/损坏 → 默认 */
  }
  return { prop: '', order: '' }
}

export function saveSort(viewKey: string, s: SortState): void {
  try {
    localStorage.setItem(PREFIX + viewKey, JSON.stringify({ prop: s.prop, order: s.order }))
  } catch {
    /* 忽略写入失败(隐私模式/配额) */
  }
}

/** el-table 'ascending'/'descending' → 'asc'/'desc',其余 → ''。 */
export function fromElOrder(order: string | null): '' | 'asc' | 'desc' {
  return order === 'ascending' ? 'asc' : order === 'descending' ? 'desc' : ''
}

/** 映射为 el-table `:default-sort` 需要的格式;空排序 → undefined(不传)。 */
export function elDefaultSort(s: SortState): { prop: string; order: 'ascending' | 'descending' } | undefined {
  if (!s.prop || !s.order) return undefined
  return { prop: s.prop, order: s.order === 'asc' ? 'ascending' : 'descending' }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/sortPrefs.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/sortPrefs.ts frontend/src/lib/sortPrefs.test.ts
git commit -m "feat(prefs): sortPrefs 排序状态 localStorage 存取纯函数"
```

---

### Task 3: `useExternalSort` 加可选 viewKey 持久化

**Files:** Modify `frontend/src/lib/useExternalSort.ts`, Test `frontend/src/lib/useExternalSort.test.ts`

**Interfaces:**
- Consumes: `SortState`/`loadSort`/`saveSort`/`elDefaultSort`（Task 2）。
- Produces: `useExternalSort(rows, numericKeys, viewKey?)`：传 `viewKey` 则初值从存储恢复、`sortState` 变化落库、额外返回 `defaultSort`(ComputedRef，el-table 格式)；不传则行为完全不变（现有 8 用例零改）。`SortState` 从此改 re-export 自 `sortPrefs`。

- [ ] **Step 1: 改测试——保留现有 8 用例，追加持久化用例**

在 `frontend/src/lib/useExternalSort.test.ts` 顶部 import 改为：
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useExternalSort } from './useExternalSort'
import { loadSort } from './sortPrefs'
```
在 `describe('useExternalSort', () => {` 紧下一行加：
```ts
  beforeEach(() => localStorage.clear())
```
（现有 8 个 `it` 全部**保持不动**——它们只传 2 参、不碰 localStorage。）在 describe 末尾（最后一个 `it` 之后、`})` 之前）追加：
```ts
  it('传 viewKey:从 localStorage 恢复初值并生效', () => {
    localStorage.setItem('colsort:v1', JSON.stringify({ prop: 'amount', order: 'desc' }))
    const rows = ref([{ id: 'a', amount: 3 }, { id: 'b', amount: 1 }, { id: 'c', amount: 20 }])
    const { sortState, sorted } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS, 'v1')
    expect(sortState.value).toEqual({ prop: 'amount', order: 'desc' })
    expect(sorted.value.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })
  it('传 viewKey:onSortChange 后落库', async () => {
    const rows = ref([{ id: 'a', amount: 1 }])
    const { onSortChange } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS, 'v2')
    onSortChange({ prop: 'amount', order: 'ascending' })
    await nextTick()
    expect(JSON.parse(localStorage.getItem('colsort:v2')!)).toEqual({ prop: 'amount', order: 'asc' })
  })
  it('传 viewKey:sortState 置空后清空存储(视图 reset 路径)', async () => {
    const rows = ref([{ id: 'a', amount: 1 }])
    const { sortState } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS, 'v3')
    sortState.value = { prop: 'amount', order: 'asc' }
    await nextTick()
    expect(loadSort('v3')).toEqual({ prop: 'amount', order: 'asc' })
    sortState.value = { prop: '', order: '' }
    await nextTick()
    expect(loadSort('v3')).toEqual({ prop: '', order: '' })
  })
  it('defaultSort 反映当前 sortState;不传 viewKey 也可用', () => {
    const rows = ref([{ id: 'a', amount: 1 }])
    const { onSortChange, defaultSort } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS, 'v4')
    expect(defaultSort.value).toBeUndefined()
    onSortChange({ prop: 'amount', order: 'ascending' })
    expect(defaultSort.value).toEqual({ prop: 'amount', order: 'ascending' })
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/useExternalSort.test.ts`
Expected: FAIL（`defaultSort`/第三参持久化未实现；新用例红，旧 8 仍绿）

- [ ] **Step 3: 改实现** 整体替换 `frontend/src/lib/useExternalSort.ts` 为：

```ts
import { ref, computed, watch, type ComputedRef } from 'vue'
import { type SortState, loadSort, saveSort, elDefaultSort } from './sortPrefs'

export type { SortState }

/**
 * 外部排序(custom,跨页排全集):数值键(numericKeys)按数值比较,其余按中文 localeCompare。
 * 无排序(prop/order 任一为空)时原样返回 rows。与 el-table `@sort-change` 配套使用,
 * `onSortChange` 把 'ascending'/'descending' 映射为 'asc'/'desc'。
 * 传 viewKey 时:初值从 localStorage 恢复、sortState 任何变化落库、暴露 defaultSort 供 el-table `:default-sort`。
 */
export function useExternalSort<T extends Record<string, any>>(
  rows: ComputedRef<T[]>,
  numericKeys: Set<string>,
  viewKey?: string,
) {
  const sortState = ref<SortState>(viewKey ? loadSort(viewKey) : { prop: '', order: '' })

  if (viewKey) watch(sortState, (s) => saveSort(viewKey, s))

  const defaultSort = computed(() => elDefaultSort(sortState.value))

  function onSortChange({ prop, order }: { prop: string | null; order: string | null }) {
    sortState.value = {
      prop: prop || '',
      order: order === 'ascending' ? 'asc' : order === 'descending' ? 'desc' : '',
    }
  }

  const sorted = computed(() => {
    const { prop, order } = sortState.value
    if (!prop || !order) return rows.value
    const dir = order === 'asc' ? 1 : -1
    const isNum = numericKeys.has(prop)
    return [...rows.value].sort((a, b) => {
      const x = a[prop]
      const y = b[prop]
      if (isNum) return ((Number(x) || 0) - (Number(y) || 0)) * dir
      return String(x ?? '').localeCompare(String(y ?? ''), 'zh') * dir
    })
  })

  return { sortState, onSortChange, sorted, defaultSort }
}
```

- [ ] **Step 4: 跑测试 + 类型检查确认通过**

Run: `cd frontend && npx vitest run src/lib/useExternalSort.test.ts && npm run typecheck`
Expected: PASS（12 用例）+ 无类型错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/useExternalSort.ts frontend/src/lib/useExternalSort.test.ts
git commit -m "feat(prefs): useExternalSort 可选 viewKey 持久化 + defaultSort"
```

---

### Task 4: `usePersistentSort` 内部排序表持久化

**Files:** Create `frontend/src/lib/usePersistentSort.ts`, Test `frontend/src/lib/usePersistentSort.test.ts`

**Interfaces:**
- Consumes: `loadSort`/`saveSort`/`fromElOrder`/`elDefaultSort`（Task 2）。
- Produces: `usePersistentSort(viewKey)` → `{ sortState, defaultSort, onSortChange }`；**不做排序计算**（el-table 内部排 `:rows`），只恢复初值 + 变更落库。供内部排序视图把 `defaultSort`/`onSortChange` 绑到 DataTable。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { usePersistentSort } from './usePersistentSort'

describe('usePersistentSort', () => {
  beforeEach(() => localStorage.clear())
  it('从存储恢复初值 + defaultSort(el 格式)', () => {
    localStorage.setItem('colsort:t', JSON.stringify({ prop: 'contract', order: 'desc' }))
    const { sortState, defaultSort } = usePersistentSort('t')
    expect(sortState.value).toEqual({ prop: 'contract', order: 'desc' })
    expect(defaultSort.value).toEqual({ prop: 'contract', order: 'descending' })
  })
  it('onSortChange 落库并更新 defaultSort', () => {
    const { onSortChange, defaultSort } = usePersistentSort('t2')
    onSortChange({ prop: 'planDate', order: 'ascending' })
    expect(JSON.parse(localStorage.getItem('colsort:t2')!)).toEqual({ prop: 'planDate', order: 'asc' })
    expect(defaultSort.value).toEqual({ prop: 'planDate', order: 'ascending' })
  })
  it('清空排序(order null)落空 + defaultSort undefined', () => {
    const { onSortChange, defaultSort } = usePersistentSort('t3')
    onSortChange({ prop: 'x', order: 'ascending' })
    onSortChange({ prop: null, order: null })
    expect(defaultSort.value).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('colsort:t3')!)).toEqual({ prop: '', order: '' })
  })
  it('空存储 → defaultSort undefined', () => {
    expect(usePersistentSort('t4').defaultSort.value).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/usePersistentSort.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `frontend/src/lib/usePersistentSort.ts`

```ts
import { ref, computed } from 'vue'
import { loadSort, saveSort, fromElOrder, elDefaultSort } from './sortPrefs'

/** 内部排序(el-table 内置排 :rows)表的排序持久化:恢复初值 + 变更落库,不做排序计算。
 *  视图把 defaultSort 绑到 DataTable :default-sort、onSortChange 绑到 @sort-change。 */
export function usePersistentSort(viewKey: string) {
  const sortState = ref(loadSort(viewKey))
  const defaultSort = computed(() => elDefaultSort(sortState.value))
  function onSortChange({ prop, order }: { prop: string | null; order: string | null }) {
    sortState.value = { prop: prop || '', order: fromElOrder(order) }
    saveSort(viewKey, sortState.value)
  }
  return { sortState, defaultSort, onSortChange }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/usePersistentSort.test.ts && npm run typecheck`
Expected: PASS + 无类型错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/usePersistentSort.ts frontend/src/lib/usePersistentSort.test.ts
git commit -m "feat(prefs): usePersistentSort 内部排序表持久化"
```

---

### Task 5: `DataTable` 加 `default-sort` 透传

**Files:** Modify `frontend/src/components/DataTable.vue`, Test `frontend/src/components/DataTable.defaultsort.test.ts`（新建，避免与既有测试耦合）

**Interfaces:** Produces DataTable 新增可选 prop `defaultSort?: { prop: string; order: 'ascending'|'descending' } | null`，透传给内部 `<el-table :default-sort>`。`@sort-change` 已 emit（现成）。

- [ ] **Step 1: 写失败测试** `frontend/src/components/DataTable.defaultsort.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus, { ElTable } from 'element-plus'
import DataTable from './DataTable.vue'

const COLS = [{ key: 'a', label: 'A', sortable: true }]
const ROWS = [{ a: 1 }, { a: 2 }]

describe('DataTable default-sort 透传', () => {
  it('传 defaultSort → el-table 收到该 prop', () => {
    const w = mount(DataTable, {
      props: { columns: COLS, rows: ROWS, defaultSort: { prop: 'a', order: 'descending' } },
      global: { plugins: [ElementPlus] },
    })
    expect(w.findComponent(ElTable).props('defaultSort')).toEqual({ prop: 'a', order: 'descending' })
  })
  it('不传 defaultSort → el-table 收到 undefined(不破坏渲染)', () => {
    const w = mount(DataTable, {
      props: { columns: COLS, rows: ROWS },
      global: { plugins: [ElementPlus] },
    })
    expect(w.findComponent(ElTable).props('defaultSort')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/DataTable.defaultsort.test.ts`
Expected: FAIL（default-sort 未透传，第一个用例拿到 undefined）

- [ ] **Step 3: 改实现** `frontend/src/components/DataTable.vue`

在 `defineProps<{...}>()` 的类型字面量里，`summaryMethod?: ...` 那一项**之后**加一行：
```ts
    /** 初始排序(透传 el-table :default-sort);用于持久化恢复表头排序箭头。 */
    defaultSort?: { prop: string; order: 'ascending' | 'descending' } | null
```
在模板 `<el-table` 起始标签内（现有 `:summary-method="props.summaryMethod"` 一行之后）加：
```html
      :default-sort="props.defaultSort ?? undefined"
```

- [ ] **Step 4: 跑测试 + 类型检查确认通过**

Run: `cd frontend && npx vitest run src/components/DataTable.defaultsort.test.ts && npm run typecheck`
Expected: PASS + 无类型错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DataTable.vue frontend/src/components/DataTable.defaultsort.test.ts
git commit -m "feat(prefs): DataTable 加 default-sort 透传"
```

---

### Task 6: 选列 11 表接入 userScopedKey

**Files:** Modify 11 视图（见下表）

**Interfaces:** Consumes `userScopedKey`（Task 1）。

**统一改法（对每个视图）：**
1. 在 import 区加一行：`import { userScopedKey } from '@/lib/userScopedKey'`（若该视图已 import 其它 `@/lib/*`，紧邻着加）。
2. 把该视图对 `useColumnPrefs(X, …)` 或 `useColumnPrefsDynamic(X, …)` 的调用，**第一参 `X`（表 ID 字符串常量）包成 `userScopedKey(X)`**，其余参数一字不改。`X` 就是该视图现有的常量名（多为 `TABLE_ID`，CostDetailView 为 `L4_TABLE_ID`）。

| 视图文件 | 调用行 | 第一参常量 | hook |
|---|---|---|---|
| `views/OpportunitiesView.vue` | L37 | `TABLE_ID` | useColumnPrefs |
| `views/ProjectsView.vue` | L74 | `TABLE_ID` | useColumnPrefs |
| `views/ClosedProjectsView.vue` | L55 | `TABLE_ID` | useColumnPrefs |
| `views/KeyProjectsView.vue` | L75 | `TABLE_ID` | useColumnPrefs |
| `views/TempFollowupView.vue` | L98 | `TABLE_ID` | useColumnPrefs |
| `views/PaymentKeyFollowupView.vue` | L90 | `TABLE_ID` | useColumnPrefs |
| `views/OpportunityFollowupView.vue` | L62 | `TABLE_ID` | useColumnPrefs |
| `views/RiskFollowupView.vue` | L90 | `TABLE_ID` | **useColumnPrefsDynamic** |
| `views/PayProjectsView.vue` | L75 | `TABLE_ID` | useColumnPrefs |
| `views/CostDetailView.vue` | L102 | `L4_TABLE_ID` | useColumnPrefs |
| `components/MilestoneReminderTab.vue` | L61 | `TABLE_ID` | useColumnPrefs |

例（KeyProjectsView）：`const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)` → `const prefs = useColumnPrefs(userScopedKey(TABLE_ID), ALL_KEYS, DEFAULT_VISIBLE)`。
例（RiskFollowupView）：`useColumnPrefsDynamic(TABLE_ID, allKeys, DEFAULT_VISIBLE)` → `useColumnPrefsDynamic(userScopedKey(TABLE_ID), allKeys, DEFAULT_VISIBLE)`。

行号为定位提示，以「`useColumnPrefs(` / `useColumnPrefsDynamic(` 后紧跟表 ID 常量」为锚点匹配。

- [ ] **Step 1: 逐个视图应用上述两步改动**（读文件、按锚点改；勿动其它逻辑）。

- [ ] **Step 2: 覆盖率自检（防漏改）**

Run: `cd frontend && git grep -nE "useColumnPrefs(Dynamic)?\(userScopedKey\(" -- src | wc -l`
Expected: `11`
Run: `cd frontend && git grep -nE "useColumnPrefs(Dynamic)?\(TABLE_ID|useColumnPrefs\(L4_TABLE_ID" -- src`
Expected: 无输出（无未包裹的残留）

- [ ] **Step 3: 类型检查 + 全量前端测试**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: 无类型错误；vitest 全绿（选列 hook 单测不受影响——key 由调用方拼接）。

- [ ] **Step 4: 提交**

```bash
git add -A frontend/src/views frontend/src/components/MilestoneReminderTab.vue
git commit -m "feat(prefs): 选列 11 表按登录用户持久化(userScopedKey)"
```

---

### Task 7: 外部排序 4 表接入 viewKey + default-sort

**Files:** Modify `views/OpportunitiesView.vue`、`views/CostDetailView.vue`、`views/PayProjectsView.vue`、`views/PayNodesView.vue`

**Interfaces:** Consumes `useExternalSort(rows, numericKeys, viewKey)` 的 `defaultSort`（Task 3）、`userScopedKey`（Task 1）。这些视图 Task 6 可能已加 `userScopedKey` import；已存在就不重复 import。

**OpportunitiesView.vue（裸 el-table）：**
- L75：`const { sortState, onSortChange, sorted } = useExternalSort(filtered, NUMERIC_KEYS)` → `const { sortState, onSortChange, sorted, defaultSort } = useExternalSort(filtered, NUMERIC_KEYS, userScopedKey(TABLE_ID))`
- 模板 L227-233 的 `<el-table :data="paged" border style="width: 100%" @selection-change="onSel" @sort-change="onSortChange">` → 在 `@sort-change="onSortChange"` 同标签内加一行属性 `:default-sort="defaultSort"`。
- 确保顶部已 `import { userScopedKey } from '@/lib/userScopedKey'`（Task 6 已为选列加过；若无则加）。

**CostDetailView.vue（cost-detail 主表，DataTable）：**
- L163：`const { sortState, onSortChange, sorted } = useExternalSort(filtered, NUMERIC_KEYS)` → `const { sortState, onSortChange, sorted, defaultSort } = useExternalSort(filtered, NUMERIC_KEYS, userScopedKey(TABLE_ID))`
- 模板明细表 L216-217：`<DataTable :columns="DETAIL_COLS" :rows="pagedSeq" :show-count="false" clickable external-sort @row-click="onRow" @sort-change="onSortChange">` → 加属性 `:default-sort="defaultSort"`。
- 顶部若无 userScopedKey import 则加（Task 6 已为 L4 选列加过）。
- （其 `reset()` L168 里 `sortState.value = { prop:'', order:'' }` 无需改：Task 3 的 watch 会把它落库为空。）

**PayProjectsView.vue（DataTable）：**
- L92：`useExternalSort(filtered, NUMERIC_KEYS)` → `useExternalSort(filtered, NUMERIC_KEYS, userScopedKey(TABLE_ID))`，解构补 `defaultSort`。
- 模板 DataTable L120（有 `external-sort @sort-change="onSortChange"`）加 `:default-sort="defaultSort"`。
- 顶部若无 userScopedKey import 则加（Task 6 已为选列加过）。

**PayNodesView.vue（DataTable，无选列）：**
- L74：`useExternalSort(filtered, NUMERIC_KEYS)` → `useExternalSort(filtered, NUMERIC_KEYS, userScopedKey(TABLE_ID))`，解构补 `defaultSort`。
- 模板 DataTable L103（有 `external-sort @sort-change="onSortChange"`）加 `:default-sort="defaultSort"`。
- **顶部需新加** `import { userScopedKey } from '@/lib/userScopedKey'`（PayNodes 无选列、Task 6 没碰它）。

- [ ] **Step 1: 应用上述 4 视图改动**（读文件按锚点改；解构补 `defaultSort`、模板加 `:default-sort`、确保 import 存在）。

- [ ] **Step 2: 覆盖率自检**

Run: `cd frontend && git grep -nE "useExternalSort\([^)]*userScopedKey" -- src | wc -l`
Expected: `4`
Run: `cd frontend && git grep -n ":default-sort=\"defaultSort\"" -- src/views | wc -l`
Expected: `4`

- [ ] **Step 3: 类型检查 + 相关视图测试**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/OpportunitiesView.test.ts`
Expected: 无类型错误；OpportunitiesView 现有用例仍绿（sortState 行为不变）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/OpportunitiesView.vue frontend/src/views/CostDetailView.vue frontend/src/views/PayProjectsView.vue frontend/src/views/PayNodesView.vue
git commit -m "feat(prefs): 外部排序 4 表按登录用户持久化 + 恢复表头排序"
```

---

### Task 8: 内部排序 9 表接入 usePersistentSort + default-sort

**Files:** Modify 9 视图（见下表）

**Interfaces:** Consumes `usePersistentSort(viewKey)`（Task 4）、`userScopedKey`（Task 1）、`DataTable :default-sort`（Task 5）。

**统一改法（对每个视图）：**
1. import 区加：`import { usePersistentSort } from '@/lib/usePersistentSort'`（`userScopedKey` 多数视图 Task 6 已 import；无则一并加）。
2. 在 `<script setup>` 内（选列 prefs 附近）加一行：
   ```ts
   const psort = usePersistentSort(userScopedKey(TABLE_ID))
   ```
   （CostDetailView 用 `L4_TABLE_ID` 且变量名用 `l4Sort`，见下方专条。）
3. 该视图**内部排序表**的 `<DataTable ...>` 起始标签加两个属性：
   ```html
   :default-sort="psort.defaultSort" @sort-change="psort.onSortChange"
   ```

| 视图文件 | 表 ID 常量 | DataTable 定位（当前行） | 变量名 |
|---|---|---|---|
| `views/ProjectsView.vue` | `TABLE_ID`(`projects-active`) | L168 | `psort` |
| `views/ClosedProjectsView.vue` | `TABLE_ID`(`projects-closed`) | L83 | `psort` |
| `views/KeyProjectsView.vue` | `TABLE_ID`(`key-projects`) | 主 DataTable(`:rows="fp.paged.value"`) | `psort` |
| `views/TempFollowupView.vue` | `TABLE_ID`(`temp-followup`) | 主 DataTable(`:rows="fp.paged.value"`) | `psort` |
| `views/PaymentKeyFollowupView.vue` | `TABLE_ID`(`payment-key`) | 主 DataTable(`:rows="fp.paged.value"`) | `psort` |
| `views/OpportunityFollowupView.vue` | `TABLE_ID`(`opportunity-followup`) | 主 DataTable(`:rows="fp.paged.value"`) | `psort` |
| `views/RiskFollowupView.vue` | `TABLE_ID`(`risk-followup`) | 主 DataTable(`:rows="fp.paged.value"`) | `psort` |
| `components/MilestoneReminderTab.vue` | `TABLE_ID`(`milestone-reminder`) | L110 | `psort` |
| `views/CostDetailView.vue` | `L4_TABLE_ID`(`cost-l4-summary`) | **L4 汇总表** L202 | `l4Sort`（见下） |

**CostDetailView 专条（避免与 cost-detail 外部排序命名冲突）：**
- 在 L4 选列 `l4Prefs` 附近加：`const l4Sort = usePersistentSort(userScopedKey(L4_TABLE_ID))`
- L4 汇总表 L202 `<DataTable :columns="l4VisibleColumns" :rows="l4Rows" :show-count="false">` → 加 `:default-sort="l4Sort.defaultSort" @sort-change="l4Sort.onSortChange"`。
- **不要**碰 L216 的 cost-detail 明细表（那是 Task 7 的外部排序，已单独接线）。

行号为定位提示。KeyProjects/Temp/PaymentKey/OppFollowup/Risk 的主 DataTable 以 `:rows="fp.paged.value"` 为锚点（它们只有这一张 DataTable）。

- [ ] **Step 1: 逐个视图应用上述改动**（读文件按锚点改；只加 composable 调用 + 两个模板属性 + import，勿动其它逻辑）。

- [ ] **Step 2: 覆盖率自检（防漏改）**

Run: `cd frontend && git grep -nE "usePersistentSort\(userScopedKey\(" -- src | wc -l`
Expected: `9`
Run: `cd frontend && git grep -n "@sort-change=\"psort.onSortChange\"\|@sort-change=\"l4Sort.onSortChange\"" -- src | wc -l`
Expected: `9`

- [ ] **Step 3: 类型检查 + 相关视图测试**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/KeyProjectsView.test.ts src/views/RiskFollowupView.test.ts src/views/PaymentKeyFollowupView.test.ts src/views/TempFollowupView.test.ts src/views/OpportunityFollowupView.test.ts`
Expected: 无类型错误；相关视图现有用例仍绿。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views frontend/src/components/MilestoneReminderTab.vue
git commit -m "feat(prefs): 内部排序 9 表按登录用户持久化(usePersistentSort)"
```

---

### Task 9: 版本 bump V2.8.3 + verify + PROGRESS（控制者直接做）

**Files:** Modify `frontend/src/version.ts`, `PROGRESS.md`

- [ ] **Step 1: 版本 bump** `frontend/src/version.ts`

```ts
export const APP_VERSION = 'V2.8.3'
export const RELEASE_DATE = '2026-07-10'
```

- [ ] **Step 2: 全量前端 + 后端验证**

Run: `cd frontend && npm run test:run && npm run typecheck && npm run build`
Expected: 全绿。
Run: `python -m pytest -q`
Expected: PASS（后端零改动，安全网）。

- [ ] **Step 3: 更新 `PROGRESS.md`**

在版本历史顶部加入 V2.8.3 条目（Z 级，纯前端）：概述「选列 11 表 + 排序 13 表按登录用户 localStorage 持久化；新增 userScopedKey/sortPrefs/usePersistentSort，useExternalSort 加可选 viewKey，DataTable 加 default-sort；不含列筛选；修同浏览器多用户串味；升级仅换 dist、无需重启后端/无需点更新数据、老用户首次见默认列一次」。把上一条 V2.8.2 相应降级标注。

- [ ] **Step 4: 整仓验证**

Run: `bash verify.sh`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.8.3 选列+排序按登录用户持久化收官"
```

---

## Self-Review（作者自查）

**1. Spec 覆盖**
- 选列按用户（11 表，key 加账号前缀，修串味）→ Task 1 + Task 6 ✅
- 排序按用户（外部 4）→ Task 3 + Task 7 ✅
- 排序按用户（内部 9，DataTable default-sort + 捕获）→ Task 4 + Task 5 + Task 8 ✅
- account 来源 useAuthStore、兜底 anon、视图层拼 key（组合式保持纯 string）→ Task 1 + 各 wiring ✅
- 存储 key 格式 `colprefs:{account}:{TABLE_ID}` / `colsort:{account}:{TABLE_ID}` → useColumnPrefs 前缀 `colprefs:` + userScopedKey；sortPrefs 前缀 `colsort:` + userScopedKey ✅
- 列筛选不纳入（crossFilter 零改动）✅；登出不清（每账号命名空间，无清理代码）✅
- 迁移=不迁旧共享值、老用户首次默认一次 → 无迁移代码即达成（旧键孤儿留存）；Task 9 PROGRESS/手册注明 ✅
- OpportunitiesView 裸 el-table 特例 → Task 7 专条 ✅
- CostDetailView 三态（选列 l4 + 外部 cost-detail + 内部 l4）无命名冲突 → Task 6/7/8 分别专条、l4 用 `l4Sort` 命名空间 ✅
- 版本 V2.8.3、后端零改动 → Task 9 ✅

**2. 占位符扫描**：无 TBD/TODO；lib 任务给完整代码；wiring 任务给统一改法 + 每视图锚点 + 精确要加的 import/属性 + 覆盖率 grep 自检（防漏改）。行号标注为定位提示、以锚点文本匹配。

**3. 类型/命名一致性**：`SortState` 单一定义于 `sortPrefs`（Task 2），`useExternalSort` re-export（Task 3），`usePersistentSort` 复用（Task 4）；`userScopedKey`(Task 1) 全 wiring 一致调用；`defaultSort`/`onSortChange` 在外部排序为解构名、内部排序 CostDetail 用 `l4Sort.` 命名空间避冲突；`elDefaultSort` 返回类型与 DataTable prop 类型（Task 5）一致 `{prop, order:'ascending'|'descending'}|undefined`。

**风险提示（供执行期留意）**：wiring 任务跨文件多、易漏；每个 wiring 任务的 Step 2 覆盖率 grep 是硬校验（数目对不上即有漏改）。Task 6/7/8 都触及 CostDetailView 与部分视图，SDD 顺序执行、后任务见前任务已提交状态，无并行冲突。
