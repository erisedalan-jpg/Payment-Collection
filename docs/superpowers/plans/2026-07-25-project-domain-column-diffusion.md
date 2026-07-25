# 项目域字段扩散（A 期 / V4.4.4）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `/projects` 加计划/实际关闭时间列，把项目域全量列扩散到「重点跟进」四页的选列与三页的范围设置，并建立「今后 `/projects` 新增列自动流入四页」的结构性保证。

**Architecture:** 把 `/projects` 的列定义提为 `projectList.ts` 的单一来源 `PROJECT_DOMAIN_COLUMNS`；英文三页（`/projects/key`、`/projects/temp`、`/payment/key`）用 `borrowProjectColumns()` 借列、用 `decorateProjectDomain()` 把值并到行上；`/risk` 的列由行键动态推导，故只用 `decorateProjectDomainMapped()` 按 `RISK_KEY_MAP` 写入**中文键**（绝不写英文键）。四条契约测试守住扩散不退化。

**Tech Stack:** Vue 3 + TypeScript + Pinia + Element Plus + Vitest。纯前端，不动后端与数据管线。

**Spec:** `docs/superpowers/specs/2026-07-25-project-domain-column-diffusion-design.md`

## Global Constraints

- **版本 V4.4.4**（Z 级，基线 V4.4.3）。版本号单一来源 `frontend/src/version.ts`，只改此处。
- **纯前端，无需点「更新数据」**；不动 `preprocess_data.py` 及任何后端文件；不新增 `data/*.json`。
- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- **绝不改动任何现有列/字段 key 的名称**（含 `RISK_SCOPE_CATALOG` 的中文键）。已存的范围条件按 key 序列化在 `data/temp_followup.json` 等文件里，改名会让用户配好的范围**静默失效**——条件仍显示、永远匹配不到、无报错。
- 所有新列**一律不进 `DEFAULT_VISIBLE`**（默认不展示，用户钦定）。
- 新增函数参数一律**放在参数表末尾且可选**，使现有调用点与测试无需同步改造即可编译通过。
- 提交时**绝不 `git add -A` / `git add .`**；工作树里有未跟踪的 `yitian/` 诊断目录，只 `git add` 本任务明确改动的文件。
- 每个 Task 结束提交；全部完成后跑 `bash verify.sh` 必须全绿。

---

## File Structure

| 文件 | 职责 | Task |
|---|---|---|
| `frontend/src/lib/projectList.ts` | 新增 2 字段 + `PROJECT_DOMAIN_COLUMNS` 单一来源 + `borrowProjectColumns` + `decorateProjectDomain` | 1 |
| `frontend/src/views/ProjectsView.vue` | 改吃单一来源；传 milestones；两列默认隐藏 | 2 |
| `frontend/src/lib/keyProjects.ts` + `views/KeyProjectsView.vue` | `/projects/key` 行 decorate + 借列（含反推式 `DEFAULT_VISIBLE` 修正） | 3 |
| `frontend/src/lib/tempFollowup.ts` + `components/TempInstancePanel.vue` | `/projects/temp` 行 decorate + 借列 | 4 |
| `frontend/src/lib/paymentKeyFollowup.ts` + `views/PaymentKeyFollowupView.vue` | `/payment/key` 行 decorate + 借列 | 5 |
| `frontend/src/lib/riskRows.ts` + `views/RiskFollowupView.vue` | `/risk` 中文键 decorate（不借列）+ `RISK_SCOPE_CATALOG` 补 7 条 | 6 |
| `frontend/src/lib/tempScope.ts` + `lib/tempFollowup.ts` | 范围设置 `FIELD_CATALOG` 补 3 条 + `buildScopeInputs` 产出 3 键 | 7 |
| `frontend/src/lib/projectDomainColumns.contract.test.ts` | 契约① 映射完备 + ② 值可达（契约③④ 分散在各 view 测试，见 Task 8 说明） | 8 |
| `version.ts` / `PROGRESS.md` / `deploy/升级手册-V4.4.4.md` | 收尾 | 9 |

---

## Task 1: `projectList.ts` — 单一来源与扩散基础设施

**Files:**
- Modify: `frontend/src/lib/projectList.ts`
- Test: `frontend/src/lib/projectList.test.ts`

**Interfaces:**
- Consumes: `MilestoneItem`（`@/types/analysis`，字段 `name`/`planDate`/`actualDate`）、`DataColumn`（`@/components/DataTable.vue`）。
- Produces（后续所有 Task 依赖）:
  - `ProjectRow` 新增 `plannedCloseDate: string | null`、`actualCloseDate: string | null`
  - `buildProjectRows(projects, pmisMap, assignments?, milestones?)` — 第 4 参 `milestones?: Record<string, any[]>`
  - `PROJECT_DOMAIN_COLUMNS: DataColumn[]`（26 列，不含 action）
  - `BORROW_EXCLUDE: Set<string>`
  - `BORROWABLE_KEYS: string[]`（= 全部列 key − `BORROW_EXCLUDE`，供各 view 测试断言）
  - `borrowProjectColumns(ownKeys: Set<string>): DataColumn[]`
  - `decorateProjectDomain<T extends { projectId: string }>(rows: T[], prMap: Map<string, ProjectRow>): T[]`
  - `decorateProjectDomainMapped<T extends { projectId: string }>(rows: T[], prMap: Map<string, ProjectRow>, keyMap: Record<string, string>, exclude: Set<string>): T[]`

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/lib/projectList.test.ts` 末尾：

```ts
import {
  PROJECT_DOMAIN_COLUMNS, BORROW_EXCLUDE, borrowProjectColumns,
  decorateProjectDomain, decorateProjectDomainMapped, type ProjectRow,
} from './projectList'

describe('V4.4.4 关闭时间取数', () => {
  const MS = { X1: [
    { name: '终验', planDate: '2026-05-01', actualDate: '' },
    { name: '项目关闭', planDate: '2026-08-01', actualDate: '2026-08-20' },
  ] }
  it('从 projectMilestones 取「项目关闭」的计划/实际日', () => {
    const [r] = buildProjectRows([proj({ projectId: 'X1' })], {}, undefined, MS as any)
    expect(r.plannedCloseDate).toBe('2026-08-01')
    expect(r.actualCloseDate).toBe('2026-08-20')
  })
  it('无该里程碑项 → null（不回退其他节点）', () => {
    const [r] = buildProjectRows([proj({ projectId: 'X1' })], {}, undefined, { X1: [{ name: '终验', planDate: '2026-05-01' }] } as any)
    expect(r.plannedCloseDate).toBeNull()
    expect(r.actualCloseDate).toBeNull()
  })
  it('不传 milestones 参数 → null（现有调用点不受影响）', () => {
    const [r] = buildProjectRows([proj({ projectId: 'X1' })], {})
    expect(r.plannedCloseDate).toBeNull()
  })
})

describe('V4.4.4 PROJECT_DOMAIN_COLUMNS / borrow', () => {
  it('含两个关闭时间列，且不含 action 列', () => {
    const keys = PROJECT_DOMAIN_COLUMNS.map((c) => c.key)
    expect(keys).toContain('plannedCloseDate')
    expect(keys).toContain('actualCloseDate')
    expect(keys).not.toContain('action')
  })
  it('borrowProjectColumns 排除自有 key 与 BORROW_EXCLUDE', () => {
    const got = borrowProjectColumns(new Set(['projectId', 'projectName'])).map((c) => c.key)
    expect(got).not.toContain('projectId')
    expect(got).not.toContain('projectName')
    expect(got).not.toContain('contractAmount')   // BORROW_EXCLUDE：三页已有 contractWan
    expect(got).toContain('plannedCloseDate')
  })
  it('借入列保留来源的 sortable 定义（tags 数组列不可排序）', () => {
    const tags = borrowProjectColumns(new Set()).find((c) => c.key === 'tags')
    expect(tags?.sortable).toBeFalsy()
  })
})

describe('V4.4.4 decorate', () => {
  const pr = { projectId: 'X1', setupDate: '2020-01-01', tags: ['A'], openRisks: 3,
    plannedCloseDate: '2026-08-01', contractAmount: 1234567 } as unknown as ProjectRow
  const prMap = new Map([['X1', pr]])

  it('decorateProjectDomain 补缺失键、不覆盖已有键', () => {
    const [row] = decorateProjectDomain([{ projectId: 'X1', setupDate: '已有值' }], prMap)
    expect(row.setupDate).toBe('已有值')
    expect((row as any).plannedCloseDate).toBe('2026-08-01')
    expect((row as any).openRisks).toBe(3)
  })
  it('decorateProjectDomain 不写 BORROW_EXCLUDE 内的键', () => {
    const [row] = decorateProjectDomain([{ projectId: 'X1' }], prMap)
    expect((row as any).contractAmount).toBeUndefined()
  })
  it('decorateProjectDomainMapped 只写中文键、绝不写英文键', () => {
    const map = { setupDate: '立项日期', plannedCloseDate: '计划关闭时间' }
    const [row] = decorateProjectDomainMapped([{ projectId: 'X1' }], prMap, map, new Set())
    expect((row as any)['立项日期']).toBe('2020-01-01')
    expect((row as any)['计划关闭时间']).toBe('2026-08-01')
    expect((row as any).setupDate).toBeUndefined()
    expect((row as any).plannedCloseDate).toBeUndefined()
  })
  it('decorateProjectDomainMapped 日期值切到 10 位', () => {
    const withTime = new Map([['X1', { projectId: 'X1', setupDate: '2020-01-01 08:30:00' } as unknown as ProjectRow]])
    const [row] = decorateProjectDomainMapped([{ projectId: 'X1' }], withTime, { setupDate: '立项日期' }, new Set())
    expect((row as any)['立项日期']).toBe('2020-01-01')
  })
  it('decorateProjectDomainMapped 跳过 exclude 内的键', () => {
    const [row] = decorateProjectDomainMapped([{ projectId: 'X1' }], prMap,
      { contractAmount: '项目金额' }, new Set(['contractAmount']))
    expect((row as any)['项目金额']).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts`
Expected: FAIL — `PROJECT_DOMAIN_COLUMNS is not exported` / `plannedCloseDate` 为 undefined。

- [ ] **Step 3: 实现**

在 `frontend/src/lib/projectList.ts` 顶部补 import：

```ts
import type { DataColumn } from '@/components/DataTable.vue'
```

`ProjectRow` 接口在 `actualFinalAcceptDate` 之后追加两行：

```ts
  plannedCloseDate: string | null
  actualCloseDate: string | null
```

`buildProjectRows` 签名与实现改为：

```ts
/** 里程碑项里取「项目关闭」的计划/实际日；缺该项 → null（不回退其他节点）。 */
function closeDates(items: any[] | undefined): { plan: string | null; actual: string | null } {
  const it = (items ?? []).find((m) => m?.name === '项目关闭')
  return { plan: it?.planDate || null, actual: it?.actualDate || null }
}

export function buildProjectRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  assignments?: Record<string, string[]>,
  milestones?: Record<string, any[]>,
): ProjectRow[] {
  return projects.map((p) => {
    // ...原有实现不动...
    const close = closeDates(milestones?.[p.projectId])
    return {
      // ...原有字段不动...
      plannedCloseDate: close.plan,
      actualCloseDate: close.actual,
    }
  })
}
```

在文件末尾追加单一来源与扩散工具（26 列，前 24 列逐字照抄 `ProjectsView.vue:50-78` 的 `ALL_COLUMNS`，去掉末尾 `action`；两个关闭时间列插在实际终验时间之后）：

```ts
const fmtDate = (v: any) => (v ? String(v).slice(0, 10) : '-')
const fmtRatioCell = (v: any) => (v == null ? '-' : (Number(v) * 100).toFixed(1) + '%')

/** 项目域列定义唯一来源。`/projects` 与「重点跟进」四页共用；新增列只加在这里。
 *  不含 action 操作列（那是 /projects 独有的行内入口）。 */
export const PROJECT_DOMAIN_COLUMNS: DataColumn[] = [
  { key: 'projectName', label: '项目名称', width: 220 },
  { key: 'projectId', label: '项目编号', width: 175 },
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'setupDate', label: '立项日期', width: 110, sortable: true, formatter: fmtDate },
  { key: 'originSetupDate', label: '原项目立项日期', width: 130, sortable: true, formatter: fmtDate },
  { key: 'plannedFinalAcceptDate', label: '计划终验时间', width: 120, sortable: true, formatter: fmtDate },
  { key: 'actualFinalAcceptDate', label: '实际终验时间', width: 120, sortable: true, formatter: fmtDate },
  { key: 'plannedCloseDate', label: '计划关闭时间', width: 120, sortable: true, formatter: fmtDate },
  { key: 'actualCloseDate', label: '实际关闭时间', width: 120, sortable: true, formatter: fmtDate },
  { key: 'projectManager', label: '项目经理', width: 96, sortable: true },
  { key: 'orgL4', label: 'L4组', width: 110, sortable: true },
  { key: 'stage', label: '阶段', width: 100 },
  { key: 'progress', label: '完工%', width: 90, sortable: true, formatter: (v) => fmtRatioCell(v) },
  { key: 'riskLevel', label: '风险', width: 96, sortable: true,
    formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'projectLevel', label: '级别', width: 80, sortable: true },
  { key: 'projectType', label: '项目类型', width: 110, sortable: true },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatioCell(v) },
  { key: 'paymentRatio', label: '回款完成率', width: 105, sortable: true, formatter: (v) => fmtRatioCell(v) },
  { key: 'projectStatus', label: '项目状态', width: 100, sortable: true },
  { key: 'health', label: '健康度', width: 96 },
  { key: 'riskReasons', label: '关注原因', width: 220 },
  { key: 'paymentStatus', label: '回款状态', width: 100 },
  { key: 'signUnit', label: '签约单位', width: 180, sortable: true },
  { key: 'tags', label: '标签', width: 160,
    formatter: (v) => (Array.isArray(v) && v.length ? v.join('、') : '') },
  { key: 'top1000', label: 'TOP1000', width: 90 },
  { key: 'quadrant', label: '象限', width: 140 },
]

/** 不外借的列：四页均已有语义相同、单位不同的 contractWan(万)/项目金额(万)，
 *  而本列是元值 + 除万 formatter。同时借入会出现两列合同金额。 */
export const BORROW_EXCLUDE = new Set<string>(['contractAmount'])

/** 供英文三页借列：剔除自有 key 与 BORROW_EXCLUDE。借入列保留来源的 sortable，
 *  不要再套 withSortable —— 那会把 tags/riskReasons 等数组列误开成可排序。 */
export function borrowProjectColumns(ownKeys: Set<string>): DataColumn[] {
  return PROJECT_DOMAIN_COLUMNS.filter((c) => !ownKeys.has(c.key) && !BORROW_EXCLUDE.has(c.key))
}

const DOMAIN_KEYS = PROJECT_DOMAIN_COLUMNS.map((c) => c.key)

/** 每一页都必须能提供的项目域列 key（= 全部列 − 不外借的列）。
 *  各 view 测试据此断言「ALL_COLUMNS 真的接上了 borrowProjectColumns」。 */
export const BORROWABLE_KEYS: string[] = DOMAIN_KEYS.filter((k) => !BORROW_EXCLUDE.has(k))

/** 英文三页：把 ProjectRow 的项目域字段并到行上；已有键不覆盖，只补差集。
 *  必须并到行对象而非渲染时现取 —— 否则排序/列筛选/导出三处读不到值。 */
export function decorateProjectDomain<T extends { projectId: string }>(
  rows: T[], prMap: Map<string, ProjectRow>,
): T[] {
  return rows.map((r) => {
    const pr = prMap.get(r.projectId)
    if (!pr) return r
    const extra: Record<string, unknown> = {}
    for (const k of DOMAIN_KEYS) {
      if (BORROW_EXCLUDE.has(k) || k in r) continue
      extra[k] = (pr as unknown as Record<string, unknown>)[k]
    }
    return Object.keys(extra).length ? { ...r, ...extra } : r
  })
}

/** /risk 专用：按 keyMap 把 ProjectRow 字段写成【中文键】。
 *  绝不写英文键 —— risk 的列由行键动态推导，每个英文键都会各自变成一列。
 *  日期值切到 10 位（risk 动态列不套 fmtDateCell，不切会露出时间戳）。已有键不覆盖。 */
export function decorateProjectDomainMapped<T extends { projectId: string }>(
  rows: T[], prMap: Map<string, ProjectRow>,
  keyMap: Record<string, string>, exclude: Set<string>,
): T[] {
  return rows.map((r) => {
    const pr = prMap.get(r.projectId)
    if (!pr) return r
    const extra: Record<string, unknown> = {}
    for (const [en, zh] of Object.entries(keyMap)) {
      if (exclude.has(en) || zh in r) continue
      const v = (pr as unknown as Record<string, unknown>)[en]
      extra[zh] = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v
    }
    return Object.keys(extra).length ? { ...r, ...extra } : r
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts && npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: 全部 PASS，typecheck 无错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/projectList.ts frontend/src/lib/projectList.test.ts
git commit -m "feat(projects): V4.4.4 项目域列单一来源 + 关闭时间字段 + decorate 基础设施"
```

---

## Task 2: `/projects` 接入单一来源并显示两列

**Files:**
- Modify: `frontend/src/views/ProjectsView.vue:42`（传 milestones）、`:49-80`（ALL_COLUMNS 改吃单一来源）
- Test: `frontend/src/views/ProjectsView.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PROJECT_DOMAIN_COLUMNS`、`buildProjectRows` 第 4 参。
- Produces: `/projects` 的 `ALL_COLUMNS` = `[...PROJECT_DOMAIN_COLUMNS, ACTION_COL]`；`DEFAULT_VISIBLE` 不变（两新列默认隐藏）。

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/views/ProjectsView.test.ts`：

```ts
import { PROJECT_DOMAIN_COLUMNS } from '@/lib/projectList'

it('V4.4.4 两个关闭时间列在选列中存在但默认不可见', async () => {
  const w = await mountProjects()   // 沿用本文件既有挂载 helper
  const keys = (w.vm as any).ALL_COLUMNS.map((c: any) => c.key)
  expect(keys).toContain('plannedCloseDate')
  expect(keys).toContain('actualCloseDate')
  const visible = (w.vm as any).prefs.visibleKeys.value
  expect(visible).not.toContain('plannedCloseDate')
  expect(visible).not.toContain('actualCloseDate')
})

it('V4.4.4 契约③ /projects 自身吃全量单一来源（含 action 列）', async () => {
  const w = await mountProjects()
  const keys = new Set((w.vm as any).ALL_COLUMNS.map((c: any) => c.key))
  for (const c of PROJECT_DOMAIN_COLUMNS) expect(keys.has(c.key)).toBe(true)
  expect(keys.has('action')).toBe(true)
})
```

> `ProjectsView.vue:192` 已 `defineExpose({ ALL_COLUMNS, FILTERABLE, prefs })`，测试可直接读。
> 若本文件尚无挂载 helper，照抄该文件已有用例的挂载方式。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts`
Expected: FAIL — `expect(keys).toContain('plannedCloseDate')` 不通过。

- [ ] **Step 3: 实现**

`ProjectsView.vue:42` 补第 4 参：

```ts
  buildProjectRows(
    (scoped.value?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
    projectTags.effectiveAssignments,
    (scoped.value?.projectMilestones ?? {}) as Record<string, any[]>,
  ))
```

`ProjectsView.vue:49-80` 的整个 `ALL_COLUMNS` 数组字面量替换为：

```ts
import { buildProjectRows, filterProjectRows, PROJECT_DOMAIN_COLUMNS, type ProjectFilters, type ProjectRow } from '@/lib/projectList'

const ACTION_COL: DataColumn = { key: 'action', label: '操作', width: 80, fixed: 'right' }
const ALL_COLUMNS: DataColumn[] = [...PROJECT_DOMAIN_COLUMNS, ACTION_COL]
```

`ALL_KEYS` / `DEFAULT_VISIBLE` / `FILTERABLE` / `prefs` 及其后的 tags 迁移逻辑**全部保持不动**
（`DEFAULT_VISIBLE` 是显式白名单，不含两新列 → 默认隐藏，符合要求）。

`FILTERABLE` 追加两个新列（与其他日期列一致，可按列头筛选）：

```ts
const FILTERABLE = new Set([... 原有全部 ..., 'plannedCloseDate', 'actualCloseDate'])
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts src/lib/projectList.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts
git commit -m "feat(projects): V4.4.4 /projects 改吃列单一来源并加计划/实际关闭时间列"
```

---

## Task 3: `/projects/key` 借列 + 行 decorate（含反推式 DEFAULT_VISIBLE 修正）

**Files:**
- Modify: `frontend/src/lib/keyProjects.ts:76-84`、`frontend/src/views/KeyProjectsView.vue:49`、`:59-81`
- Test: `frontend/src/lib/keyProjects.test.ts`、`frontend/src/views/KeyProjectsView.test.ts`

**Interfaces:**
- Consumes: `buildProjectRows`、`decorateProjectDomain`、`borrowProjectColumns`（Task 1）。
- Produces: `buildKeyProjectRows(projects, pmisMap, current, milestones?)` — 第 4 参可选。

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/lib/keyProjects.test.ts`：

```ts
it('V4.4.4 行上带出项目域借入字段（tags/signUnit/关闭时间）', () => {
  const rows = buildKeyProjectRows(
    [{ projectId: 'K1', projectName: 'K', top1000: '是', paymentPmis: { contract: 2_000_000 } } as any],
    { K1: { status: { 项目级别: 'P1' }, customer: { 合同总额: 2_000_000 } } } as any,
    {},
    { K1: [{ name: '项目关闭', planDate: '2026-08-01', actualDate: '' }] } as any,
  )
  expect(rows[0].projectId).toBe('K1')
  expect((rows[0] as any).plannedCloseDate).toBe('2026-08-01')
  expect((rows[0] as any).signUnit).toBeDefined()
  expect((rows[0] as any).top1000).toBe('是')
})
```

追加到 `frontend/src/views/KeyProjectsView.test.ts`（**契约③④ 的 key-projects 分片**）：

```ts
import { BORROWABLE_KEYS } from '@/lib/projectList'

it('V4.4.4 契约③ ALL_COLUMNS 覆盖全部可借列', async () => {
  const w = await mountKeyProjects()   // 沿用本文件既有挂载 helper
  const keys = new Set((w.vm as any).ALL_COLUMNS.map((c: any) => c.key))
  for (const k of BORROWABLE_KEYS) expect(keys.has(k)).toBe(true)
})
it('V4.4.4 契约④ 借入列默认不可见（DEFAULT_VISIBLE 必须基于 OWN_KEYS）', async () => {
  const w = await mountKeyProjects()
  const vis = (w.vm as any).prefs.visibleKeys.value
  for (const k of ['plannedCloseDate', 'actualCloseDate', 'originSetupDate', 'tags', 'signUnit']) {
    expect(vis).not.toContain(k)
  }
  expect(vis).toContain('weekProgress')   // 自有列仍默认可见
})
```

> **本页 `defineExpose`（`KeyProjectsView.vue:149`）当前不含 `ALL_COLUMNS`/`prefs`**，
> 本 Task 需把这两项加进去：
> ```ts
> defineExpose({
>   mode: fp.mode, historyIdx: fp.historyIdx, isCurrent: fp.isCurrent,
>   exportSel: fp.exportSel, allSelected: fp.allSelected, datasetOpts: fp.datasetOpts,
>   toggleAllExport: fp.toggleAllExport,
>   ALL_COLUMNS, prefs,
> })
> ```
> 契约④ 是本页最关键的一条——`DEFAULT_VISIBLE` 原本写作 `ALL_KEYS.filter(...)`，
> 若忘了改成基于 `OWN_KEYS`，**没有任何现有断言会红**，只会让借入列全部默认可见。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/keyProjects.test.ts src/views/KeyProjectsView.test.ts`
Expected: FAIL — `plannedCloseDate` 不在列里 / 行上无该字段。

- [ ] **Step 3: 实现**

`keyProjects.ts` 顶部补 import 并改 `buildKeyProjectRows`：

```ts
import { buildProjectRows, decorateProjectDomain, type ProjectRow } from './projectList'

export function buildKeyProjectRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, ProgressRecord>,
  milestones?: Record<string, any[]>,
): KeyProjectRow[] {
  const rows = projects
    .filter((p) => isKeyProject(p, pmisMap[p.projectId]))
    .map((p) => buildProgressRowBase(p, pmisMap[p.projectId], current[p.projectId] ?? {}))
  const prMap = new Map<string, ProjectRow>(
    buildProjectRows(projects, pmisMap, undefined, milestones).map((r) => [r.projectId, r]))
  return decorateProjectDomain(rows, prMap)
}
```

`KeyProjectsView.vue:49` 的 `buildKeyProjectRows(...)` 调用补第 4 参
`(scoped.value?.projectMilestones ?? {}) as Record<string, any[]>`。

`KeyProjectsView.vue:59-81` 改为（**关键：`DEFAULT_VISIBLE` 基于 `OWN_KEYS`，不是 `ALL_KEYS`**）：

```ts
import { borrowProjectColumns } from '@/lib/projectList'

const OWN_COLUMNS: DataColumn[] = withSortable([
  // ...原 ALL_COLUMNS 的 16 列，逐字不动...
])
const OWN_KEYS = OWN_COLUMNS.map((c) => c.key)
// 借入列不套 withSortable：保留来源 sortable，避免把 tags/riskReasons 数组列误开成可排序
const ALL_COLUMNS: DataColumn[] = [...OWN_COLUMNS, ...borrowProjectColumns(new Set(OWN_KEYS))]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
// 原写法是 ALL_KEYS.filter(...)，直接 concat 借入列会让它们【全部默认可见】——必须基于 OWN_KEYS
const DEFAULT_VISIBLE = OWN_KEYS.filter((k) => k !== 'setupDate')
```

`FILTERABLE` 保持不动（借入列不进筛选白名单，本期不扩）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/keyProjects.test.ts src/views/KeyProjectsView.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/keyProjects.ts frontend/src/lib/keyProjects.test.ts frontend/src/views/KeyProjectsView.vue frontend/src/views/KeyProjectsView.test.ts
git commit -m "feat(key-projects): V4.4.4 /projects/key 借入项目域列并修正反推式默认可见"
```

---

## Task 4: `/projects/temp` 借列 + 行 decorate

**Files:**
- Modify: `frontend/src/lib/tempFollowup.ts:13-44`、`frontend/src/components/TempInstancePanel.vue:65`、`:60-111`
- Test: `frontend/src/lib/tempFollowup.test.ts`

**Interfaces:**
- Consumes: `buildProjectRows`、`decorateProjectDomain`、`borrowProjectColumns`（Task 1）。
- Produces: `buildTempRows(projects, pmisMap, current, inScopeIds, milestones?)` — 第 5 参可选。

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/lib/tempFollowup.test.ts`：

```ts
it('V4.4.4 buildTempRows 带出借入的项目域字段', () => {
  const rows = buildTempRows(
    [{ projectId: 'T1', projectName: 'T' } as any], {} as any, {}, new Set(['T1']),
    { T1: [{ name: '项目关闭', planDate: '2026-09-09', actualDate: '2026-09-30' }] } as any,
  )
  expect((rows[0] as any).plannedCloseDate).toBe('2026-09-09')
  expect((rows[0] as any).actualCloseDate).toBe('2026-09-30')
  expect((rows[0] as any).signUnit).toBeDefined()
})
it('V4.4.4 decorate 不覆盖 buildTempRows 自己挑的字段', () => {
  const rows = buildTempRows(
    [{ projectId: 'T1', projectName: 'T' } as any],
    { T1: { progress: { 项目阶段: '实施中' } } } as any, {}, new Set(['T1']),
  )
  expect(rows[0].stage).toBe('实施中')
})
```

追加到 `frontend/src/components/TempInstancePanel.test.ts`（**契约③④ 的 temp 分片**，
`TempInstancePanel.vue:174` 已 `defineExpose({ ALL_COLUMNS, FILTERABLE, prefs, sort })`）：

```ts
import { BORROWABLE_KEYS } from '@/lib/projectList'

it('V4.4.4 契约③ ALL_COLUMNS 覆盖全部可借列', async () => {
  const w = await mountPanel()   // 沿用本文件既有挂载 helper
  const keys = new Set((w.vm as any).ALL_COLUMNS.map((c: any) => c.key))
  for (const k of BORROWABLE_KEYS) expect(keys.has(k)).toBe(true)
})
it('V4.4.4 契约④ 借入列默认不可见', async () => {
  const w = await mountPanel()
  const vis = (w.vm as any).prefs.visibleKeys.value
  for (const k of ['plannedCloseDate', 'actualCloseDate', 'originSetupDate', 'tags', 'signUnit']) {
    expect(vis).not.toContain(k)
  }
  expect(vis).toContain('weekProgress')   // 自有默认列未受影响
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/tempFollowup.test.ts`
Expected: FAIL — `plannedCloseDate` 为 undefined。

- [ ] **Step 3: 实现**

`tempFollowup.ts` 改 import 与 `buildTempRows`：

```ts
import { buildProjectRows, decorateProjectDomain, type ProjectRow } from './projectList'

export function buildTempRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, ProgressRecord>,
  inScopeIds: Set<string>,
  milestones?: Record<string, any[]>,
): TempRow[] {
  const prMap = new Map<string, ProjectRow>(
    buildProjectRows(projects, pmisMap, undefined, milestones).map((r) => [r.projectId, r]))
  const rows = projects
    .filter((p) => inScopeIds.has(p.projectId))
    .map((p) => {
      // ...原有 map 体逐字不动...
    })
  return decorateProjectDomain(rows, prMap)
}
```

`TempInstancePanel.vue:65` 调用补第 5 参：

```ts
  custom.decorate(buildTempRows(projects.value, pmisMap.value, temp.current, inScopeIds.value,
    (scoped.value as any)?.projectMilestones ?? {})) as TempRow[])
```

`TempInstancePanel.vue` 的 `BASE_COLUMNS` 之后、`ALL_COLUMNS` computed 之前插入借列：

```ts
import { borrowProjectColumns } from '@/lib/projectList'

const OWN_KEYS = new Set(BASE_COLUMNS.map((c) => c.key))
const BORROWED = borrowProjectColumns(OWN_KEYS)
// 顺序：自有静态列 → 借入项目域列 → 自定义列
const ALL_COLUMNS = computed<DataColumn[]>(() => [...BASE_COLUMNS, ...BORROWED, ...custom.columns.value])
```

`DEFAULT_VISIBLE`（显式白名单数组）与 `FILTERABLE` 保持不动。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/tempFollowup.test.ts src/components/TempInstancePanel.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/tempFollowup.ts frontend/src/lib/tempFollowup.test.ts frontend/src/components/TempInstancePanel.vue frontend/src/components/TempInstancePanel.test.ts
git commit -m "feat(temp-followup): V4.4.4 /projects/temp 借入项目域列并 decorate 行值"
```

---

## Task 5: `/payment/key` 借列 + 行 decorate

**Files:**
- Modify: `frontend/src/lib/paymentKeyFollowup.ts:33-66`、`frontend/src/views/PaymentKeyFollowupView.vue:70`、`:98-99`
- Test: `frontend/src/lib/paymentKeyFollowup.test.ts`

**Interfaces:**
- Consumes: `buildProjectRows`、`decorateProjectDomain`、`borrowProjectColumns`（Task 1）。
- Produces: `buildPaymentKeyRows(projects, pmisMap, current, inScopeIds, milestones?)` — 第 5 参可选。

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/lib/paymentKeyFollowup.test.ts`：

```ts
it('V4.4.4 buildPaymentKeyRows 带出借入的项目域字段', () => {
  const rows = buildPaymentKeyRows(
    [{ projectId: 'P1', projectName: 'P' } as any], {} as any, {}, new Set(['P1']),
    { P1: [{ name: '项目关闭', planDate: '2026-10-01', actualDate: '' }] } as any,
  )
  expect((rows[0] as any).plannedCloseDate).toBe('2026-10-01')
  expect((rows[0] as any).setupDate).toBeDefined()
})
it('V4.4.4 借入不覆盖自有 contractWan（单位仍为万）', () => {
  const rows = buildPaymentKeyRows(
    [{ projectId: 'P1', paymentPmis: { contract: 2_000_000 } } as any], {} as any, {}, new Set(['P1']))
  expect(rows[0].contractWan).toBe(200)
  expect((rows[0] as any).contractAmount).toBeUndefined()   // BORROW_EXCLUDE
})
```

追加到 `frontend/src/views/PaymentKeyFollowupView.test.ts`（**契约③④ 的 payment-key 分片**）：

```ts
import { BORROWABLE_KEYS } from '@/lib/projectList'

it('V4.4.4 契约③ ALL_COLUMNS 覆盖全部可借列', async () => {
  const w = await mountPaymentKey()   // 沿用本文件既有挂载 helper
  const keys = new Set((w.vm as any).ALL_COLUMNS.map((c: any) => c.key))
  for (const k of BORROWABLE_KEYS) expect(keys.has(k)).toBe(true)
})
it('V4.4.4 契约④ 借入列默认不可见', async () => {
  const w = await mountPaymentKey()
  const vis = (w.vm as any).prefs.visibleKeys.value
  for (const k of ['plannedCloseDate', 'actualCloseDate', 'originSetupDate', 'tags', 'signUnit']) {
    expect(vis).not.toContain(k)
  }
  expect(vis).toContain('followAction')   // 自有默认列未受影响
})
```

> **本页 `defineExpose`（`PaymentKeyFollowupView.vue:163`）当前不含 `ALL_COLUMNS`/`prefs`**，
> 本 Task 需在其对象字面量中追加 `ALL_COLUMNS, prefs`（其余项保持不动）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentKeyFollowup.test.ts`
Expected: FAIL — `plannedCloseDate` 为 undefined。

- [ ] **Step 3: 实现**

`paymentKeyFollowup.ts` 改 import 与 `buildPaymentKeyRows`：

```ts
import { buildProjectRows, decorateProjectDomain, type ProjectRow } from './projectList'

export function buildPaymentKeyRows(
  projects: Project[], pmisMap: Record<string, ProjectPmis>,
  current: Record<string, PaymentKeyRecord>, inScopeIds: Set<string>,
  milestones?: Record<string, any[]>,
): PaymentKeyRow[] {
  const prMap = new Map<string, ProjectRow>(
    buildProjectRows(projects, pmisMap, undefined, milestones).map((r) => [r.projectId, r]))
  const rows = projects.filter((p) => inScopeIds.has(p.projectId)).map((p) => {
    // ...原有 map 体逐字不动...
  })
  return decorateProjectDomain(rows, prMap)
}
```

`PaymentKeyFollowupView.vue:70` 调用补第 5 参：

```ts
  custom.decorate(buildPaymentKeyRows(projects.value, pmisMap.value, pk.current, inScopeIds.value,
    (scoped.value as any)?.projectMilestones ?? {})) as PaymentKeyRow[])
```

`PaymentKeyFollowupView.vue:99` 的 `ALL_COLUMNS` 改为：

```ts
import { borrowProjectColumns } from '@/lib/projectList'

const OWN_KEYS = new Set(BASE_COLUMNS.map((c) => c.key))
const BORROWED = borrowProjectColumns(OWN_KEYS)
const ALL_COLUMNS = computed<DataColumn[]>(() => [...BASE_COLUMNS, ...BORROWED, ...custom.columns.value])
```

`DEFAULT_VISIBLE`（显式白名单数组）与 `FILTERABLE` 保持不动。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentKeyFollowup.test.ts src/views/PaymentKeyFollowupView.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/paymentKeyFollowup.ts frontend/src/lib/paymentKeyFollowup.test.ts frontend/src/views/PaymentKeyFollowupView.vue frontend/src/views/PaymentKeyFollowupView.test.ts
git commit -m "feat(payment-key): V4.4.4 /payment/key 借入项目域列并 decorate 行值"
```

---

## Task 6: `/risk` 中文键 decorate + `RISK_SCOPE_CATALOG` 补 7 条

**Files:**
- Modify: `frontend/src/lib/riskRows.ts:22-72`（`buildRiskRows`）、`:87-114`（`RISK_SCOPE_CATALOG`）、`frontend/src/views/RiskFollowupView.vue:58`
- Test: `frontend/src/lib/riskRows.test.ts`

**Interfaces:**
- Consumes: `buildProjectRows`、`decorateProjectDomainMapped`、`BORROW_EXCLUDE`（Task 1）。
- Produces: `RISK_KEY_MAP: Record<string, string>`（26 条，供 Task 8 契约测试）；`buildRiskRows(projects, pmisMap, current, milestones?)` — 第 4 参可选。

> **本 Task 不借列。** `/risk` 的列由 `riskCols`（`RiskFollowupView.vue:92`）遍历行键动态推导，
> 值写进行即成列。**绝不能往 risk 行写英文键**——每个英文键都会各自变成一列，label 即英文 key。

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/lib/riskRows.test.ts`：

```ts
import { RISK_KEY_MAP } from './riskRows'

describe('V4.4.4 risk 项目域扩散', () => {
  const ps = [{ projectId: 'R1', projectName: 'R', paymentPmis: { contract: 3_000_000 } } as any]
  const pmis = { R1: { riskRecords: [{ 风险编码: 'RK-1', 风险等级: '高' }], status: {} } } as any
  const MS = { R1: [{ name: '项目关闭', planDate: '2026-11-11', actualDate: '' }] } as any

  it('新增 7 个中文键写入风险行', () => {
    const [row] = buildRiskRows(ps, pmis, {}, MS)
    expect(row['计划关闭时间']).toBe('2026-11-11')
    expect(row['实际关闭时间']).toBeFalsy()
    expect(row).toHaveProperty('签约单位')
    expect(row).toHaveProperty('标签')
    expect(row).toHaveProperty('原项目立项日期')
  })

  it('绝不写英文键（写了会各自变成一列）', () => {
    const [row] = buildRiskRows(ps, pmis, {}, MS)
    for (const en of Object.keys(RISK_KEY_MAP)) {
      if (en === 'projectId') continue   // 既有例外，已在 NON_RISK_KEYS 中
      expect(row).not.toHaveProperty(en)
    }
  })

  it('项目金额仍为万、不被元值覆盖', () => {
    const [row] = buildRiskRows(ps, pmis, {}, MS)
    expect(row['项目金额']).toBe(300)
  })

  it('RISK_SCOPE_CATALOG 含新增 7 条', () => {
    const keys = RISK_SCOPE_CATALOG.map((f) => f.key)
    for (const k of ['签约单位', '标签', '原项目立项日期', '计划终验时间', '实际终验时间',
      '计划关闭时间', '实际关闭时间']) {
      expect(keys).toContain(k)
    }
  })
})
```

追加到 `frontend/src/views/RiskFollowupView.test.ts`（**契约③④ 的 risk 分片**；本页已
`defineExpose({ ..., allKeys, prefs, ... })`，无需改 expose）：

```ts
import { RISK_KEY_MAP } from '@/lib/riskRows'

it('V4.4.4 契约③ allKeys 覆盖全部中文项目域键', async () => {
  const w = await mountRisk()   // 沿用本文件既有挂载 helper
  const keys = new Set((w.vm as any).allKeys)
  for (const zh of Object.values(RISK_KEY_MAP)) expect(keys.has(zh)).toBe(true)
})
it('V4.4.4 契约③ 选列中不出现英文键（写错会各自变成一列）', async () => {
  const w = await mountRisk()
  const keys = new Set((w.vm as any).allKeys)
  for (const en of Object.keys(RISK_KEY_MAP)) {
    if (en === 'projectId') continue   // 既有例外，已在 NON_RISK_KEYS 中
    expect(keys.has(en)).toBe(false)
  }
})
it('V4.4.4 契约④ 新增中文列默认不可见', async () => {
  const w = await mountRisk()
  const vis = (w.vm as any).prefs.visibleKeys.value
  for (const zh of ['计划关闭时间', '实际关闭时间', '原项目立项日期', '标签', '签约单位']) {
    expect(vis).not.toContain(zh)
  }
  expect(vis).toContain('风险编码')   // 自有默认列未受影响
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/riskRows.test.ts`
Expected: FAIL — `RISK_KEY_MAP is not exported`。

- [ ] **Step 3: 实现**

`riskRows.ts` 顶部改 import：

```ts
import { buildProjectRows, decorateProjectDomainMapped, BORROW_EXCLUDE } from './projectList'
```

在 `RISK_SCOPE_CATALOG` 之前新增映射表（键集必须与 `PROJECT_DOMAIN_COLUMNS` 一一对应，共 26 条）：

```ts
/** 英文 key → risk 行的中文 key。键集必须与 PROJECT_DOMAIN_COLUMNS 严格相等（契约测试守护）。
 *  ① 前 19 条目标键已存在于 RiskRow，只映射不新增列；值严禁改动（范围条件按 key 序列化）。
 *  ② 后 7 条为 V4.4.4 新增。 */
export const RISK_KEY_MAP: Record<string, string> = {
  projectId: '项目编号',      projectName: '项目名称',    projectLevel: '项目级别',
  projectManager: '项目经理', orgL4: 'L4组织',            projectType: '项目类型',
  projectStatus: '项目状态',  setupDate: '立项日期',      stage: '项目阶段',
  progress: '完工进展',       riskLevel: '项目最高风险等级',
  costRatio: '预算消耗比',    paymentRatio: '回款完成率', health: '健康度',
  riskReasons: '关注原因',    paymentStatus: '回款状态',  top1000: 'TOP1000',
  quadrant: '象限',           contractAmount: '项目金额',
  signUnit: '签约单位',       tags: '标签',
  originSetupDate: '原项目立项日期',
  plannedFinalAcceptDate: '计划终验时间',
  actualFinalAcceptDate: '实际终验时间',
  plannedCloseDate: '计划关闭时间',
  actualCloseDate: '实际关闭时间',
}
```

> `riskLevel` 映射到 `'项目最高风险等级'`，**不是** `'风险等级'`——后者是风险记录自身的等级，
> 已在 `RISK_SCOPE_CATALOG` 占位，写错会让两个概念静默串值。

`buildRiskRows` 加第 4 参并在 `return` 前 decorate：

```ts
export function buildRiskRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, RiskFollowRecord>,
  milestones?: Record<string, any[]>,
): RiskRow[] {
  const out: RiskRow[] = []
  const prMap = new Map(buildProjectRows(projects, pmisMap, undefined, milestones).map((r) => [r.projectId, r]))
  // ...原有双层 for 循环逐字不动...
  return decorateProjectDomainMapped(out, prMap, RISK_KEY_MAP, BORROW_EXCLUDE)
}
```

`RISK_SCOPE_CATALOG` 末尾追加 7 条：

```ts
  { key: '签约单位', label: '签约单位', kind: 'enum' as FieldKind },
  { key: '标签', label: '标签', kind: 'enum' as FieldKind },
  { key: '原项目立项日期', label: '原项目立项日期', kind: 'date' as FieldKind },
  { key: '计划终验时间', label: '计划终验时间', kind: 'date' as FieldKind },
  { key: '实际终验时间', label: '实际终验时间', kind: 'date' as FieldKind },
  { key: '计划关闭时间', label: '计划关闭时间', kind: 'date' as FieldKind },
  { key: '实际关闭时间', label: '实际关闭时间', kind: 'date' as FieldKind },
```

`RiskFollowupView.vue:58` 调用补第 4 参：

```ts
  custom.decorate(buildRiskRows(projects.value, pmisMap.value, risk.current,
    (scoped.value as any)?.projectMilestones ?? {})) as RiskRow[])
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/riskRows.test.ts src/views/RiskFollowupView.test.ts`
Expected: 全部 PASS（含既有「RISK_SCOPE_CATALOG 含新增 11 个项目级字段」用例不回归）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/riskRows.ts frontend/src/lib/riskRows.test.ts frontend/src/views/RiskFollowupView.vue frontend/src/views/RiskFollowupView.test.ts
git commit -m "feat(risk): V4.4.4 /risk 按中文键映射扩散项目域字段 + 范围目录补 7 条"
```

---

## Task 7: 范围设置 — `FIELD_CATALOG` 补 3 条 + `buildScopeInputs` 产出 3 键

**Files:**
- Modify: `frontend/src/lib/tempScope.ts:65-67`（追加 3 条）、`frontend/src/lib/tempFollowup.ts:46-100`（`buildScopeInputs`）
- Test: `frontend/src/lib/tempScope.test.ts`、`frontend/src/lib/tempFollowup.test.ts`

**Interfaces:**
- Consumes: `buildProjectRows` 第 4 参（Task 1）。
- Produces: `FIELD_CATALOG` 的 project 组新增 `plannedCloseDate`/`actualCloseDate`/`originSetupDate`；`buildScopeInputs` 的 `proj` 对象同步产出这 3 键。作用于 `/projects/temp` 与 `/payment/key`（两页共用）。

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/lib/tempScope.test.ts`：

```ts
it('V4.4.4 FIELD_CATALOG 新增三个项目域日期字段', () => {
  for (const k of ['plannedCloseDate', 'actualCloseDate', 'originSetupDate']) {
    const f = FIELD_CATALOG.find((x) => x.group === 'project' && x.key === k)
    expect(f).toBeTruthy()
    expect(f!.kind).toBe('date')
  }
})
```

追加到 `frontend/src/lib/tempFollowup.test.ts`：

```ts
it('V4.4.4 buildScopeInputs 产出关闭时间与原项目立项日期', () => {
  const inputs = buildScopeInputs(
    [{ projectId: 'S1', isPresale: true, relatedClosedId: 'OLD-1' } as any],
    { 'OLD-1': { status: { 立项日期: '2019-03-03' } } } as any,
    undefined,
    { S1: [{ name: '项目关闭', planDate: '2026-12-01', actualDate: '2026-12-20' }] } as any,
  )
  expect(inputs[0].proj.plannedCloseDate).toBe('2026-12-01')
  expect(inputs[0].proj.actualCloseDate).toBe('2026-12-20')
  expect(inputs[0].proj.originSetupDate).toBe('2019-03-03')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts src/lib/tempFollowup.test.ts`
Expected: FAIL — catalog 找不到该字段 / `proj.plannedCloseDate` 为 undefined。

- [ ] **Step 3: 实现**

`tempScope.ts` 在 `setupDate` 那条之后（第 67 行后）追加，**注意上方「key 严禁改名」注释同样适用于新键**：

```ts
  { group: 'project', key: 'originSetupDate', label: '原项目立项日期', kind: 'date' },
  { group: 'project', key: 'plannedCloseDate', label: '计划关闭时间', kind: 'date' },
  { group: 'project', key: 'actualCloseDate', label: '实际关闭时间', kind: 'date' },
```

`tempFollowup.ts` 的 `buildScopeInputs`：把 `prMap` 构建改为透传 milestones，并在 `proj` 对象的
`setupDate` 之后追加 3 键（口径统一走 `ProjectRow`，不在此处重算里程碑）：

```ts
export function buildScopeInputs(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  paymentNodes: Record<string, any[]> | undefined,
  milestones: Record<string, any[]> | undefined,
): ScopeProjectInput[] {
  const prMap = new Map<string, ProjectRow>(
    buildProjectRows(projects, pmisMap, undefined, milestones).map((r) => [r.projectId, r]))
  // ...
      proj: {
        // ...原有字段不动...
        setupDate: String(pr?.setupDate ?? '').slice(0, 10),
        originSetupDate: String(pr?.originSetupDate ?? '').slice(0, 10),
        plannedCloseDate: String(pr?.plannedCloseDate ?? '').slice(0, 10),
        actualCloseDate: String(pr?.actualCloseDate ?? '').slice(0, 10),
      },
  // ...
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts src/lib/tempFollowup.test.ts src/lib/paymentKeyFollowup.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/tempScope.ts frontend/src/lib/tempScope.test.ts frontend/src/lib/tempFollowup.ts frontend/src/lib/tempFollowup.test.ts
git commit -m "feat(scope): V4.4.4 范围设置补齐关闭时间与原项目立项日期"
```

---

## Task 8: 契约测试（lib 层两条）— 守住扩散不退化

**Files:**
- Create: `frontend/src/lib/projectDomainColumns.contract.test.ts`

**Interfaces:**
- Consumes: `PROJECT_DOMAIN_COLUMNS`/`BORROWABLE_KEYS`（Task 1）、`RISK_KEY_MAP`/`buildRiskRows`（Task 6）、三页行构建器（Task 3/4/5）。
- Produces: 无导出，纯守护。

> 这是本期真正的交付物之一。没有契约测试，「今后 `/projects` 新增列自动流入四页」只是约定，
> 下一个改代码的人可以无声地打破它。
>
> 四条契约中，**①映射完备**与**②值可达**是纯 lib 层、放本文件；**③列覆盖**与**④默认不展示**
> 必须读各 view 里真实的 `ALL_COLUMNS`/`visibleKeys`，已分散写在 Task 2/3/4/5/6 的 view 测试中
> （在 lib 层用硬编码 ownKeys 复算是恒真的假测试，见本 Task 末尾说明）。

- [ ] **Step 1: 写测试（本 Task 的测试即交付物，应一次写全并全绿）**

创建 `frontend/src/lib/projectDomainColumns.contract.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { PROJECT_DOMAIN_COLUMNS, BORROWABLE_KEYS } from './projectList'
import { RISK_KEY_MAP, buildRiskRows } from './riskRows'
import { buildTempRows } from './tempFollowup'
import { buildPaymentKeyRows } from './paymentKeyFollowup'
import { buildKeyProjectRows } from './keyProjects'

const DOMAIN_KEYS = PROJECT_DOMAIN_COLUMNS.map((c) => c.key)
const BORROWABLE = BORROWABLE_KEYS
const MS = { C1: [{ name: '项目关闭', planDate: '2026-08-01', actualDate: '2026-08-20' }] } as any
const P = [{ projectId: 'C1', projectName: 'C', top1000: '是',
  paymentPmis: { contract: 2_000_000 } } as any]
const PMIS = { C1: { status: { 项目级别: 'P1' }, riskRecords: [{ 风险编码: 'RK-1' }] } } as any

// ① 映射完备：双向严格相等
describe('契约① RISK_KEY_MAP 与 PROJECT_DOMAIN_COLUMNS 键集严格相等', () => {
  it('新增/删除 /projects 列时必须同步 RISK_KEY_MAP', () => {
    expect(new Set(Object.keys(RISK_KEY_MAP))).toEqual(new Set(DOMAIN_KEYS))
  })
  it('中文键无重复（映射到同一列会互相覆盖）', () => {
    const zh = Object.values(RISK_KEY_MAP)
    expect(new Set(zh).size).toBe(zh.length)
  })
})

// ② 值可达
describe('契约② 借入列在行对象上取得到值', () => {
  it('/projects/key', () => {
    const [row] = buildKeyProjectRows(P, PMIS, {}, MS) as any[]
    for (const k of BORROWABLE) expect(k in row).toBe(true)
  })
  it('/projects/temp', () => {
    const [row] = buildTempRows(P, PMIS, {}, new Set(['C1']), MS) as any[]
    for (const k of BORROWABLE) expect(k in row).toBe(true)
  })
  it('/payment/key', () => {
    const [row] = buildPaymentKeyRows(P, PMIS, {}, new Set(['C1']), MS) as any[]
    for (const k of BORROWABLE) expect(k in row).toBe(true)
  })
  it('/risk 行含全部中文键', () => {
    const [row] = buildRiskRows(P, PMIS, {}, MS) as any[]
    for (const zh of Object.values(RISK_KEY_MAP)) expect(zh in row).toBe(true)
  })
  it('/risk 行不含任何英文键（写了会各自变成一列）', () => {
    const [row] = buildRiskRows(P, PMIS, {}, MS) as any[]
    for (const en of Object.keys(RISK_KEY_MAP)) {
      if (en === 'projectId') continue   // 既有例外，已在 NON_RISK_KEYS 中
      expect(en in row).toBe(false)
    }
  })
})

```

> **契约③「列覆盖」与契约④「默认不展示」不写在本文件**——它们必须断言**各 view 里实际的**
> `ALL_KEYS` / `visibleKeys`，在 lib 层用硬编码的 ownKeys 复算是**恒真的假测试**
> （`ownKeys ∪ borrowProjectColumns(ownKeys)` 在数学上必然覆盖 `BORROWABLE`，无论 view 是否
> 真的调用了 `borrowProjectColumns`）。故 ③④ 分散到 Task 2/3/4/5/6 各自的 view 测试中，
> 挂载真实组件后读 `defineExpose` 的值断言。

- [ ] **Step 2: 跑测试**

Run: `cd frontend && npx vitest run src/lib/projectDomainColumns.contract.test.ts`
Expected: 全部 PASS。若契约① 红，说明 Task 1 与 Task 6 的键集没对齐——**回头修键集，不要改断言**。

- [ ] **Step 3: 反向验证契约有效（临时改动，验完必须撤销）**

在 `projectList.ts` 的 `PROJECT_DOMAIN_COLUMNS` 末尾临时插入一列 `{ key: 'zzTest', label: '测试' }`，
然后跑：

```bash
cd frontend && npx vitest run src/lib/projectDomainColumns.contract.test.ts src/views/KeyProjectsView.test.ts
```

Expected: **契约①（键集相等）、契约②（值可达）、契约③（列覆盖）三处必须变红**。
确认后删除该临时列并重跑，恢复全绿。

> 这一步是为了证明契约测试真的能抓到「加了列没同步」。不做这步，很可能写出恒绿的假测试——
> 本 plan 初稿就把契约③④ 写成了 `ownKeys ∪ borrow(ownKeys) ⊇ BORROWABLE` 这种数学上
> 恒真的形式，看着像在守护、其实一无所守。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/lib/projectDomainColumns.contract.test.ts
git commit -m "test(projects): V4.4.4 四条契约测试守住项目域列扩散"
```

---

## Task 9: 版本号 + 文档 + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`
- Create: `deploy/升级手册-V4.4.4.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：

```ts
export const APP_VERSION = 'V4.4.4'
export const RELEASE_DATE = '2026-07-25'
```

- [ ] **Step 2: 跑全量验证**

Run: `bash verify.sh`
Expected: 语法编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

> 若 `AppSidebar.test.ts` 之类的计数断言变红，检查是否误改了导航；本期不动导航，不应触发。

- [ ] **Step 3: 写升级手册**

创建 `deploy/升级手册-V4.4.4.md`，照 `deploy/升级手册-V4.4.3.md` 的结构，要点：

- 本次修什么：`/projects` 加计划/实际关闭时间列（默认隐藏，需自行勾选）；「重点跟进」四页选列补齐项目域全量字段（默认隐藏）；三页范围设置补齐关闭时间与原项目立项日期。
- **纯前端修复，无需点「更新数据」**；换 `dist` + 重启 + `Ctrl+F5`。
- 既有账号/数据/已配好的范围条件零影响（本期只新增 key，不改任何现有 key）。
- 验证清单：左上角版本号 V4.4.4；`/projects` 选列面板中能勾出两个关闭时间列，值与 `/project/:id` 里程碑 tab 的「项目关闭」行一致；四页选列面板中出现项目域列且默认未勾选；勾出后排序/筛选/导出均有值；`/risk` 的「项目金额」仍为万且数值与升级前一致；三页范围设置里原有条件仍在、匹配数不变。
- 回滚：换回 `dist.bak-$TS` 并重启。

- [ ] **Step 4: 更新 PROGRESS.md**

在文件顶部按现有格式新增 V4.4.4 条目（把原「当前版本 V4.4.3」那行降为普通 `- **V4.4.3**` 条目），
记录：项目域列单一来源 `PROJECT_DOMAIN_COLUMNS` + 四页扩散 + 四条契约测试；并记下本期探明的
四个坑（四页非同构 / 合同金额三键两单位 / risk 列由行键动态推导故绝不可写英文键 /
`/projects/key` 反推式 `DEFAULT_VISIBLE`）。

- [ ] **Step 5: 提交并推送**

```bash
git add frontend/src/version.ts PROGRESS.md deploy/升级手册-V4.4.4.md
git commit -m "docs(deploy): V4.4.4 升级手册 + PROGRESS(纯前端换 dist,无需更新数据)"
git status --short
git diff --cached --stat
git push origin master
```

> 推送前用 `git status` 确认 `yitian/` 等未跟踪目录未被暂存；本期不应有任何 `data/`、`input/`、
> `release/` 文件进入暂存区。

---

## 附：手工冒烟（Task 9 之后，上线前）

启动 `python server.py` + `cd frontend && npm run dev`，逐项确认：

1. `/projects` → 选列勾出「计划关闭时间」「实际关闭时间」→ 挑 3 个项目与 `/project/:id` 里程碑 tab 的「项目关闭」行对拍，计划日与实际日**逐项目一致**。
2. 四页各勾出若干借入列 → 点列头**排序**有效、列头**筛选**能列出值、**导出** xlsx 中该列有值（三处都读行对象，缺一即 decorate 没生效）。
3. `/risk` → 选列面板中**不应**出现 `setupDate`、`orgL4` 等英文列名；「项目金额」仍显示万。
4. `/projects/temp`、`/payment/key`、`/risk` → 打开「范围设置」，原有条件仍在、匹配计数与升级前一致；新增「计划关闭时间」条件能筛出结果。
5. 切换账号（不同 `allowedL4`）→ 借入列的值仍受数据范围约束，无越权数据泄漏。
