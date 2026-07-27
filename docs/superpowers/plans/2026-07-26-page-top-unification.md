# 页面顶部区统一 + 视图状态持久化 实施计划（V4.4.8，Z 级）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 30 个页面的顶部区（`PageHeader` 组件 + 页级操作归位），并给 8 个页面的视图状态加 localStorage 持久化。

**Architecture:** 两个新增基础件——`usePersistedRefs`（接收现有 ref 组、按账号持久化）与 `PageHeader`（标题 + `actions` 插槽）。随后按**文件集**分五组并行接入，每组负责互不重叠的 view 文件。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Pinia + Vitest + @vue/test-utils

## Global Constraints

- **绝不使用 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`
- 注释、测试名、UI 文案一律**简体中文**
- 版本 **V4.4.8（Z 级）**，单一来源 `frontend/src/version.ts`
- **绝不碰** `useFilterStore` / `hideFilter` / `AppLayout.showFilter` / `.toolbar` 的 6 份重复样式定义（全属第三期）
- **绝不碰** `nav.ts` / `router` / `AppSidebar` / `PageTabs`（V4.4.7 已定稿）
- 页头**不显示数据时效**（`AppHeader` 已有「数据已同步」）
- 三类状态**绝不**传进 `usePersistedRefs`：modal 开关及其载荷（`drillOpen`/`drillTitle`/`drillGroup`/`drillRows`/`statusOpen`/`statusTitle`/`statusRows`）、DOM 引用（`detailCardRef`）、分页页码（`currentPage`）
- **豁免三类页面不加 `PageHeader`**：全屏页（`LoginView`/`ChangePasswordView`）、首页（`OverviewView`）、详情页（`ProjectDetailView`/`ClosedProjectDetailView`）
- typecheck 用 `npm --prefix frontend run typecheck`（**本仓无 `tsconfig.app.json`**）
- 测试用 `npm --prefix frontend run test:run -- <路径>`
- 每个 Task 结束时 typecheck + 该 Task 的 scoped 测试必须绿

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/composables/usePersistedRefs.ts` | 建 | 按账号持久化一组页面视图 ref |
| `frontend/src/composables/usePersistedRefs.test.ts` | 建 | 含类型护栏与 null 初值两条关键用例 |
| `frontend/src/components/PageHeader.vue` | 建 | 标题 + `actions` 插槽 |
| `frontend/src/components/PageHeader.test.ts` | 建 | 含「视觉零变化」契约 |
| 30 个 `views/*.vue` | 改 | 分五组并行接入，见 Task 3-7 |
| `frontend/src/views/__pageHeader.test.ts` | 建 | 全局扫描守卫（豁免规则 + 禁传 modal ref + 不侵入第三期） |
| `frontend/src/version.ts` · `PROGRESS.md` | 改 | 发版 |

---

### Task 1: `usePersistedRefs` composable

**Files:**
- Create: `frontend/src/composables/usePersistedRefs.ts`
- Test: `frontend/src/composables/usePersistedRefs.test.ts`

**Interfaces:**
- Produces: `usePersistedRefs(baseKey: string, refs: Record<string, Ref<any>>): void`
- Consumes: 既有 `@/lib/userScopedKey` 的 `userScopedKey(base): string`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { usePersistedRefs } from './usePersistedRefs'

function login(account: string) {
  const a = useAuthStore()
  a.user = { account, displayName: account, isSuper: true, allowedPages: ['*'], allowedL4: [] }
}

describe('usePersistedRefs', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('改 ref 后写入 localStorage,新实例 hydrate 时恢复', async () => {
    login('u1')
    const a = ref('x')
    usePersistedRefs('view_t', { a })
    a.value = 'y'
    await nextTick()
    const b = ref('x')
    usePersistedRefs('view_t', { b: b })   // 键名不同则不恢复,验证按键名匹配
    expect(b.value).toBe('x')
    const a2 = ref('x')
    usePersistedRefs('view_t', { a: a2 })
    expect(a2.value).toBe('y')
  })

  it('按账号隔离:u1 的存档 u2 读不到', async () => {
    login('u1')
    const a = ref('x'); usePersistedRefs('view_t', { a }); a.value = 'u1值'; await nextTick()
    setActivePinia(createPinia()); login('u2')
    const b = ref('x'); usePersistedRefs('view_t', { a: b })
    expect(b.value).toBe('x')
  })

  it('坏 JSON 不崩,回落默认值', () => {
    login('u1')
    localStorage.setItem('u1:view_t', '{不是JSON')
    const a = ref('默认')
    expect(() => usePersistedRefs('view_t', { a })).not.toThrow()
    expect(a.value).toBe('默认')
  })

  it('类型护栏:存档是数组而当前 ref 是字符串 → 跳过该键,其余键正常恢复', () => {
    login('u1')
    localStorage.setItem('u1:view_t', JSON.stringify({ a: ['坏'], b: '好' }))
    const a = ref('默认'); const b = ref('')
    usePersistedRefs('view_t', { a, b })
    expect(a.value).toBe('默认')   // 被护栏拦下
    expect(b.value).toBe('好')     // 不受牵连
  })

  it('null 初值不被护栏误杀:ref<number|null>(null) 能被存档里的 number 恢复', () => {
    // typeof null === 'object',若护栏不先放行 null,合法的 number 存档会被判为不符而静默失效。
    // MilestoneView 的 faYear / nodeYear 正是这种 ref。
    login('u1')
    localStorage.setItem('u1:view_t', JSON.stringify({ y: 2026 }))
    const y = ref<number | null>(null)
    usePersistedRefs('view_t', { y })
    expect(y.value).toBe(2026)
  })

  it('setItem 抛错(配额满)时不冒泡', async () => {
    login('u1')
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const a = ref('x')
    usePersistedRefs('view_t', { a })
    a.value = 'y'
    await expect(nextTick()).resolves.not.toThrow()
    spy.mockRestore()
  })

  it('数组状态变更能触发持久化(验证 deep 生效)', async () => {
    login('u1')
    const arr = ref<string[]>(['a'])
    usePersistedRefs('view_t', { arr })
    arr.value.push('b')
    await nextTick()
    expect(JSON.parse(localStorage.getItem('u1:view_t')!).arr).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm --prefix frontend run test:run -- src/composables/usePersistedRefs.test.ts`
Expected: FAIL —— 找不到 `./usePersistedRefs`

- [ ] **Step 3: 实现**

```ts
import { watch, type Ref } from 'vue'
import { userScopedKey } from '@/lib/userScopedKey'

/** 把一组页面视图 ref 按登录账号持久化到 localStorage(V2.8.3 范式,与 useYitianViewStore 同源)。
 *  须在组件 setup 内调用(userScopedKey 需要 pinia active)。
 *  只收「用户选择」类状态 —— modal 开关/DOM 引用/分页页码绝不传进来:
 *  存了 drillOpen:true 会导致下次进页面弹出一个空 modal;HTMLElement 无法序列化;
 *  currentPage 会让人「回来还停在第 5 页」且数据变化后可能越界。 */
export function usePersistedRefs(baseKey: string, refs: Record<string, Ref<any>>): void {
  let hydrated = false
  try {
    const raw = localStorage.getItem(userScopedKey(baseKey))
    if (raw) {
      const p = JSON.parse(raw) as Record<string, unknown>
      for (const [k, r] of Object.entries(refs)) {
        const v = p[k]
        if (v === undefined) continue
        // 类型护栏:存档结构与当前代码不符时跳过该键,不污染运行时。
        // 本期 8 个页面各存一份不同结构的档,今后任一次「改默认值/换类型/删状态」
        // 都会让旧档与新代码错位,没有护栏会把字符串灌进本该是数组的 ref、页面直接崩。
        if (Array.isArray(r.value) !== Array.isArray(v)) continue
        // r.value !== null 必须在 typeof 比较【之前】:typeof null === 'object',
        // 否则 ref<number|null>(null) 会把合法的 number 存档判为不符而静默失效。
        if (!Array.isArray(v) && r.value !== null && typeof r.value !== typeof v) continue
        r.value = v
      }
    }
  } catch {
    /* 坏 JSON / 隐私模式:忽略,用默认值 */
  }
  hydrated = true

  watch(Object.values(refs), () => {
    if (!hydrated) return
    try {
      const out: Record<string, unknown> = {}
      for (const [k, r] of Object.entries(refs)) out[k] = r.value
      localStorage.setItem(userScopedKey(baseKey), JSON.stringify(out))
    } catch {
      /* 配额满:静默降级为不持久化 */
    }
  }, { deep: true })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm --prefix frontend run test:run -- src/composables/usePersistedRefs.test.ts`
Expected: PASS（7 项）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/composables/usePersistedRefs.ts frontend/src/composables/usePersistedRefs.test.ts
git commit -m "feat(view-state): V4.4.8 新增 usePersistedRefs —— 按账号持久化页面视图状态

复用 useYitianViewStore 的 V2.8.3 范式(hydrated 标志/try-catch 静默降级/deep 监听),
新增它没有的类型护栏:本期 8 页各存一份不同结构的档,今后改默认值或换类型会让
旧档与新代码错位。注意 r.value !== null 必须在 typeof 比较之前 ——
typeof null === 'object',否则 ref<number|null> 会把合法 number 存档静默丢弃。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `PageHeader` 组件

**Files:**
- Create: `frontend/src/components/PageHeader.vue`
- Test: `frontend/src/components/PageHeader.test.ts`

**Interfaces:**
- Produces: `<PageHeader title="..."><template #actions>...</template></PageHeader>`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PageHeader from './PageHeader.vue'

describe('PageHeader', () => {
  it('渲染标题', () => {
    const w = mount(PageHeader, { props: { title: '在建项目' } })
    expect(w.find('.ph-title').text()).toBe('在建项目')
  })

  it('actions 插槽内容渲染在 .ph-actions 内', () => {
    const w = mount(PageHeader, {
      props: { title: 'X' },
      slots: { actions: '<button class="t-btn">导出</button>' },
    })
    expect(w.find('.ph-actions .t-btn').exists()).toBe(true)
  })

  it('无 actions 插槽时不报错', () => {
    const w = mount(PageHeader, { props: { title: 'X' } })
    expect(w.find('.ph-actions').exists()).toBe(true)
  })

  it('视觉零变化契约:ph-title 取值与被替换的 19 份 XX-title 一致', () => {
    // 被替换的各页样式统一是 font-size:--fs-4 / font-weight:700 / color:--txt。
    // 这条锁住「抽组件不改观感」这个前提 —— 改了取值就等于改了 19 个页面的外观。
    const css = readFileSync(resolve(__dirname, 'PageHeader.vue'), 'utf-8')
    expect(css).toMatch(/\.ph-title\s*\{[^}]*font-size:\s*var\(--fs-4\)/)
    expect(css).toMatch(/\.ph-title\s*\{[^}]*font-weight:\s*700/)
    expect(css).toMatch(/\.ph-title\s*\{[^}]*color:\s*var\(--txt\)/)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm --prefix frontend run test:run -- src/components/PageHeader.test.ts`
Expected: FAIL —— 找不到 `./PageHeader.vue`

- [ ] **Step 3: 实现**

```vue
<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="ph">
    <h2 class="ph-title">{{ title }}</h2>
    <div class="ph-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
/* 取值与被替换的 19 份 .XX-title 一致(--fs-4 / 700 / --txt),故抽组件后视觉零变化。
   改这三个值等于一次性改掉 19 个页面的外观,改前先看 PageHeader.test.ts 的契约用例。 */
.ph { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.ph-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.ph-actions { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `npm --prefix frontend run test:run -- src/components/PageHeader.test.ts`
Expected: PASS（4 项）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/PageHeader.vue frontend/src/components/PageHeader.test.ts
git commit -m "feat(page-header): V4.4.8 新增 PageHeader 组件(标题 + actions 插槽)

取值与被替换的 19 份 .XX-title 逐条相同(--fs-4/700/--txt),抽组件视觉零变化,
并写成契约测试锁死 —— 改这三个值等于一次性改掉 19 个页面的外观。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3-7 通用改造模式

以下五个 Task 是同一模式在不同文件集上的应用。**每个 Task 只碰自己那组文件。**

**模式甲 —— 替换既有标题（19 页）**

```vue
<!-- 改前 -->
<h2 class="pv-title">在建项目</h2>

<!-- 改后:无操作按钮时 -->
<PageHeader title="在建项目" />

<!-- 改后:有操作按钮时,把按钮从 .toolbar 里移进来 -->
<PageHeader title="在建项目">
  <template #actions>
    <button class="pv-export-btn" @click="exOpen = true">导出</button>
  </template>
</PageHeader>
```

script 段加 `import PageHeader from '@/components/PageHeader.vue'`；style 段**删除**已无引用的 `.XX-title` 规则。

**模式乙 —— 新增页头（11 页）**：在页面根容器的第一个子元素位置插入 `<PageHeader title="..." />`。倚天 5 页插在 `<YitianToolbar>` **之上**。

**模式丙 —— 状态持久化（8 页）**：在全部相关 `ref` 声明**之后**加一行调用。

**三条铁律**（违反任一即缺陷）：

1. **按钮的 `v-if` 原样搬**。四张跟进表的操作按钮全是 `v-if="auth.isSuper"`，`/projects` 的导出是全员可见 —— 搬进 `#actions` 后权限条件一字不改。
2. **`.toolbar` 内的筛选控件与「清除所有筛选」留在原地**，只搬操作按钮。
3. **`usePersistedRefs` 的参数对象里绝不出现** `drillOpen`/`drillTitle`/`drillGroup`/`drillRows`/`statusOpen`/`statusTitle`/`statusRows`/`detailCardRef`/`currentPage`。

**每个 Task 的验证**：`npm --prefix frontend run test:run -- <本组涉及的 *.test.ts>`，全绿后提交。

---

### Task 3: 回款组（5 页）

**Files:**
- Modify: `views/BoardView.vue`（A 持久化 + B 新增页头）
- Modify: `views/CalendarView.vue`（A 持久化 + B 替换标题 `cal-title:123`）
- Modify: `views/DashboardView.vue`（B 新增页头）
- Modify: `views/PayProjectsView.vue`（B 新增页头）
- Modify: `views/PayNodesView.vue`（B 新增页头）
- Test: 对应各 `*.test.ts`

- [ ] **Step 1: `BoardView` 加持久化并处理 URL 优先级**

`BoardView.vue:43-52` 现状是先算 `initDim` 再 `const dimKey = ref(initDim)`。改为三层顺序（默认 → localStorage → URL）：

```ts
const mode = ref('single')
const dimKey = ref('dept')                    // ① 默认值(原 initDim 的兜底值)
const secondDim = ref('')
const metricKey = ref<(typeof METRICS)[number]['key']>('contractSum')
const rowDims = ref<string[]>(['dept'])
const colDims = ref<string[]>([])
const sortKey = ref<PayBoardSortKey>('projectCount')
const chartTypes = ref<string[]>(['bar'])

// ② localStorage 覆盖默认值
usePersistedRefs('view_board', { mode, dimKey, secondDim, metricKey, rowDims, colDims, sortKey, chartTypes })

// ③ URL 最高优先:goBoard 带 ?dim= 是显式跳转意图,必须压过上次的选择
const rawDim = typeof route.query.dim === 'string' ? route.query.dim : ''
const aliasDim = rawDim === 'orgL4' ? 'dept' : rawDim      // 既有别名映射,保留
if (aliasDim && DIMENSIONS.some((d) => d.key === aliasDim)) {
  dimKey.value = aliasDim
  rowDims.value = [aliasDim]
}
```

注意原 `rowDims = ref<string[]>([initDim])` 的初值依赖 `initDim`，改造后由第 ③ 步同步，不要遗漏。

- [ ] **Step 2: 其余四页按模式接入**

- `CalendarView`：`usePersistedRefs('view_calendar', { view })`；`cal-title:123` 换成 `<PageHeader title="回款日历" />`
- `DashboardView` / `PayProjectsView` / `PayNodesView`：模式乙，标题分别为「回款总览」「回款项目」「回款节点」

- [ ] **Step 3: 写测试**

给 `BoardView` 补三条。**这三条是 Task 4、5 各页持久化测试的样板，照此改键名与页面即可**：

```ts
it('维度选择持久化:改 dimKey → 卸载 → 重新挂载后仍是该值', async () => {
  const w1 = mountView()                     // 沿用该测试文件既有的挂载辅助
  await flushPromises()
  ;(w1.vm as any).dimKey = 'customer'
  await nextTick()                           // 等 watch 落盘
  w1.unmount()

  const w2 = mountView()
  await flushPromises()
  expect((w2.vm as any).dimKey).toBe('customer')
})

it('URL 的 ?dim= 压过 localStorage 存档', async () => {
  // 存档 customer,URL 带 dim=dept → 取 dept(显式跳转意图 > 上次选择)
  const a = useAuthStore()
  a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: ['*'], allowedL4: [] }
  localStorage.setItem('s:view_board', JSON.stringify({ dimKey: 'customer' }))
  await router.push('/payment/board?dim=dept')
  const w = mountView()
  await flushPromises()
  expect((w.vm as any).dimKey).toBe('dept')
})

it('modal 状态 drillOpen 不进存档(否则重进页面会弹空 modal)', async () => {
  const w1 = mountView()
  await flushPromises()
  ;(w1.vm as any).drillOpen = true
  await nextTick()
  w1.unmount()

  const raw = localStorage.getItem('s:view_board') ?? '{}'
  expect(Object.keys(JSON.parse(raw))).not.toContain('drillOpen')

  const w2 = mountView()
  await flushPromises()
  expect((w2.vm as any).drillOpen).toBe(false)
})
```

**注意** `dimKey`、`drillOpen` 需在被测组件的 `defineExpose` 中（`BoardView.vue:182` 已导出这两个）。Task 4/5 各页若所测状态未 expose，**在 `defineExpose` 中补上**，不要改用其他断言方式绕开。

其余四页各补一条「页头标题渲染」断言：

```ts
it('渲染页头标题', async () => {
  const w = mountView()
  await flushPromises()
  expect(w.find('.ph-title').text()).toBe('回款总览')   // 各页替换为自己的标题
})
```

- [ ] **Step 4: 验证并提交**

Run: `npm --prefix frontend run test:run -- src/views/BoardView.test.ts src/views/CalendarView.test.ts src/views/DashboardView.test.ts src/views/PayProjectsView.test.ts src/views/PayNodesView.test.ts`

```bash
git add frontend/src/views/BoardView.vue frontend/src/views/CalendarView.vue frontend/src/views/DashboardView.vue frontend/src/views/PayProjectsView.vue frontend/src/views/PayNodesView.vue frontend/src/views/*.test.ts
git commit -m "feat(page-top): V4.4.8 回款组 5 页接入页头与状态持久化

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 项目分析组（4 页，全部 A+B）

**Files:**
- `views/InsightView.vue`（`iv-title:160`）：持久化 `selectedTags` `mode` `dimKey` `secondDim` `metricKey` `rowDims` `colDims` `chartTypes` → key `view_insight`
- `views/MilestoneView.vue`（`mv-title:234`）：持久化 `selectedTags` `faGran` `faYear` `nodeYear` `detailTab` → key `view_milestone`
- `views/CostDetailView.vue`（`cd-title:191`）：持久化 `fKw` `selectedTags` `kpiFilter` → key `view_costdetail`
- `views/RiskBoardView.vue`（`rv-title:129`）：持久化 `dimKey` `metricKey` `chartTypes` `levelFilter` `rowDims` `colDims` `ovMetric` → key `view_risk`

- [ ] **Step 1-4**：四页各按模式甲（替换标题）+ 模式丙（持久化）改造，各补一条持久化往返测试与一条页头标题断言。

**本组特别注意**：`MilestoneView` 的 `faYear`/`nodeYear` 是 `ref<number | null>(null)`，依赖 Task 1 护栏里 `r.value !== null` 的判断顺序；`CostDetailView` 的 `detailCardRef` 是 DOM 引用，**绝不能**传进 `usePersistedRefs`。

- [ ] **Step 5: 验证并提交**

Run: `npm --prefix frontend run test:run -- src/views/InsightView.test.ts src/views/MilestoneView.test.ts src/views/CostDetailView.test.ts src/views/RiskBoardView.test.ts`

```bash
git commit -m "feat(page-top): V4.4.8 项目分析组 4 页接入页头与状态持久化

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 倚天组（6 页）

**Files:**
- `views/YitianOverviewView.vue`：模式乙，标题「工时总览」，插在 `<YitianToolbar>`（:159）之上
- `views/YitianDetailView.vue`：模式甲，`yd-title:97` → `<PageHeader title="工时明细">`，把 `:116` 的导出按钮搬进 `#actions`
- `views/YitianComplianceView.vue`：模式乙（标题「合规检查」，插在 :208 之上）+ 模式丙（`usePersistedRefs('view_yitian_compliance', { pageSize })`）
- `views/YitianAnalyticsView.vue`：模式乙（「统计分析」，:224 之上）+ 模式丙（`view_yitian_analytics`，`{ pageSize }`）
- `views/YitianTrendView.vue`：模式乙（「趋势分析」，:170 之上）
- `views/YitianCustomerView.vue`：模式乙（「客户支持分析」，:167 之上）

**铁律**：`currentPage` **不持久化**（只持久化 `pageSize`）。标题文案必须与 `nav.ts` 中 `YITIAN_LINKS` / `TAB_GROUPS['yitian-analysis']` 的 `label` 逐字一致。

- [ ] **Step 1-4**：按上表改造，各补一条页头标题断言；两个有 `pageSize` 的页各补一条持久化往返测试 + 一条「`currentPage` 不在存档里」的断言。

- [ ] **Step 5: 验证并提交**

Run: `npm --prefix frontend run test:run -- src/views/Yitian*.test.ts`

```bash
git commit -m "feat(page-top): V4.4.8 倚天 6 页接入页头,两页持久化 pageSize

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 跟进表组（5 页，纯 B，操作按钮归位）

**Files & 精确行号:**

| 文件 | 标题行 | 操作按钮行（全部 `v-if="auth.isSuper"`） |
|---|---|---|
| `views/KeyProjectsView.vue` | `kp-title:165` | `:183` 更新（归档+清空）、`:184` 导出 |
| `views/RiskFollowupView.vue` | `kp-title:186` | `:198` 范围设置、`:199` 归档（留存跟进）、`:201` 导出 |
| `views/OpportunityFollowupView.vue` | `kp-title:136` | `:148` 范围设置、`:149` 更新（归档+清空）、`:151` 导出 |
| `views/PaymentKeyFollowupView.vue` | `kp-title:178` | `:190` 范围设置、`:191` 归档（留存跟进）、`:193` 导出 |
| `views/TempFollowupView.vue` | `kp-title:118` | **无** —— 该页是多实例结构（V4.0.2），操作按钮在子组件内，本期不动 |

- [ ] **Step 1: 逐页改造**

标题换 `<PageHeader>`，上表的操作按钮**连同 `v-if="auth.isSuper"` 一起**移入 `#actions`。`.toolbar` 内的筛选控件与「清除所有筛选」**留在原地**。

五页共用 `kp-title` 与 `kp-export-btn`/`kp-archive-btn` 类名，删 `.kp-title` 时确认该文件内确已无引用（按钮类名保留）。

- [ ] **Step 2: 权限回归测试（本 Task 最重要）**

每页各补一条：

```ts
it('非超管账号看不到导出/归档/范围设置按钮', async () => {
  // 挂载时 auth.user.isSuper = false
  expect(w.find('.ph-actions').text()).not.toContain('导出')
  expect(w.find('.ph-actions').text()).not.toContain('归档')
})

it('超管账号能看到全部操作按钮', async () => { /* 反向 */ })
```

- [ ] **Step 3: 验证并提交**

Run: `npm --prefix frontend run test:run -- src/views/KeyProjectsView.test.ts src/views/RiskFollowupView.test.ts src/views/OpportunityFollowupView.test.ts src/views/PaymentKeyFollowupView.test.ts src/views/TempFollowupView.test.ts`

```bash
git commit -m "feat(page-top): V4.4.8 五张跟进表页头 + 超管操作按钮归位(v-if 原样保留)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 其余组（10 页，纯 B）

**Files:**

| 文件 | 动作 | 标题 | 操作按钮 |
|---|---|---|---|
| `views/ProjectsView.vue` | 甲 | `pv-title:171` 在建项目 | `:181` 导出（**全员可见，无 v-if**） |
| `views/ClosedProjectsView.vue` | 甲 | `cv-title:78` 已关闭项目 | 无 |
| `views/ActivityView.vue` | 甲 | `av-title:137` 项目动态 | `:178` 导出表格 |
| `views/OpportunitiesView.vue` | 甲 | `opp-title:178` 商机清单 | `:200` 新增商机（全员）、`:217` 导出等（超管） |
| `views/OpportunitiesBoardView.vue` | 乙 | 商机看板 | 无 |
| `views/BudgetView.vue` | 甲 | `bd-title:161` 概算工具 | **一个都不搬**（工具页主流程，见 spec B4.2） |
| `views/DataView.vue` | 甲 | `dv-title:70` 数据管理 | 无 |
| `views/DataQualityView.vue` | 甲 | `gov-title:28` 数据治理 | 无 |
| `views/AdminView.vue` | 甲 | `admin-title:207` 账号管理 | 无 |
| `views/AboutView.vue` | 乙 | 关于产品 | 无 |

- [ ] **Step 1-3**：按表改造，各补一条页头标题断言；`ProjectsView` 额外补一条「导出按钮对普通账号可见」（与 Task 6 的超管专属形成对照，防有人误加 `v-if`）。

**BudgetView 铁律**：只换标题，四个按钮（存档／新建报价／保存／导出 Excel）**留在原地**。

- [ ] **Step 4: 验证并提交**

Run: `npm --prefix frontend run test:run -- src/views/ProjectsView.test.ts src/views/ClosedProjectsView.test.ts src/views/ActivityView.test.ts src/views/OpportunitiesView.test.ts src/views/BudgetView.test.ts src/views/DataView.test.ts src/views/DataQualityView.test.ts src/views/AdminView.test.ts src/views/AboutView.test.ts`

```bash
git commit -m "feat(page-top): V4.4.8 其余 10 页页头(BudgetView 四按钮留原地)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 全局守卫 + 去重收尾 + 发版

**Files:**
- Create: `frontend/src/views/__pageHeader.test.ts`
- Modify: `frontend/src/version.ts` · `PROGRESS.md`

- [ ] **Step 1: 写三条扫描守卫**

仿照既有的 `views/__scopeGuard.test.ts`（读文件源码做正则扫描）：

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const viewsDir = resolve(__dirname)
const read = (f: string) => readFileSync(resolve(viewsDir, f), 'utf-8')

describe('页头与视图状态全局守卫', () => {
  it('豁免三类页面不得出现 PageHeader', () => {
    // 首页是 landing page(加标题纯冗余);两个详情页标题是动态的、需返回按钮,
    // 属另一种页头模式,本期不做。防今后有人「顺手补齐」破坏该判断。
    for (const f of ['OverviewView.vue', 'ProjectDetailView.vue', 'ClosedProjectDetailView.vue',
                     'LoginView.vue', 'ChangePasswordView.vue']) {
      expect(read(f)).not.toContain('PageHeader')
    }
  })

  it('usePersistedRefs 的参数里不得出现 modal/DOM/页码状态', () => {
    const BAN = /usePersistedRefs\([^)]*?\b(drill\w*|status(Open|Title|Rows)|detailCardRef|currentPage)\b/s
    for (const f of readdirSync(viewsDir).filter((x) => x.endsWith('.vue'))) {
      expect(BAN.test(read(f)), `${f} 把禁传状态传进了 usePersistedRefs`).toBe(false)
    }
  })

  it('本期不得引入对 filterStore / hideFilter 的新引用(那属第三期)', () => {
    // 防 Part B 侵入第三期范围。名单为本期改动的 view。
    const TOUCHED = ['ProjectsView.vue', 'BoardView.vue', 'InsightView.vue', 'YitianDetailView.vue']
    for (const f of TOUCHED) {
      expect(read(f)).not.toContain('useFilterStore')
    }
  })
})
```

- [ ] **Step 2: 删除已无引用的 19 份 `.XX-title` 样式**

逐页确认后删除。**`.toolbar` 的 6 份重复定义保留不动**（仍被筛选行使用，抽取属第三期）。

核对零残留：

```bash
grep -rnE "^\.(pv|cv|kp|av|bd|dv|cal|cd|gov|iv|mv|opp|rv|yd|admin)-title\s*\{" frontend/src/views/
```
Expected: 无输出。

- [ ] **Step 3: 版本号与 PROGRESS**

`version.ts` → `V4.4.8` / `2026-07-26`；`PROGRESS.md` 追加条目（要点见 spec §7，含「导出按钮位置变更」这条升级提醒）。

- [ ] **Step 4: 全量验证**

Run: `bash verify.sh`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/__pageHeader.test.ts frontend/src/views/*.vue frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.4.8 页面顶部区统一 + 视图状态持久化

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## 完成后的人工冒烟清单（自动化盖不到）

1. `/payment/board` 选维度「客户」+ 图表「饼图」→ 切「回款日历」→ 切回 → 维度与图表类型仍在
2. 同上按 F5 → 状态仍在
3. 从 `/payment` 点某维度下钻进 board → **URL 的 dim 生效**，而非上次存档的维度
4. 打开下钻 modal → 切走再回来 → **不应弹出空 modal**
5. 换账号登录 → 看到自己的存档
6. `/insight` 四个 tab 来回切 → 各自状态互不干扰（验证 8 个 key 未串档）
7. 逐页目验页头：标题位置、操作按钮右对齐、与下方筛选行间距
8. 非超管账号看 `/projects/key` 与 `/risk` → 页头右侧**无导出按钮**；看 `/projects` → **有导出按钮**
9. 首页与项目详情页 → **确认没有多出一行页头**
