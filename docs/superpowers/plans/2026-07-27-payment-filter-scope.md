# filterStore 收窄为回款域专用 + 首页筛选脱钩（V4.5.3）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全局单例 `filterStore` 拆成「全局标签排除」与「回款域筛选」两个 store，让首页物理上拿不到回款域的日期区间，修掉首页「年度回款进度」标签与数据不符的缺陷。

**Architecture:** `stores/filter.ts` 一分为二 —— 新建 `stores/exclude.ts`（全局配置，跨域消费）与 `stores/paymentFilter.ts`（回款域筛选，仅 5 页）。单向依赖 `paymentFilter → exclude`。首页 `OverviewView` 只保留 `exclude`，`paymentBand` 同步删掉再无调用方的 `start`/`end` 参数。最后把 `__pageHeader.test.ts` 里一条到期的冻结基线测试，改写为以 `router/index.ts` 为单一来源的结构守卫。

**Tech Stack:** Vue 3 + TypeScript + Pinia（setup store 写法）+ Vitest + Element Plus。纯前端，后端零改动。

## Global Constraints

- 版本 **V4.5.3**，单一来源 `frontend/src/version.ts`，只改这一处（**最后一个 task 才改**）。
- 交流与注释语言：**简体中文**。**不使用任何 emoji**，需要符号时用 `→ ↓ ❌ ✕ ▾`。
- localStorage key **`pa_exclude_on` / `pa_exclude_tags` 一字不改**（存着现网用户已配好的排除标签，改 key = 静默清空所有人的配置）。
- **单向依赖**：`paymentFilter` 可以 `useExcludeStore()`，**`exclude` 绝不可反向引用 `paymentFilter`**。
- 每个 task 结束时 `npm --prefix frontend run typecheck` 必须绿；全部 task 完成后 `bash verify.sh` 必须全绿。
- 提交信息结尾加：`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **绝不 `git add -A` / `git add .`**（工作树常年散落未跟踪的 `*.png` / `yitian/` 等含真实数据的脏文件）。只 `git add` 本 task 明确改动的文件。
- 命令一律在仓库根目录 `C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection` 下执行；前端命令用 `npm --prefix frontend run <script>`（**本仓无 `tsconfig.app.json`，不要直接调 `tsc`**）。
- 单测跑法：`npm --prefix frontend run test:run -- <路径>`。

## 中间态警告（务必读）

Task 2 结束前，`exclude` store 与 `filter.ts` 的排除状态会**并存两份 ref**（读同一个 localStorage、但同一会话内互不同步）。因此：

- **Task 1 结束后不要做手动浏览器冒烟** —— 那时新 store 还没有任何消费方，冒烟没有意义。
- **Task 2 必须一次做完全部 10 个 ① 类消费方**，中途不要拆成多次提交。做完后排除状态才重新统一。

---

### Task 1: 新建 `exclude` store（纯新增，零消费方）

**Files:**
- Create: `frontend/src/stores/exclude.ts`
- Create: `frontend/src/stores/exclude.test.ts`
- Modify: `frontend/src/stores/filter.test.ts`（删掉搬走的那个 `describe` 块）

**Interfaces:**
- Produces: `useExcludeStore()` → `{ excludeOn: Ref<boolean>, excludeTags: Ref<string[]>, excludedIds: ComputedRef<Record<string, boolean>>, setExclude(on: boolean, tags: string[]): void }`。Task 2 起被 10 个组件消费，Task 2 起被 `paymentFilter` 内部消费。

- [ ] **Step 1: 写失败的测试**

创建 `frontend/src/stores/exclude.test.ts`（四条用例整体搬自 `filter.test.ts` 的 `describe('filter excludedIds（按标签全局排除）')`，只把 `useFilterStore` 换成 `useExcludeStore`；**断言一字不改**）：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useExcludeStore } from './exclude'
import { useProjectTagsStore } from '@/stores/projectTags'

describe('exclude store（按标签全局排除）', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('excludeOn 关 → 空；开+选标签 → 命中项目集', () => {
    const tags = useProjectTagsStore()
    tags.assignments = { A: ['框架合同'], B: ['BH项目'], C: ['框架合同', 'BH项目'] } as any
    const f = useExcludeStore()
    expect(f.excludedIds).toEqual({})
    f.setExclude(true, ['框架合同'])
    expect(f.excludedIds).toEqual({ A: true, C: true })
    expect(f.excludeOn).toBe(true)
    expect(f.excludeTags).toEqual(['框架合同'])
  })

  it('开但未选标签 → 空（不误排除）', () => {
    const f = useExcludeStore()
    f.setExclude(true, [])
    expect(f.excludedIds).toEqual({})
  })

  it('localStorage 中 pa_exclude_tags 损坏(非合法 JSON) → 回退空数组,不抛异常', () => {
    localStorage.setItem('pa_exclude_tags', '{not valid json')
    expect(() => useExcludeStore()).not.toThrow()
    const f = useExcludeStore()
    expect(f.excludeTags).toEqual([])
  })

  it('localStorage 中 pa_exclude_tags 是合法 JSON 但非数组 → 回退空数组', () => {
    localStorage.setItem('pa_exclude_tags', '{"a":1}')
    const f = useExcludeStore()
    expect(f.excludeTags).toEqual([])
  })

  it('localStorage key 是 pa_exclude_on / pa_exclude_tags（改 key 会清空现网用户配置）', () => {
    const f = useExcludeStore()
    f.setExclude(true, ['框架合同'])
    expect(localStorage.getItem('pa_exclude_on')).toBe('true')
    expect(JSON.parse(localStorage.getItem('pa_exclude_tags') as string)).toEqual(['框架合同'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix frontend run test:run -- src/stores/exclude.test.ts`
Expected: FAIL —— 报找不到模块 `./exclude`

- [ ] **Step 3: 写实现**

创建 `frontend/src/stores/exclude.ts`（内容整体搬自 `filter.ts` 的对应片段，逻辑一行不改）：

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useProjectTagsStore } from '@/stores/projectTags'

// 按标签全局排除项目。【全局配置】——在 /data 页配置、全站多域消费(回款域/成本分析/里程碑/首页)，
// 与「回款域页面级筛选」(stores/paymentFilter.ts)是两类东西,V4.5.3 拆开。
// 本 store 绝不可反向引用 paymentFilter,否则两类状态又粘回去、拆分白做。
const EXCLUDE_ON_KEY = 'pa_exclude_on'
const EXCLUDE_TAGS_KEY = 'pa_exclude_tags'

function loadExcludeTags(): string[] {
  try {
    const raw = localStorage.getItem(EXCLUDE_TAGS_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v as string[]
    }
  } catch {
    /* localStorage 不可用/损坏 → 空 */
  }
  return []
}

export const useExcludeStore = defineStore('exclude', () => {
  const projectTags = useProjectTagsStore()
  const excludeOn = ref(localStorage.getItem(EXCLUDE_ON_KEY) === 'true')
  const excludeTags = ref<string[]>(loadExcludeTags())

  const excludedIds = computed<Record<string, boolean>>(() => {
    if (!excludeOn.value || excludeTags.value.length === 0) return {}
    const sel = new Set(excludeTags.value)
    const out: Record<string, boolean> = {}
    for (const [pid, names] of Object.entries(projectTags.effectiveAssignments)) {
      if (names.some((n) => sel.has(n))) out[pid] = true
    }
    return out
  })

  function setExclude(on: boolean, tags: string[]) {
    excludeOn.value = on
    excludeTags.value = [...tags]
    localStorage.setItem(EXCLUDE_ON_KEY, on ? 'true' : 'false')
    localStorage.setItem(EXCLUDE_TAGS_KEY, JSON.stringify(tags))
  }

  return { excludeOn, excludeTags, excludedIds, setExclude }
})
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix frontend run test:run -- src/stores/exclude.test.ts`
Expected: PASS，5 passed

- [ ] **Step 5: 从 filter.test.ts 删掉已搬走的 describe 块**

删除 `frontend/src/stores/filter.test.ts` 第 91-119 行整个 `describe('filter excludedIds（按标签全局排除）', ...)` 块（含其 `beforeEach`）。文件顶部第 5 行的 `import { useProjectTagsStore } from '@/stores/projectTags'` 一并删除（删块后无人使用）。

**不要动** `describe('filter store')` 与 `describe('filteredPayNodes(3B)')` 两块。

- [ ] **Step 6: 跑两个 store 的测试确认都绿**

Run: `npm --prefix frontend run test:run -- src/stores/exclude.test.ts src/stores/filter.test.ts`
Expected: PASS，两文件共 12 passed（exclude 5 + filter 7）

- [ ] **Step 7: typecheck**

Run: `npm --prefix frontend run typecheck`
Expected: 无错误

- [ ] **Step 8: 提交**

```bash
git add frontend/src/stores/exclude.ts frontend/src/stores/exclude.test.ts frontend/src/stores/filter.test.ts
git commit -m "feat(store): V4.5.3 T1 新建 exclude store(全局标签排除),暂无消费方

从 filter.ts 摘出 excludeOn/excludeTags/excludedIds/setExclude 四个成员,
逻辑与 localStorage key 一字不改。测试整体搬自 filter.test.ts 并补一条
key 字面量断言(改 key 会静默清空现网用户配置)。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 原子切换全部 10 个排除类消费方

**必须一次做完，中途不拆提交** —— 见开头「中间态警告」。

**Files:**
- Modify: `frontend/src/stores/filter.ts`（删 ① 类成员，内部改用 `useExcludeStore`）
- Modify: `frontend/src/views/OverviewView.vue:9,33,53`
- Modify: `frontend/src/views/CostDetailView.vue:7,45,61`
- Modify: `frontend/src/views/MilestoneView.vue:6,39,59,62-64`
- Modify: `frontend/src/views/BoardView.vue:6,34,76`
- Modify: `frontend/src/views/CalendarView.vue:5,35,58`
- Modify: `frontend/src/views/PayNodesView.vue:8,31,45-46`
- Modify: `frontend/src/views/PayProjectsView.vue:5,32,50-51`
- Modify: `frontend/src/components/ProjectTagsCard.vue:4,7,14-15`
- Modify: `frontend/src/components/DashMetrics.vue:5,11,18`
- Modify: `frontend/src/components/OrgRanking.vue:4,13,27-28`
- Modify: `frontend/src/components/PaymentL4Table.vue:4,11,18-19`
- Modify: `frontend/src/components/NoStageProjectsTable.vue:5,16,20`
- Test: `frontend/src/views/CostDetailView.test.ts:12,200`
- Test: `frontend/src/views/MilestoneView.test.ts:16,73`
- Test: `frontend/src/views/OverviewView.test.ts:10,241,252`

**Interfaces:**
- Consumes: Task 1 的 `useExcludeStore()`。
- Produces: `filter.ts` 从此只剩回款域筛选成员（Task 4 据此更名）。

**两种改法**（按文件是否还用到 ② 类成员区分）：

- **A 类 —— 只用 ① 的 3 个文件**（`CostDetailView.vue` / `MilestoneView.vue` / `ProjectTagsCard.vue`）：整个把 `useFilterStore` 换成 `useExcludeStore`，变量名 `filter` 保持不变（少改一行是一行，减少 diff 噪声）。
- **B 类 —— ① ② 都用的 9 个文件**：保留原 `filter` 变量，**另加** `const exclude = useExcludeStore()`，把 `filter.excludeOn` / `filter.excludedIds` 改为 `exclude.xxx`，其余 `filter.xxx` 不动。

- [ ] **Step 1: 先改 filter.ts（删 ① 成员，内部改用 exclude store）**

在 `frontend/src/stores/filter.ts` 中：

删除第 5 行 `import { useProjectTagsStore } from '@/stores/projectTags'`，改为：

```ts
import { useExcludeStore } from './exclude'
```

删除第 10-11 行两个 KEY 常量、第 13-24 行 `loadExcludeTags` 函数、第 65-67 行三行（`projectTags`/`excludeOn`/`excludeTags`）、第 69-77 行 `excludedIds` computed、第 112-117 行 `setExclude` 函数。

在 `const scoped = useScopedProjects()` 下一行加：

```ts
  const exclude = useExcludeStore()
```

把 `filteredPayNodes` 与 `filteredProjects` 两个 computed 里的排除项改为读 exclude store：

```ts
  const filteredPayNodes = computed(() =>
    filterPayNodes(payNodeRowsAll.value, {
      dateStart: dateStart.value, dateEnd: dateEnd.value, viewMode: viewMode.value, viewL4: viewL4.value, viewPM: viewPM.value,
      excludeActive: exclude.excludeOn, excludedIds: exclude.excludedIds,
    }),
  )
  const filteredProjects = computed(() =>
    filterProjects(data.data?.projects ?? [], {
      viewMode: viewMode.value, viewL4: viewL4.value, viewPM: viewPM.value,
      excludeActive: exclude.excludeOn, excludedIds: exclude.excludedIds,
    }),
  )
```

return 块删掉 `excludeOn, excludeTags, excludedIds, setExclude,` 那一行，最终为：

```ts
  return {
    dateStart, dateEnd, viewMode, viewL4, viewPM,
    l4Options, pmOptions, filteredPayNodes, filteredProjects, payRecordsAll,
    setDateRange, setPreset, setViewGlobal, setViewL4, setViewPM,
  }
```

- [ ] **Step 2: 跑 typecheck，让它列出所有待改消费方**

Run: `npm --prefix frontend run typecheck`
Expected: **FAIL**，报一批 `Property 'excludeOn' does not exist` / `'excludedIds'` / `'setExclude'` / `'excludeTags'`。这份报错清单就是 Step 3 的工作清单，**逐条改完为止**。

- [ ] **Step 3: 改 A 类 3 个文件（整体换 store）**

`views/CostDetailView.vue` —— 第 7 行改为 `import { useExcludeStore } from '@/stores/exclude'`，第 45 行改为 `const filter = useExcludeStore()`。第 61 行不动。

`views/MilestoneView.vue` —— 第 6 行改为 `import { useExcludeStore } from '@/stores/exclude'`，第 39 行改为 `const filter = useExcludeStore()`。第 59、62-64 行不动。

`components/ProjectTagsCard.vue` —— 第 4 行改为 `import { useExcludeStore } from '@/stores/exclude'`，第 7 行改为 `const filter = useExcludeStore()`。第 14-15 行不动。

- [ ] **Step 4: 改 B 类 9 个文件（加 exclude store，只改排除两项）**

每个文件都做同样三件事：① 在既有 `import { useFilterStore } from '@/stores/filter'` 下加一行 `import { useExcludeStore } from '@/stores/exclude'`；② 在 `const filter = useFilterStore()` 下加一行 `const exclude = useExcludeStore()`；③ 把 `filter.excludeOn` → `exclude.excludeOn`、`filter.excludedIds` → `exclude.excludedIds`。

逐文件的第 ③ 处改动（**下列行号是本 task 开始时的行号；做完 ①② 后每个文件会各下移 2 行，请按内容定位**）：

- `views/OverviewView.vue:53` → `return filter.excludeOn ? ...` 改为 `return exclude.excludeOn ? all.filter((p) => !exclude.excludedIds[p.projectId]) : all`
- `views/BoardView.vue:76` → `excludeActive: exclude.excludeOn, excludedIds: exclude.excludedIds,`
- `views/CalendarView.vue:58` → `exclude.excludeOn ? allNodes.value.filter((n) => !exclude.excludedIds[n.projectId]) : allNodes.value)`
- `views/PayNodesView.vue:45-46` → `excludeActive: exclude.excludeOn,` / `excludedIds: exclude.excludedIds,`
- `views/PayProjectsView.vue:50-51` → 同上两行
- `components/DashMetrics.vue:18` → `{ excludeActive: exclude.excludeOn, excludedIds: exclude.excludedIds, viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM },`
- `components/OrgRanking.vue:27-28` → `excludeActive: exclude.excludeOn,` / `excludedIds: exclude.excludedIds,`
- `components/PaymentL4Table.vue:18-19` → 同上两行
- `components/NoStageProjectsTable.vue:20` → `excludeActive: exclude.excludeOn, excludedIds: exclude.excludedIds,`

- [ ] **Step 5: 改 3 个测试文件的 store 引用**

`views/CostDetailView.test.ts` —— 第 12 行改为 `import { useExcludeStore } from '@/stores/exclude'`；第 200 行改为 `useExcludeStore().setExclude(true, ['排除标签'])`。

`views/MilestoneView.test.ts` —— 第 16 行改为 `import { useExcludeStore } from '@/stores/exclude'`；第 73 行改为 `const f = useExcludeStore()`。（该用例 spy 的是 `setExclude`，现在归 exclude store。）

`views/OverviewView.test.ts` —— 第 10 行改为 `import { useExcludeStore } from '@/stores/exclude'`；第 241 行改为 `const filter = useExcludeStore(); filter.setExclude(true, ['排除标签'])`；第 252 行改为 `const filter = useExcludeStore(); filter.setExclude(false, ['排除标签'])`。

- [ ] **Step 6: typecheck 必须绿**

Run: `npm --prefix frontend run typecheck`
Expected: 无错误。**若仍有 `excludeOn`/`excludedIds` 相关报错，说明 Step 3/4 漏改了文件，回去补完**。

- [ ] **Step 7: 跑全量 vitest**

Run: `npm --prefix frontend run test:run`
Expected: 全绿。

**本仓 V1.6.8 教训：换源型任务只跑窄单测必漏**（当时 3 个 task 各自只跑自己的窄单测，漏了 FilterBar/DataQualityView/OverviewView 的 fixture 回归）。这一步不许省，也不许只跑改动过的那几个文件。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/stores/filter.ts frontend/src/views/OverviewView.vue frontend/src/views/CostDetailView.vue frontend/src/views/MilestoneView.vue frontend/src/views/BoardView.vue frontend/src/views/CalendarView.vue frontend/src/views/PayNodesView.vue frontend/src/views/PayProjectsView.vue frontend/src/components/ProjectTagsCard.vue frontend/src/components/DashMetrics.vue frontend/src/components/OrgRanking.vue frontend/src/components/PaymentL4Table.vue frontend/src/components/NoStageProjectsTable.vue frontend/src/views/CostDetailView.test.ts frontend/src/views/MilestoneView.test.ts frontend/src/views/OverviewView.test.ts
git commit -m "refactor(store): V4.5.3 T2 排除类状态全量切到 exclude store

10 个消费方(3 个整体换 store + 7 个加 exclude 并存)一次切完,
filter.ts 删掉 4 个排除成员、内部改用 useExcludeStore 取排除态。
排除状态自此只有一份 ref,中间态结束。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 首页脱钩 + `paymentBand` 收口

**Files:**
- Modify: `frontend/src/lib/overview.ts:4,92-160`
- Modify: `frontend/src/views/OverviewView.vue:9,33,60-67`
- Test: `frontend/src/lib/overview.test.ts:147`

**Interfaces:**
- Consumes: Task 2 后 `OverviewView` 已用 `exclude` store 取排除态。
- Produces: `paymentBand(rows: PayNodeRow[], now: Date, projects?: Project[], paymentRecords?: Record<string, PaymentRecordsEntry>): PaymentBand` —— 四参签名，恒按自然年度算。

- [ ] **Step 1: 先删掉那条依赖区间参数的测试用例**

删除 `frontend/src/lib/overview.test.ts` 中调用 `paymentBand(rows, now, undefined, paymentRecords, '2026-01-01', '2026-06-30')` 的**整个 `it` 块**（含其 `rows` / `paymentRecords` 局部变量与三条 `expect`，即 `:147` 上下那一整个用例）。该用例验证的是即将删除的参数。

**其余四处 `paymentBand(...)` 调用与断言一律不动**（`:111` / `:131` / `:163` / `:168`）—— 它们钉的正是首页改造后的目标行为，是本期的回归安全网。

- [ ] **Step 2: 运行测试确认仍然全绿**

Run: `npm --prefix frontend run test:run -- src/lib/overview.test.ts`
Expected: PASS（少了一个用例，其余全绿）

- [ ] **Step 3: 改 `lib/overview.ts` —— 删 start/end 与 hasRange 分支**

第 4 行 import 改为（`inRange` 删掉后在本文件已无人用，`actualInRange` 第 42 行 `computeKpis` 仍在用，**必须保留**）：

```ts
import { actualInRange } from './paymentRange'
```

第 92-97 行的函数注释，把提到 start/end 的两句改为：

```ts
 * projects 可选:传入时 yearActual 改为遍历项目集(排除异常)汇总流水，
 * 共享项目集与异常排除;年度分子按本年(startsWith(year))过滤,与 /payment 已回款(全时)口径不同，
 * 含无收款节点项目的流水；未传时退化到按节点项目去重的旧逻辑(向后兼容)。
 * V4.5.3 起【不接受日期区间】:唯一调用方 OverviewView 的文案写死「年度回款进度」,
 * 接受区间会让标签与数据不符(用户在 /payment 设「本季」,首页显示本季数字却顶着"年度"标签)。
 * 计划侧(yearExpected/delayedTop)固定按 planDate.startsWith(year) 过滤。*/
```

第 98-105 行签名改为：

```ts
export function paymentBand(
  rows: PayNodeRow[],
  now: Date,
  projects?: Project[],
  paymentRecords?: Record<string, PaymentRecordsEntry>,
): PaymentBand {
```

第 111-114 行改为：

```ts
  // 计划侧固定按自然年度前缀匹配(不接受区间,理由见函数注释)
  const planInScope = (planDate: string): boolean => planDate.startsWith(year)
```

第 116-119 行注释改为：

```ts
  // yearActual：优先按 projects 遍历(排除异常，含无收款节点项目流水；共享项目集与异常排除，
  // 年度分子按本年过滤，与 computeKpis 全时口径不同)；
  // 否则若传入 paymentRecords 则退化按节点项目去重求和；否则退化节点 receivedAmount 之和
```

第 124-135 行的 `for (const p of projects)` 循环体，删掉 `if (hasRange)` 分支只留 else 分支：

```ts
    for (const p of projects) {
      if (isAnomalous(p)) continue
      const records = paymentRecords[p.projectId]?.records
      yearActual += (records ?? []).reduce(
        (s, r) => s + (String(r.date ?? '').startsWith(year) ? Number(r.amount ?? 0) : 0),
        0,
      )
    }
```

第 138-153 行的退化路径同样处理：

```ts
    const seen = new Set<string>()
    for (const n of rows) {
      if (!seen.has(n.projectId)) {
        seen.add(n.projectId)
        const records = paymentRecords[n.projectId]?.records
        // 只累加本年流水，与 yearExpected 年度前缀口径对齐
        yearActual += (records ?? []).reduce(
          (s, r) => s + (String(r.date ?? '').startsWith(year) ? Number(r.amount ?? 0) : 0),
          0,
        )
      }
    }
```

第 154-160 行的 else 分支与第 162-178 行**一律不动**。

- [ ] **Step 4: 跑 overview 测试，四条安全网必须仍绿**

Run: `npm --prefix frontend run test:run -- src/lib/overview.test.ts`
Expected: PASS

**若变红，说明删 `hasRange` 分支时误伤了年度分支** —— 不许改断言来迁就实现，回去查实现。

- [ ] **Step 5: 改 `views/OverviewView.vue` —— 停止消费回款域筛选**

删除 `import { useFilterStore } from '@/stores/filter'` 那一行（Task 2 已在其下加的 `useExcludeStore` import **保留**）。

删除 `const filter = useFilterStore()` 那一行（Task 2 已在其下加的 `const exclude = useExcludeStore()` **保留**）。

**不写死行号**：Task 2 已在这两行下方各插入一行，用内容定位而非行号。

把 `const band = computed(() => paymentBand(` 那一段改为（去掉末三个实参：`filter.payRecordsAll` 换成同源的 `scoped.value?.paymentRecords`，两个日期整删）：

```ts
const band = computed(() => paymentBand(
  paymentNodeRows(scoped.value?.paymentNodes, projects.value, data.data?.projectPmis),
  new Date(),
  projects.value,
  scoped.value?.paymentRecords,
))
```

Task 2 里改过的 `baseProjects`（`return exclude.excludeOn ? ...`）**不动**。

- [ ] **Step 6: typecheck + 首页测试**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run test:run -- src/views/OverviewView.test.ts src/lib/overview.test.ts`
Expected: typecheck 无错误，两测试文件全绿

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/overview.ts frontend/src/views/OverviewView.vue frontend/src/lib/overview.test.ts
git commit -m "fix(overview): V4.5.3 T3 首页不再消费回款域日期区间

修真实缺陷:首页文案写死「年度回款进度」,数值却走 /payment 的日期区间
——用户点「本季」后首页显示本季数字却顶着"年度"标签。默认区间恰为本年
1/1-12/31 与年度同值,故平时看不出来。

首页脱钩后 paymentBand 的 start/end 再无生产调用方,一并删参数与
hasRange 分支,让函数名与行为一致。inRange/actualInRange 本身不动
(另有 calendar/ledger/payDashboard 等大量消费方)。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `filter.ts` → `paymentFilter.ts` 更名 + 守卫测试升级

**Files:**
- Create: `frontend/src/stores/paymentFilter.ts`（由 `filter.ts` 更名而来）
- Create: `frontend/src/stores/paymentFilter.test.ts`（由 `filter.test.ts` 更名而来）
- Delete: `frontend/src/stores/filter.ts`、`frontend/src/stores/filter.test.ts`
- Modify: `frontend/src/layout/FilterBar.vue:3,5`
- Modify: 4 个 view + 5 个组件的 import 行（清单见 Step 3）
- Modify: 10 个测试文件的 import 行（清单见 Step 4）
- Modify: `frontend/src/views/__pageHeader.test.ts:32-39`
- Modify: `frontend/src/version.ts`

**Interfaces:**
- Consumes: Task 2 后的 `filter.ts`（已只剩回款域筛选成员）。
- Produces: `usePaymentFilterStore()`，store id `'paymentFilter'`，成员 `dateStart` / `dateEnd` / `viewMode` / `viewL4` / `viewPM` / `l4Options` / `pmOptions` / `filteredPayNodes` / `payRecordsAll` + `setDateRange` / `setPreset` / `setViewGlobal` / `setViewL4` / `setViewPM`。

- [ ] **Step 1: 用 git mv 更名两个文件（保留改动历史）**

```bash
git mv frontend/src/stores/filter.ts frontend/src/stores/paymentFilter.ts
git mv frontend/src/stores/filter.test.ts frontend/src/stores/paymentFilter.test.ts
```

- [ ] **Step 2: 改新 store 内部（函数名、store id、删死代码）**

`frontend/src/stores/paymentFilter.ts`：

`export const useFilterStore = defineStore('filter', () => {` 改为：

```ts
// 回款域页面级筛选。【仅服务回款域 5 页】(/payment、/payment/{projects,nodes,board,calendar})——
// 这 5 个也正是 router 里唯一不带 hideFilter 的路由,即唯一能看见 FilterBar 的页面。
// 域外页面看不到 FilterBar 却能读到这里的值,就会出现「数据被筛过、用户无从察觉」的错标
// (V4.5.3 修的首页「年度回款进度」即此)。守卫见 views/__pageHeader.test.ts。
// 全局标签排除属另一类状态,在 stores/exclude.ts;本 store 单向依赖它,反向依赖绝不可引入。
export const usePaymentFilterStore = defineStore('paymentFilter', () => {
```

删除 `filteredProjects` computed（全仓零消费方）及 return 块里的 `filteredProjects,`；同步删掉顶部 import 里已无人使用的 `filterProjects`，即第 7 行改为：

```ts
import { paymentNodeRows } from '@/lib/paymentPmis'
```

**`payRecordsAll` 保留，不要顺手删掉** —— 它虽是 `scoped.paymentRecords` 的纯转发、语义上不属于"筛选"，但 `DashMetrics` / `OrgRanking` / `PaymentL4Table` / `BoardView` / `PayProjectsView` 五个回款域消费方在用。消除这层转发是另一件事，本期明确不做（spec §3.1 承重④、§5）。

- [ ] **Step 3: 改 10 个源文件的 import 与调用**

每个文件把 `import { useFilterStore } from '@/stores/filter'` 改为 `import { usePaymentFilterStore } from '@/stores/paymentFilter'`，并把 `useFilterStore()` 改为 `usePaymentFilterStore()`（变量名 `filter` / `f` 保持不变）：

| 文件 | import 行 | 调用行 |
|---|---|---|
| `layout/FilterBar.vue` | 3 | 5（`const f = ...`） |
| `views/BoardView.vue` | 6 | 34 |
| `views/CalendarView.vue` | 5 | 35 |
| `views/PayNodesView.vue` | 8 | 31 |
| `views/PayProjectsView.vue` | 5 | 32 |
| `components/DashMetrics.vue` | 5 | 11 |
| `components/OrgRanking.vue` | 4 | 13 |
| `components/PaymentL4Table.vue` | 4 | 11 |
| `components/NoStageProjectsTable.vue` | 5 | 16 |
| `components/TrendCard.vue` | 3 | 9 |

- [ ] **Step 4: 改 10 个测试文件的 import 与调用**

同样的替换（`useFilterStore` → `usePaymentFilterStore`，`@/stores/filter` → `@/stores/paymentFilter`）：

**下表行号为 Task 1/2/3 改动后的当前行号，仅作定位参考；以实际文件内容为准，逐个文件全文替换不要漏。**

| 文件 | 出现行 |
|---|---|
| `stores/paymentFilter.test.ts` | 全文替换（**不给行号** —— Task 1 Step 5 已从该文件删掉 29 行，原行号全部失效）。第 3 行 import 改为 `import { usePaymentFilterStore } from './paymentFilter'`，其余 8 处 `useFilterStore()` 调用（含未被调用的 `withData()` 辅助函数内那处）一并替换 |
| `components/DashMetrics.test.ts` | 8、13 |
| `components/NoStageProjectsTable.test.ts` | 9、17 |
| `components/OrgRanking.test.ts` | 7、12 |
| `components/PaymentL4Table.test.ts` | 8、79、98、109、119、158、179、197 |
| `components/TrendCard.test.ts` | 8、10 |
| `layout/FilterBar.test.ts` | 6、40、52 |
| `views/CalendarView.test.ts` | 10、17 |
| `views/DashboardView.test.ts` | 6、12 |
| `views/PayNodesView.test.ts` | 6、31、145 |
| `views/PayProjectsView.test.ts` | 7、22、124、137 |

`paymentFilter.test.ts` 顶部两个 `describe` 的标题也顺手改准：`'filter store'` → `'paymentFilter store'`，`'filteredPayNodes(3B)'` 保持不变。

- [ ] **Step 5: 改写到期的冻结基线守卫测试**

`frontend/src/views/__pageHeader.test.ts` 第 32-39 行整个 `it` 块替换为：

```ts
  it('hideFilter 页面不得引用 usePaymentFilterStore(回款域筛选不外泄)', () => {
    // V4.4.8 那条「不得新增对 useFilterStore 的引用」的冻结基线,到 V4.5.3(第三期)到期,升级为结构守卫。
    // 以 router/index.ts 为单一来源解析,不维护手工白名单 —— 今后新增的 hideFilter 页面自动纳入。
    // 看得见 FilterBar 的页面才准读回款域筛选;看不见却读得到,就是「数据被筛过、用户无从察觉」。
    const routerSrc = readFileSync(resolve(viewsDir, '../router/index.ts'), 'utf-8')
    const hidden: string[] = []
    // 按 `{ path:` 切块 —— 每块即一条路由(单行或跨行皆可),块内同时出现 hideFilter 才算数
    for (const block of routerSrc.split(/\{\s*path:/).slice(1)) {
      if (!block.includes('hideFilter: true')) continue
      const m = block.match(/component:\s*([A-Za-z0-9_]+)/)
        ?? block.match(/import\('@\/views\/([A-Za-z0-9_]+)\.vue'\)/)
      if (m) hidden.push(m[1])
    }
    // 自证:正则一旦失配会返回空数组,下面的循环空跑、"零个文件违规"恒真通过(本仓最常见的假绿形态)。
    // 故先钉住解析结果规模 —— 当前 26 条 hideFilter 路由。
    expect(hidden.length, 'router 解析失配:hideFilter 路由数异常').toBeGreaterThan(20)
    for (const name of hidden) {
      const file = `${name}.vue`
      if (!allViews().includes(file)) continue
      expect(read(file), `${file} 是 hideFilter 页面,不得引用 usePaymentFilterStore`)
        .not.toContain('usePaymentFilterStore')
    }
  })
```

- [ ] **Step 6: 反向验证守卫真的会红（这一步不许跳过）**

本仓已连续四次出现「专为抓 bug 写的测试恒绿」。手工制造违规，确认守卫变红：

```bash
# 1) 临时在一个 hideFilter 页面里加一行违规引用
printf '\n// TEMP-GUARD-CHECK\nimport { usePaymentFilterStore } from "@/stores/paymentFilter"\n' >> frontend/src/views/CostDetailView.vue
npm --prefix frontend run test:run -- src/views/__pageHeader.test.ts
```

Expected: **FAIL**，报 `CostDetailView.vue 是 hideFilter 页面,不得引用 usePaymentFilterStore`

```bash
# 2) 撤销临时改动
git checkout frontend/src/views/CostDetailView.vue
npm --prefix frontend run test:run -- src/views/__pageHeader.test.ts
```

Expected: PASS

**再验一次「自证断言」本身有效**：把守卫里的 split 正则临时改成一个匹配不到的串（如 `/\{\s*pathXX:/`），跑测试应报 `router 解析失配:hideFilter 路由数异常`（而不是绿）；确认后改回。

- [ ] **Step 7: 改版本号**

`frontend/src/version.ts`：

```ts
export const APP_VERSION = 'V4.5.3'
export const RELEASE_DATE = '2026-07-27'
```

- [ ] **Step 8: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿 —— py_compile OK、ruff OK、pytest 通过数与 V4.5.2 持平（后端零改动）、前端 typecheck OK + vitest 全绿 + build OK。

已知无害警告（既有、非本期引入）：`>500KB` 单 chunk、esbuild CSS 注释。

- [ ] **Step 9: 确认全仓已无 `useFilterStore` 残留**

Run: `git grep -n "useFilterStore\|stores/filter'" -- frontend/src`
Expected: **零输出**。有输出说明 Step 3/4 漏改。

- [ ] **Step 10: 提交**

```bash
git add frontend/src/stores/paymentFilter.ts frontend/src/stores/paymentFilter.test.ts frontend/src/layout/FilterBar.vue frontend/src/views/BoardView.vue frontend/src/views/CalendarView.vue frontend/src/views/PayNodesView.vue frontend/src/views/PayProjectsView.vue frontend/src/components/DashMetrics.vue frontend/src/components/OrgRanking.vue frontend/src/components/PaymentL4Table.vue frontend/src/components/NoStageProjectsTable.vue frontend/src/components/TrendCard.vue frontend/src/components/DashMetrics.test.ts frontend/src/components/NoStageProjectsTable.test.ts frontend/src/components/OrgRanking.test.ts frontend/src/components/PaymentL4Table.test.ts frontend/src/components/TrendCard.test.ts frontend/src/layout/FilterBar.test.ts frontend/src/views/CalendarView.test.ts frontend/src/views/DashboardView.test.ts frontend/src/views/PayNodesView.test.ts frontend/src/views/PayProjectsView.test.ts frontend/src/views/__pageHeader.test.ts frontend/src/version.ts
git commit -m "refactor(store): V4.5.3 T4 filter.ts 更名 paymentFilter 并收窄为回款域专用

store id filter → paymentFilter,删零消费方的 filteredProjects。
__pageHeader.test.ts 那条 V4.4.8 冻结基线(注释写明「第三期才会拆」)
到期,升级为以 router/index.ts 为单一来源的结构守卫:hideFilter 页面
不得引用 usePaymentFilterStore,今后新增页面自动纳入。守卫已做反向
验证(手工制造违规确认变红)+ 自证断言(解析失配时不静默通过)。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## 收尾（主控执行，不属于任何 task）

- [ ] `PROGRESS.md` 顶部加 V4.5.3 版本条目；backlog 第 364 条「第三期按域迁筛选」由 `[ ]` 改 `[x]` 并写交付结论
- [ ] `git push origin master`（推前 `git status` + `git diff --cached --stat` 核一眼，确认无 `data/` `input/` `*.png` `yitian/` 等未跟踪脏文件混入）
- [ ] 把 §人工目验 4 条交给用户（AI 无浏览器）：
  1. 首页「年度回款进度」数值与改造前一致（默认区间下）
  2. 去 `/payment` 点「本月」→ 回首页，该数值**不再跟着变**（改造前会变，这是本期修复的核心）
  3. `/data` 设一个排除标签 → 首页项目数、`/insight/costdetail`、`/payment` 三处仍同步生效（排除类跨域消费未被拆坏）
  4. `/payment` 设区间后切到 `/payment/projects`、`/payment/nodes`，区间仍保持（回款域内跨页保持未被拆坏）
