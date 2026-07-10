# V2.8.4 跟进列宽×2 + /risk 行下钻 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 跟进页「点击填写」富文本列宽翻倍（240→480），并让 /risk 支持点击行下钻到该风险对应项目的 /project/:id。

**Architecture:** 纯前端。改动 1 = 10 处列 `width` 数值改动；改动 2 = RiskFollowupView 加 `clickable @row-click` + `onRow` 下钻（复用 key/temp/payment 现有模式）。后端零改动。

**Tech Stack:** Vue3 + TS + Element Plus + Vitest。

## Global Constraints（每个任务都隐含）

- 交流语言简体中文；**不使用任何 emoji**（符号仅 `→ ↓ ❌ ✕ ▾ ⚠`）。
- 不引框架/第三方依赖；不用 emoji。
- 版本单一来源 `frontend/src/version.ts` → `V2.8.4` / `RELEASE_DATE='2026-07-10'`。
- 后端零改动；升级仅换 dist。
- typecheck 命令：`cd frontend && npm run typecheck`（= vue-tsc --noEmit）。
- TDD（改动 2）：先补测试再改实现。收尾 `bash verify.sh` 全绿。
- commit 结尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

---

## 文件结构

| 文件 | 改动 |
|---|---|
| `views/KeyProjectsView.vue` / `TempFollowupView.vue` / `OpportunityFollowupView.vue` / `RiskFollowupView.vue` / `PaymentKeyFollowupView.vue` | 富文本列 `width: 240`→`480`（各 2 处） |
| `views/RiskFollowupView.vue` | 加 `useRouter` + `onRow` + DataTable `clickable @row-click`（改动 2） |
| `views/RiskFollowupView.test.ts` | mock router 改共享 spy + 加下钻用例 |
| `frontend/src/version.ts` / `PROGRESS.md` | 版本 + 记录 |

---

### Task 1: 富文本列宽 240 → 480（5 视图 10 处）

**Files:** Modify `views/KeyProjectsView.vue`、`views/TempFollowupView.vue`、`views/OpportunityFollowupView.vue`、`views/RiskFollowupView.vue`、`views/PaymentKeyFollowupView.vue`

**统一改法：** 把下列 10 处列定义里的 `width: 240` 改为 `width: 480`，**同一行其余属性（`wrap: true`、`formatter` 等）一字不动**。以「该列 key + `width: 240`」为锚点匹配（行号仅供定位）。

| 视图 | 列 key | 当前行 |
|---|---|---|
| KeyProjectsView.vue | `weekProgress` | 69 |
| KeyProjectsView.vue | `nextPlan` | 70 |
| TempFollowupView.vue | `weekProgress` | 74 |
| TempFollowupView.vue | `nextPlan` | 75 |
| OpportunityFollowupView.vue | `weekProgress` | 54 |
| OpportunityFollowupView.vue | `nextPlan` | 55 |
| RiskFollowupView.vue | `followAction` | 65 |
| RiskFollowupView.vue | `revConclusion` | 66 |
| PaymentKeyFollowupView.vue | `followAction` | 83 |
| PaymentKeyFollowupView.vue | `revConclusion` | 84 |

例（KeyProjectsView）：
```
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true },
```
→
```
  { key: 'weekProgress', label: '本周工作进展', width: 480, wrap: true },
  { key: 'nextPlan', label: '后续工作计划', width: 480, wrap: true },
```
（其余 4 视图同理，只改 `240`→`480`，保留各自的 `formatter` 等。）

- [ ] **Step 1: 逐视图改 10 处 width**（读文件、按锚点改）。

- [ ] **Step 2: 覆盖率自检**

Run: `cd frontend && git grep -nE "key: '(weekProgress|nextPlan|followAction|revConclusion)', label:.*width: 480" -- src/views | wc -l`
Expected: `10`
Run: `cd frontend && git grep -nE "key: '(weekProgress|nextPlan|followAction|revConclusion)', label:.*width: 240" -- src/views`
Expected: 无输出（无 240 残留）

- [ ] **Step 3: 类型检查 + 全量前端测试**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: 无类型错误；vitest 全绿（宽度不改行为，现有测试不受影响）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/KeyProjectsView.vue frontend/src/views/TempFollowupView.vue frontend/src/views/OpportunityFollowupView.vue frontend/src/views/RiskFollowupView.vue frontend/src/views/PaymentKeyFollowupView.vue
git commit -m "feat(followup): 5 跟进页富文本列宽 240→480"
```

---

### Task 2: /risk 行点击下钻 /project/:id

**Files:** Modify `views/RiskFollowupView.vue`、`views/RiskFollowupView.test.ts`

**Interfaces:** `RiskRow.projectId`（`lib/riskRows.ts`，主域权威项目号）；DataTable 已支持 `clickable` + emit `@row-click`。

- [ ] **Step 1: 改测试——mock router 改共享 spy + 加下钻用例（先红）**

`views/RiskFollowupView.test.ts` 第 11 行：
```ts
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
```
替换为（用 `vi.hoisted` 提供一个可断言的共享 push spy）：
```ts
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))
```
在 `describe('RiskFollowupView', () => {` 内、`beforeEach(() => setActivePinia(createPinia()))` 之后新增一行清理：
```ts
  beforeEach(() => pushMock.mockClear())
```
在该 describe 末尾（最后一个 `it` 之后、`})` 之前）追加用例：
```ts
  it('点行下钻到该风险项目 /project/:id', async () => {
    seed()
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    await w.find('.el-table__row').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/project/P1')
  })
```
（`seed()` 造的风险行 projectId = `P1`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts`
Expected: 新用例 FAIL（当前无 row-click，`pushMock` 未被调用）；其余用例仍绿。

- [ ] **Step 3: 改实现** `views/RiskFollowupView.vue`

3a. import：第 2 行 `import { computed, onMounted, ref } from 'vue'` 之后新增一行：
```ts
import { useRouter } from 'vue-router'
```

3b. 在 `const cf = useCrossFilterStore()` 那一行之后新增：
```ts
const router = useRouter()
```

3c. 在 `function editPrefix(...) { ... }` 这个函数**之后**（或 onToggle 之后）新增下钻函数：
```ts
function onRow(row: Record<string, any>) {
  router.push('/project/' + (row as RiskRow).projectId)
}
```

3d. 模板第 171 行的 DataTable 起始标签：
```html
      <DataTable :columns="visibleColumns" :rows="fp.paged.value" :show-count="false" :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange">
```
→ 加 `clickable` 与 `@row-click="onRow"`：
```html
      <DataTable :columns="visibleColumns" :rows="fp.paged.value" :show-count="false" clickable :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange" @row-click="onRow">
```

- [ ] **Step 4: 跑测试 + 类型检查确认通过**

Run: `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts && npm run typecheck`
Expected: 全绿（含新下钻用例）+ 无类型错误。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RiskFollowupView.vue frontend/src/views/RiskFollowupView.test.ts
git commit -m "feat(risk): /risk 点行下钻到该风险项目 /project/:id"
```

---

### Task 3: 版本 bump V2.8.4 + verify + PROGRESS（控制者直接做）

**Files:** Modify `frontend/src/version.ts`, `PROGRESS.md`

- [ ] **Step 1: 版本 bump** `frontend/src/version.ts`

```ts
export const APP_VERSION = 'V2.8.4'
export const RELEASE_DATE = '2026-07-10'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（前端 typecheck/vitest/build + 后端 pytest 零改动）。

- [ ] **Step 3: 更新 `PROGRESS.md`**

在版本历史顶部加入 V2.8.4 条目（Z 级，纯前端）：概述「5 跟进页富文本列宽 240→480；/risk 加行点击下钻 /project/:id（复用 key/temp/payment 模式、编辑单元格 @click.stop 不误跳）；纯前端、升级仅换 dist、无需重启后端/无需点更新数据」。把上一条 V2.8.3 相应降级标注。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.8.4 跟进列宽×2 + /risk 行下钻收官"
```

---

## Self-Review（作者自查）

**1. Spec 覆盖**
- 改动 1（10 处 240→480）→ Task 1 ✅
- 改动 2（/risk 行下钻 + 编辑单元格不误跳）→ Task 2（onRow + clickable + @row-click；RichTextCell/date-picker 的 @click.stop 已存在无需改）✅
- 测试（改动 2 一条下钻用例）→ Task 2 Step 1 ✅
- 版本 V2.8.4 + 后端零改动 → Task 3 ✅

**2. 占位符扫描**：无 TBD/TODO；每步给完整 before→after 或完整命令。行号为定位提示、以锚点文本匹配。

**3. 类型/命名一致性**：`onRow(row)` 用 `(row as RiskRow).projectId`（RiskRow 已在 RiskFollowupView import）；测试 `pushMock` 经 `vi.hoisted` 供 mock 与断言共享；DataTable `clickable`/`@row-click` 与 KeyProjectsView 现有用法一致。
