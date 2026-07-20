# V2.3.3 三跟进页列排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给三个跟进页（重点项目进展 `/projects/key`、重点商机跟进 `/opportunities/key`、临时重点跟进 `/projects/temp`）的表格列开启点表头排序——除 4 个长文本列外，全部列可排。

**Architecture:** 三页都用共享组件 `DataTable.vue`，它已给每列绑 `:prop="col.key"` + `:sortable="!!col.sortable"`、接通 el-table 原生排序（按 `row[col.key]` 原始值排，formatter 仅影响显示）。现状只是大多数列未标 `sortable`。新增一个纯函数 `withSortable(columns)`：除长文本列（`weekProgress/nextPlan/remark/mainProducts`）外，把每列 `sortable` 置 `true`；三页各对自己的 `ALL_COLUMNS` 外包一层。不写比较器、不改 `DataTable`/后端/`OPP_COLUMNS`。

**Tech Stack:** Vue3 + Vite + TS + Element Plus（el-table 原生排序）；Vitest 单测。

## Global Constraints

- 纯前端改动：**不改** `DataTable.vue`、`server.py`、`schema.py`、`preprocess_data.py`、各行构造 lib 的数据逻辑。
- **不改共享的 `frontend/src/lib/opportunityColumns.ts`（`OPP_COLUMNS`）**——它被 `/opportunities`（商机清单）页共用；商机侧排序标记只在 `OpportunityFollowupView.vue` 本地施加。
- 长文本「不可排」列固定 4 个 key：`weekProgress`、`nextPlan`、`remark`、`mainProducts`。其余列一律可排（含 `customer` 客户名称、`name` 商机名称——它们虽 `wrap:true` 换行展示，但不在排除集，必须可排）。
- 排序口径走 el-table 原生（数值/日期/P1–P4 精确；枚举/中文文本按字符编码、空值穿插）——用户已确认，**不附加比较器、不做空值沉底**。
- 版本单一来源 `frontend/src/version.ts`：`APP_VERSION='V2.3.3'`、`RELEASE_DATE='2026-06-29'`。
- 不使用 emoji。
- 验证：`bash verify.sh` 全绿。新增纯函数先补测试再改实现（TDD）。
- 工作目录：仓库根 `C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection`；前端命令在 `frontend/` 下跑。

---

### Task 1: 共享工具 `withSortable` + 单测

**Files:**
- Create: `frontend/src/lib/columnSort.ts`
- Test: `frontend/src/lib/columnSort.test.ts`

**Interfaces:**
- Consumes: `DataColumn` 接口（来自 `@/components/DataTable.vue`，字段：`key:string`、`label:string`、可选 `width/sortable/formatter/wrap/fixed/num`）。
- Produces:
  - `export const NON_SORTABLE_KEYS: Set<string>`（值 = `{'weekProgress','nextPlan','remark','mainProducts'}`）。
  - `export function withSortable(columns: DataColumn[]): DataColumn[]`——返回新数组、新对象，每列 `sortable = !NON_SORTABLE_KEYS.has(c.key)`，其余字段原样保留，不改入参。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/columnSort.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { withSortable, NON_SORTABLE_KEYS } from './columnSort'
import type { DataColumn } from '@/components/DataTable.vue'

describe('withSortable', () => {
  it('非长文本列一律 sortable=true', () => {
    const cols: DataColumn[] = [
      { key: 'projectId', label: '项目编号' },
      { key: 'contractWan', label: '合同金额(万)', num: true },
      { key: 'followDate', label: '跟进日期' },
    ]
    const out = withSortable(cols)
    expect(out.map((c) => c.sortable)).toEqual([true, true, true])
  })

  it('4 个长文本 key 一律 sortable=false', () => {
    const cols: DataColumn[] = [
      { key: 'weekProgress', label: '本周工作进展', wrap: true },
      { key: 'nextPlan', label: '后续工作计划', wrap: true },
      { key: 'remark', label: '当前进展/风险说明/情况备注', wrap: true },
      { key: 'mainProducts', label: '主要涉及产品', wrap: true },
    ]
    const out = withSortable(cols)
    expect(out.map((c) => c.sortable)).toEqual([false, false, false, false])
  })

  it('覆盖原有 sortable：长文本列原标 true 也会被改为 false', () => {
    const out = withSortable([{ key: 'weekProgress', label: '本周工作进展', sortable: true }])
    expect(out[0].sortable).toBe(false)
  })

  it('客户名称/商机名称虽 wrap 但不在排除集 → 可排（边界）', () => {
    const out = withSortable([
      { key: 'customer', label: '客户名称', wrap: true },
      { key: 'name', label: '商机名称/项目名称', wrap: true },
    ])
    expect(out.map((c) => c.sortable)).toEqual([true, true])
  })

  it('保留其它字段（label/width/wrap/num/fixed/formatter）', () => {
    const fmt = (v: any) => String(v)
    const out = withSortable([
      { key: 'amountWan', label: '预估金额(万元)', width: 120, num: true, formatter: fmt },
      { key: 'projectName', label: '项目名称', width: 200, wrap: true, fixed: 'left' },
    ])
    expect(out[0]).toMatchObject({ key: 'amountWan', label: '预估金额(万元)', width: 120, num: true, formatter: fmt, sortable: true })
    expect(out[1]).toMatchObject({ key: 'projectName', label: '项目名称', width: 200, wrap: true, fixed: 'left', sortable: true })
  })

  it('不改入参（返回新数组/新对象，原对象 sortable 不被原地改写）', () => {
    const input: DataColumn[] = [{ key: 'remark', label: '备注' }]
    const out = withSortable(input)
    expect(out).not.toBe(input)
    expect(out[0]).not.toBe(input[0])
    expect(input[0].sortable).toBeUndefined()
  })

  it('NON_SORTABLE_KEYS 恰为 4 个长文本 key', () => {
    expect([...NON_SORTABLE_KEYS].sort()).toEqual(['mainProducts', 'nextPlan', 'remark', 'weekProgress'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/columnSort.test.ts`
Expected: FAIL —— 无法解析 `./columnSort`（模块不存在 / `withSortable` 未定义）。

- [ ] **Step 3: 写最小实现**

创建 `frontend/src/lib/columnSort.ts`：

```ts
import type { DataColumn } from '@/components/DataTable.vue'

/** 长文本列（大段换行文字），排序无意义，不开启排序。用户钦定 4 列。 */
export const NON_SORTABLE_KEYS = new Set<string>(['weekProgress', 'nextPlan', 'remark', 'mainProducts'])

/**
 * 给列集统一标记可排序：除长文本列(NON_SORTABLE_KEYS)外一律 sortable=true。
 * 其余字段原样保留;返回新数组/新对象,不改入参。
 * 排序口径走 el-table 原生(按 row[col.key] 原始值),不附加比较器。
 */
export function withSortable(columns: DataColumn[]): DataColumn[] {
  return columns.map((c) => ({ ...c, sortable: !NON_SORTABLE_KEYS.has(c.key) }))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/columnSort.test.ts`
Expected: PASS（7 个用例全绿）。

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无类型错误（`DataColumn` 从 `.vue` 导入的类型解析正常——与三个 View 现有写法一致）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/columnSort.ts frontend/src/lib/columnSort.test.ts
git commit -m "feat(V2.3.3): 新增 withSortable 列排序标记工具+单测(除长文本4列外全列可排)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 三页接入 `withSortable` + 版本 V2.3.3 + PROGRESS + 验证

**Files:**
- Modify: `frontend/src/views/KeyProjectsView.vue`（import + `ALL_COLUMNS` 外包，约 `:11` 与 `:66`）
- Modify: `frontend/src/views/TempFollowupView.vue`（import + `ALL_COLUMNS` 外包，约 `:12` 与 `:61`）
- Modify: `frontend/src/views/OpportunityFollowupView.vue`（import + `ALL_COLUMNS` 外包，约 `:11` 与 `:68`）
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: `withSortable`（Task 1，`import { withSortable } from '@/lib/columnSort'`）。
- Produces: 无对外接口（页面行为变更：三页非长文本列可点表头排序）。

- [ ] **Step 1: KeyProjectsView 接入**

在 `frontend/src/views/KeyProjectsView.vue` 顶部 import 区（紧挨 `import { useColumnPrefs } from '@/lib/useColumnPrefs'` 那行之后，约 `:11`）新增一行：

```ts
import { withSortable } from '@/lib/columnSort'
```

把 `ALL_COLUMNS` 定义（当前 `:66`）的右值用 `withSortable([...])` 包起来。即把：

```ts
const ALL_COLUMNS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 160 },
  // … 其余列原样 …
  { key: 'followBy', label: '跟进人', width: 120 },
]
```

改为（仅在数组外加 `withSortable(` 和 `)`，数组内容一字不改；原内联 `sortable: true` 保留无妨，会被覆盖为同值）：

```ts
const ALL_COLUMNS: DataColumn[] = withSortable([
  { key: 'projectId', label: '项目编号', width: 160 },
  // … 其余列原样 …
  { key: 'followBy', label: '跟进人', width: 120 },
])
```

- [ ] **Step 2: TempFollowupView 接入**

在 `frontend/src/views/TempFollowupView.vue` 顶部 import 区（紧挨 `import { useColumnPrefs } from '@/lib/useColumnPrefs'`，约 `:12`）新增：

```ts
import { withSortable } from '@/lib/columnSort'
```

把 `ALL_COLUMNS`（当前 `:61`）右值的数组外包 `withSortable(...)`：

```ts
const ALL_COLUMNS: DataColumn[] = withSortable([
  { key: 'projectId', label: '项目编号', width: 160 },
  // … 其余 25 列原样（含额外可选列）…
  { key: 'milestoneStatus', label: '里程碑状态', width: 120 },
])
```

- [ ] **Step 3: OpportunityFollowupView 接入**

在 `frontend/src/views/OpportunityFollowupView.vue` 顶部 import 区（紧挨 `import { useColumnPrefs } from '@/lib/useColumnPrefs'`，约 `:11`）新增：

```ts
import { withSortable } from '@/lib/columnSort'
```

把合并后的 `ALL_COLUMNS`（当前 `:68`）外包 `withSortable(...)`。即把：

```ts
const ALL_COLUMNS: DataColumn[] = [...OPP_COLUMNS.map(oppToDataColumn), ...FOLLOWUP_COLUMNS]
```

改为：

```ts
const ALL_COLUMNS: DataColumn[] = withSortable([...OPP_COLUMNS.map(oppToDataColumn), ...FOLLOWUP_COLUMNS])
```

> 注意：`oppToDataColumn`（`:54-61`）保持原样，**不要改 `opportunityColumns.ts / OPP_COLUMNS`**。`withSortable` 只作用于本页本地合并数组，`/opportunities` 商机清单页不受影响。

- [ ] **Step 4: 版本号 → V2.3.3**

把 `frontend/src/version.ts` 改为：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V2.3.3'
export const RELEASE_DATE = '2026-06-29'
```

- [ ] **Step 5: PROGRESS.md 记录**

把 `PROGRESS.md:7`（`- 当前版本：**V2.3.2**...`）改为：

```markdown
- 当前版本：**V2.3.3**（子页面局部调整：三跟进页列排序——重点项目进展/重点商机跟进/临时重点跟进，除 4 个长文本列外全列可点表头排序，el-table 原生口径。**纯前端，升级不需点「更新数据」、无新依赖、无新页**）
```

把 `PROGRESS.md:8`（`- 最近更新：...`）改为：

```markdown
- 最近更新：2026-06-29（V2.3.3：三跟进页列排序，纯前端原生排序，无 schema/后端改动）
```

并在 `## 版本（单一来源约定，2026-06-12 起）` 小节里、`- **V2.3.2**（...` 条目**之前**插入一条：

```markdown
- **V2.3.3**（2026-06-29，Z 级·子页面局部调整）：
  - **三跟进页列排序**：`/projects/key`（重点项目进展）、`/opportunities/key`（重点商机跟进）、`/projects/temp`（临时重点跟进）三页表格，除 4 个长文本列（`weekProgress` 本周工作进展 / `nextPlan` 后续工作计划 / `remark` 情况备注 / `mainProducts` 主要涉及产品）外的所有列均可点表头排序。新增纯函数 `frontend/src/lib/columnSort.ts`（`NON_SORTABLE_KEYS` + `withSortable`），三页各对 `ALL_COLUMNS` 外包一层；走 el-table 原生排序（按行对象原始值，数值/日期/P1–P4 精确，枚举/中文按字符编码、空值穿插）。
  - **边界**：不改 `DataTable.vue`、不改共享 `OPP_COLUMNS`（`/opportunities` 商机清单页不受影响）、不改后端/schema。客户名称、商机名称虽换行展示但仍可排。
  - 无 `preprocess_data.py`/`schema.py` 改动 → 升级不需点「更新数据」；无新依赖；无新页面/pageKey。
```

- [ ] **Step 6: 跑前端单测 + 类型 + 构建**

Run: `cd frontend && npm run typecheck && npm run test:run && npm run build`
Expected: typecheck 无错；vitest 全绿（含 Task 1 新增的 `columnSort.test.ts`，且 `KeyProjectsView.test.ts`/`TempFollowupView.test.ts`/`OpportunityFollowupView.test.ts` 仍通过——这三个测试无 sortable/列数断言，不受影响）；build 成功。

- [ ] **Step 7: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（后端 pytest 不受本次纯前端改动影响；前端 typecheck/vitest/build 全绿）。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/views/KeyProjectsView.vue frontend/src/views/TempFollowupView.vue frontend/src/views/OpportunityFollowupView.vue frontend/src/version.ts PROGRESS.md
git commit -m "feat(V2.3.3): 三跟进页列排序接入(除长文本4列外全列可排)+版本V2.3.3

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 验收（实现完成后人工冒烟，非自动步骤）

- 启动 `python server.py` + `cd frontend && npm run dev`，分别打开 `/projects/key`、`/opportunities/key`、`/projects/temp`：
  - 除「本周工作进展/后续工作计划/情况备注/主要涉及产品」外的列表头出现排序箭头，可升/降序。
  - 合同金额(万)、预估金额(万元)、完工%/回款率/消耗比 按数值大小排（非字符串）；各日期列按时间排。
  - 客户、商机名称/项目名称列可排。
  - 切到「历史数据」视图，排序仍可用。
  - `/opportunities`（商机清单）页排序行为无变化（未受影响）。
  - 无 console 报错。
