# SP-B1 里程碑管理页（概览半）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）or superpowers:executing-plans 逐任务执行。步骤用 checkbox（`- [ ]`）跟踪。

**Goal：** 把 `/insight/milestone` 的占位 stub 替换为里程碑概览页：5 状态 KPI + 5 图（到期提醒/终验完成/部门异常/部门合规/节点分布）+ 节点下钻 + 页内标签剔除控件，数据全部取自 `analysis_data.json`。

**Architecture：** 纯计算集中在新 `lib/milestoneAnalytics.ts`（无 Vue 依赖、全 vitest 覆盖）；`views/MilestoneView.vue` 仿 `InsightView.vue` 装配（`computed` 构造 ECharts option，经 `ChartBox` 自动 light/dark）。新增通用 `MetricGrid.vue`（KPI 卡）与 `MilestoneDrillModal.vue`（下钻）。读 `useDataStore`，遵循全局标签剔除 `useFilterStore`。

**Tech Stack：** Vue3 + Vite + TS + Pinia + Element Plus + ECharts(vue-echarts) + Vitest(@vue/test-utils)。

## Global Constraints

- **不使用任何 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`。
- **样式只引用 `frontend/src/styles/theme.css` 设计令牌**（`--sp-*`/`--fs-*`/`--txt`/`--mut`/`--ok`/`--warn`/`--danger` 等）+ `echartsTheme` 桥接色，**禁手写散值**（颜色/间距/字号）。
- **状态色与分类色分离**：表达里程碑状态的图表系列用状态色（`STATUS_*`/`MUTED_*`）；分类维度（节点类型）用 `CHART_*`。
- **双源契约**：`echartsTheme.ts` 新增的色必须与 `theme.css` 同名令牌一致，由 `echartsTheme.tokens.test.ts` 强制。
- **版本** 已是 V1.16.0（SP-A 合入，本计划不改 `version.ts`）。
- **git：逐文件 `git add <path>`，禁止 `git add -A`/`git add .`**；commit message 结尾**恒含一行**：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **不提交**：`data/analysis_data.json`（gitignored）、`.claude/`、`docs/` 血缘 md、本 plan/spec、`.superpowers/`。每个任务只 add 自己改的源码/测试文件。
- 沟通语言**简体中文**。
- **TDD**：每个任务先写/改测试 → 跑红 → 实现 → 跑绿 → 提交。命令：`cd frontend && npm run test:run -- <file>`；提交前 `cd frontend && npm run typecheck`。

## 复用锚点（实测确认，照此调用）

- `ChartBox.vue`：props `option: Record<string,any>`、`height?: string`(默认 `'320px'`)；自动按 `settings.theme` 选 light/dark。**本计划 Task 4 给它加 `datapoint-click` 事件转发**（供图 E 下钻）。
- `SegToggle.vue`：props `modelValue: string`、`options: {value,label}[]`；emit `update:modelValue`；按钮 `data-test="seg-<value>"`。
- `DataTable.vue`：`DataColumn = { key,label,width?,sortable?,formatter?,wrap?,fixed?,num? }`；props `columns`、`rows`、`showCount?`(默认 true)、`clickable?`(默认 false)；emit `row-click`(整行对象)；具名插槽 `cell-<key>`（作用域 `{ row, value }`）。
- `Modal.vue`：props `modelValue: boolean`、`title?`、`width?`(默认 `'50%'`)；emit `update:modelValue`；具名插槽 `footer`。
- `echartsTheme.ts` 现有导出：`STATUS_LIGHT/DARK = {ok,warn,danger}`、`CHART_LIGHT/DARK`(8 支数组)、`STRUCT_LIGHT/DARK`、`FONT_SANS`、`ENT_THEME`/`ENT_THEME_DARK`。
- `useSettingsStore().theme`：`'light'|'dark'`。
- `useDataStore()`：`.data: AnalysisData|null`、`.load()`。字段：`data.projects`、`data.projectPmis`(Dict pid→ProjectPmis，`.progress.里程碑进度状态`、`.status.项目类型`)、`data.projectMilestones`(Dict pid→MilestoneItem[])。
- `useFilterStore()`：`.excludeOn`、`.excludeTags`、`.excludedIds`(computed Record)、`.setExclude(on, tags)`。
- `useProjectTagsStore()`：`.activeTags`(TagDef[]，`.name`)、`.loaded`、`.load()`。
- 页面装配范式参照 `views/InsightView.vue`（`.iv-view`/`.iv-toolbar`/`.iv-card` + `computed(option)` + `ChartBox`）。

## 文件结构

- 新建 `frontend/src/lib/milestoneAnalytics.ts`（Task 1-3 增量构建）+ `frontend/src/lib/milestoneAnalytics.test.ts`。
- 改 `frontend/src/charts/echartsTheme.ts`（+MUTED_*）、`frontend/src/charts/echartsTheme.tokens.test.ts`、`frontend/src/charts/ChartBox.vue`（+emit）、`frontend/src/charts/ChartBox.test.ts`（Task 4）。
- 新建 `frontend/src/components/MetricGrid.vue` + `.test.ts`（Task 5）。
- 新建 `frontend/src/components/MilestoneDrillModal.vue` + `.test.ts`（Task 6）。
- 替换 `frontend/src/views/MilestoneView.vue`（stub→实页，Task 7-8）+ 新建 `frontend/src/views/MilestoneView.test.ts`。

---

## Task 1: lib 核心（状态归一 + 域装配 + KPI）

**Files:**
- Create: `frontend/src/lib/milestoneAnalytics.ts`
- Test: `frontend/src/lib/milestoneAnalytics.test.ts`

**Interfaces:**
- Produces: `MilestoneStatus`、`MilestoneProject`、`ExcludeOpts`、`normalizeStatus(raw)`、`buildMilestoneProjects(projects, pmis, milestones, opts?)`、`statusKpis(ps)`、`StatusKpis`。后续 Task 2/3 向同文件追加函数。

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/milestoneAnalytics.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { normalizeStatus, buildMilestoneProjects, statusKpis } from './milestoneAnalytics'

describe('normalizeStatus', () => {
  it('正常/延期/严重延期 原样', () => {
    expect(normalizeStatus('正常')).toBe('正常')
    expect(normalizeStatus('延期')).toBe('延期')
    expect(normalizeStatus('严重延期')).toBe('严重延期')
  })
  it('超期未发布/空/null/未知 → 未发布', () => {
    expect(normalizeStatus('超期未发布')).toBe('未发布')
    expect(normalizeStatus('')).toBe('未发布')
    expect(normalizeStatus(null)).toBe('未发布')
    expect(normalizeStatus(undefined)).toBe('未发布')
    expect(normalizeStatus('其它怪值')).toBe('未发布')
  })
})

const projects = [
  { projectId: 'A', projectName: '甲', projectManager: '张', orgL4: 'L1', orgL3_1: 'S1', isPresale: false, paymentPmis: { contract: 1000000 } },
  { projectId: 'B', projectName: '乙', projectManager: '李', orgL4: 'L1', orgL3_1: 'S1', isPresale: true, relatedClosedId: 'R', paymentPmis: { contract: 2000000 } },
  { projectId: 'C', projectName: '丙', projectManager: '王', orgL4: '', orgL3_1: '', isPresale: false, paymentPmis: { contract: 0 } },
] as any
const pmis = {
  A: { progress: { 里程碑进度状态: '正常' }, status: { 项目类型: '正常实施类' } },
  B: { progress: { 里程碑进度状态: '严重延期' }, status: { 项目类型: '售前服务类' } },
  C: { progress: { 里程碑进度状态: '' }, status: { 项目类型: '特殊支持类' } },
} as any
const milestones = {
  A: [{ name: '终验', planDate: '2026-03-01', actualDate: '', priority: 'high' }],
  R: [{ name: '初验', planDate: '2026-02-01', actualDate: '', priority: 'high' }],
} as any

describe('buildMilestoneProjects', () => {
  it('装配字段 + 状态归一', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones)
    expect(ps).toHaveLength(3)
    const a = ps.find((p) => p.projectId === 'A')!
    expect(a).toMatchObject({ projectName: '甲', manager: '张', orgL4: 'L1', projectType: '正常实施类', contract: 1000000, status: '正常' })
    expect(ps.find((p) => p.projectId === 'C')!.status).toBe('未发布')
  })
  it('售前节点回退原项目号(B 本号无节点 → 用 R)', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones)
    expect(ps.find((p) => p.projectId === 'B')!.nodes.map((n) => n.name)).toEqual(['初验'])
  })
  it('本号有节点时不回退；皆无得空数组', () => {
    const ms2 = { ...milestones, B: [{ name: '到货', planDate: '2026-01-01', actualDate: '', priority: 'mid' }] } as any
    const ps = buildMilestoneProjects(projects, pmis, ms2)
    expect(ps.find((p) => p.projectId === 'B')!.nodes.map((n) => n.name)).toEqual(['到货'])
    expect(ps.find((p) => p.projectId === 'C')!.nodes).toEqual([])
  })
  it('标签剔除：excludeOn + excludedIds 命中被剔', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones, { excludeOn: true, excludedIds: { C: true } })
    expect(ps.map((p) => p.projectId)).toEqual(['A', 'B'])
  })
  it('excludeOn=false 时 excludedIds 不生效', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones, { excludeOn: false, excludedIds: { C: true } })
    expect(ps).toHaveLength(3)
  })
})

describe('statusKpis', () => {
  it('按归一状态计数', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones)
    expect(statusKpis(ps)).toEqual({ total: 3, normal: 1, delayed: 0, severe: 1, unpublished: 1 })
  })
})
```

- [ ] **Step 2: 跑红**

Run: `cd frontend && npm run test:run -- src/lib/milestoneAnalytics.test.ts`
Expected: FAIL（模块不存在 / 函数未定义）。

- [ ] **Step 3: 实现**

`frontend/src/lib/milestoneAnalytics.ts`：

```ts
import type { Project, ProjectPmis, MilestoneItem } from '@/types/analysis'

export type MilestoneStatus = '正常' | '延期' | '严重延期' | '未发布'

export interface MilestoneProject {
  projectId: string
  projectName: string
  manager: string
  orgL4: string
  orgL3_1: string
  projectType: string
  contract: number
  status: MilestoneStatus
  nodes: MilestoneItem[]
}

export interface ExcludeOpts { excludeOn?: boolean; excludedIds?: Record<string, boolean> }
export interface StatusKpis { total: number; normal: number; delayed: number; severe: number; unpublished: number }

/** PMIS 里程碑进度状态归一：超期未发布/空/null/未知 → 未发布。 */
export function normalizeStatus(raw: string | null | undefined): MilestoneStatus {
  const s = (raw ?? '').trim()
  if (s === '正常') return '正常'
  if (s === '延期') return '延期'
  if (s === '严重延期') return '严重延期'
  return '未发布'
}

/** 本项目号节点优先；为空且售前则回退原项目号(relatedClosedId)。 */
function nodesFor(p: Project, ms: Record<string, MilestoneItem[]>): MilestoneItem[] {
  const own = ms[p.projectId]
  if (own && own.length) return own
  if (p.isPresale && p.relatedClosedId) return ms[p.relatedClosedId] ?? []
  return []
}

/** 装配主域里程碑视图；excludeOn 时剔除 excludedIds 命中的项目。 */
export function buildMilestoneProjects(
  projects: Project[],
  pmis: Record<string, ProjectPmis>,
  milestones: Record<string, MilestoneItem[]>,
  opts: ExcludeOpts = {},
): MilestoneProject[] {
  const excl = opts.excludeOn ? (opts.excludedIds ?? {}) : {}
  const out: MilestoneProject[] = []
  for (const p of projects) {
    if (excl[p.projectId]) continue
    const m = (pmis[p.projectId] ?? {}) as any
    out.push({
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      manager: (p.projectManager ?? '').trim(),
      orgL4: (p.orgL4 ?? '').trim(),
      orgL3_1: (p.orgL3_1 ?? '').trim(),
      projectType: (m.status?.项目类型 ?? '').trim(),
      contract: Number(p.paymentPmis?.contract ?? 0),
      status: normalizeStatus(m.progress?.里程碑进度状态),
      nodes: nodesFor(p, milestones),
    })
  }
  return out
}

export function statusKpis(ps: MilestoneProject[]): StatusKpis {
  const k: StatusKpis = { total: ps.length, normal: 0, delayed: 0, severe: 0, unpublished: 0 }
  for (const p of ps) {
    if (p.status === '正常') k.normal++
    else if (p.status === '延期') k.delayed++
    else if (p.status === '严重延期') k.severe++
    else k.unpublished++
  }
  return k
}
```

- [ ] **Step 4: 跑绿 + typecheck**

Run: `cd frontend && npm run test:run -- src/lib/milestoneAnalytics.test.ts && npm run typecheck`
Expected: PASS；typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/milestoneAnalytics.ts frontend/src/lib/milestoneAnalytics.test.ts
git commit -m "feat(milestone): lib 核心 状态归一+域装配(售前回退/标签剔除)+KPI (SP-B1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: lib 到期提醒 + 终验完成 + 可选年份

**Files:**
- Modify: `frontend/src/lib/milestoneAnalytics.ts`（追加）
- Test: `frontend/src/lib/milestoneAnalytics.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 的 `MilestoneProject`。
- Produces: `reminderBuckets(ps, now)`、`ReminderWindow`、`finalAcceptStats(ps, gran, year?)`、`FinalAcceptStats`、`availableYears(ps, scope)`、私有助手 `nodeByName`/日期助手（同文件）。

- [ ] **Step 1: 追加失败测试**

在 `milestoneAnalytics.test.ts` 顶部 import 追加并新增 describe：

```ts
import { reminderBuckets, finalAcceptStats, availableYears } from './milestoneAnalytics'

function mp(over: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L', orgL3_1: '', projectType: '', contract: 0, status: '正常', nodes: [], ...over }
}

describe('reminderBuckets', () => {
  const now = new Date(2026, 2, 10) // 2026-03-10（季 Q1: 01-01..03-31）
  it('未来窗口 + 已完成(actualDate 非空)不计 + 优先级归类', () => {
    const ps = [
      mp({ projectId: 'A', nodes: [{ name: '终验', planDate: '2026-03-12', actualDate: '', priority: 'high' }] }),   // 7天内
      mp({ projectId: 'B', nodes: [{ name: '到货', planDate: '2026-03-30', actualDate: '', priority: 'low' }] }),    // 30天/季内
      mp({ projectId: 'C', nodes: [{ name: '初验', planDate: '2026-03-15', actualDate: '2026-03-09', priority: 'mid' }] }), // 已完成→不计
    ]
    const w = reminderBuckets(ps, now).windows
    expect(w['7d']).toMatchObject({ high: 1, mid: 0, low: 0, projectCount: 1 })
    expect(w['30d']).toMatchObject({ high: 1, low: 1, projectCount: 2 })
    expect(w.quarter).toMatchObject({ high: 1, low: 1, projectCount: 2 })
  })
})

describe('finalAcceptStats', () => {
  const ps = [
    mp({ projectId: 'A', contract: 1000000, nodes: [{ name: '终验', planDate: '2026-02-10', actualDate: '2026-02-20', priority: 'high' }] }),
    mp({ projectId: 'B', contract: 2000000, nodes: [{ name: '服务完成', planDate: '2026-05-10', actualDate: '', priority: 'high' }] }),
    mp({ projectId: 'C', contract: 500000, nodes: [{ name: '到货', planDate: '2026-02-01', actualDate: '', priority: 'low' }] }), // 无终验/服务完成→不计
  ]
  it('按季分桶：计划/实际数 + 金额(万) + 完成判定', () => {
    const r = finalAcceptStats(ps, 'quarter')
    expect(r.periods).toEqual(['2026Q1', '2026Q2'])
    expect(r.planCount).toEqual([1, 1])
    expect(r.actualCount).toEqual([1, 0])     // 仅 A 实际完成
    expect(r.planAmountWan).toEqual([100, 200])
    expect(r.actualAmountWan).toEqual([100, 0])
  })
  it('按月 + year 过滤', () => {
    const r = finalAcceptStats(ps, 'month', 2026)
    expect(r.periods).toEqual(['2026-02', '2026-05'])
    const r2 = finalAcceptStats(ps, 'month', 2025)
    expect(r2.periods).toEqual([])
  })
})

describe('availableYears', () => {
  const ps = [
    mp({ nodes: [{ name: '终验', planDate: '2025-12-01', actualDate: '', priority: 'high' }] }),
    mp({ nodes: [{ name: '到货', planDate: '2026-03-01', actualDate: '', payStage: '到货款', priority: 'high' }] }),
  ]
  it('finalAccept 取终验/服务完成年份', () => {
    expect(availableYears(ps, 'finalAccept')).toEqual([2025])
  })
  it('node 取分布相关节点年份', () => {
    expect(availableYears(ps, 'node')).toEqual([2025, 2026])
  })
})
```

- [ ] **Step 2: 跑红**

Run: `cd frontend && npm run test:run -- src/lib/milestoneAnalytics.test.ts`
Expected: FAIL（新函数未定义）。

- [ ] **Step 3: 追加实现**

在 `milestoneAnalytics.ts` 末尾追加：

```ts
// ---- 共享助手 ----
function nodeByName(p: MilestoneProject, kw: string): MilestoneItem | undefined {
  return p.nodes.find((n) => (n.name ?? '').includes(kw))
}
function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d: Date, n: number): string {
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}
function quarterRange(d: Date): [string, string] {
  const sm = Math.floor(d.getMonth() / 3) * 3
  return [ymd(new Date(d.getFullYear(), sm, 1)), ymd(new Date(d.getFullYear(), sm + 3, 0))]
}
function periodKey(dateStr: string, gran: 'quarter' | 'month'): string {
  const y = dateStr.slice(0, 4)
  if (gran === 'month') return `${y}-${dateStr.slice(5, 7)}`
  const q = Math.floor((parseInt(dateStr.slice(5, 7), 10) - 1) / 3) + 1
  return `${y}Q${q}`
}
function prOf(it: MilestoneItem): 'high' | 'mid' | 'low' {
  const p = (it as any).priority
  return p === 'high' || p === 'mid' ? p : 'low'
}

// ---- 到期提醒（A 图）----
export interface ReminderWindow { high: number; mid: number; low: number; projectCount: number }
/** now 由调用方传入(纯函数,便于测试)。窗口:7天[今,今+7]、30天[今,今+30]、本季度[季初,季末];actualDate 非空(已完成)不计。 */
export function reminderBuckets(
  ps: MilestoneProject[], now: Date,
): { windows: Record<'7d' | '30d' | 'quarter', ReminderWindow> } {
  const today = ymd(now), d7 = addDays(now, 7), d30 = addDays(now, 30)
  const [qs, qe] = quarterRange(now)
  type Acc = { high: number; mid: number; low: number; pids: Set<string> }
  const mk = (): Acc => ({ high: 0, mid: 0, low: 0, pids: new Set() })
  const w7 = mk(), w30 = mk(), wq = mk()
  const bump = (acc: Acc, pr: 'high' | 'mid' | 'low', pid: string) => { acc[pr]++; acc.pids.add(pid) }
  for (const p of ps) {
    for (const it of p.nodes) {
      if ((it.actualDate ?? '').trim()) continue
      const pd = (it.planDate ?? '').slice(0, 10)
      if (!pd) continue
      const pr = prOf(it)
      if (pd >= today && pd <= d7) bump(w7, pr, p.projectId)
      if (pd >= today && pd <= d30) bump(w30, pr, p.projectId)
      if (pd >= qs && pd <= qe) bump(wq, pr, p.projectId)
    }
  }
  const fin = (a: Acc): ReminderWindow => ({ high: a.high, mid: a.mid, low: a.low, projectCount: a.pids.size })
  return { windows: { '7d': fin(w7), '30d': fin(w30), quarter: fin(wq) } }
}

// ---- 终验完成情况（B 图）----
export interface FinalAcceptStats { periods: string[]; planCount: number[]; actualCount: number[]; planAmountWan: number[]; actualAmountWan: number[] }
/** 按项目计:终验 planDate 优先、缺则服务完成 planDate 落计划桶;终验或服务完成 actualDate 任一非空→实际完成;金额=contract÷1e4。 */
export function finalAcceptStats(ps: MilestoneProject[], gran: 'quarter' | 'month', year: number | null = null): FinalAcceptStats {
  const planC: Record<string, number> = {}, actC: Record<string, number> = {}, planA: Record<string, number> = {}, actA: Record<string, number> = {}
  const keys = new Set<string>()
  for (const p of ps) {
    const fin = nodeByName(p, '终验'), svc = nodeByName(p, '服务完成')
    const planDate = ((fin?.planDate || svc?.planDate) ?? '').slice(0, 10)
    if (!planDate) continue
    if (year != null && parseInt(planDate.slice(0, 4), 10) !== year) continue
    const k = periodKey(planDate, gran)
    keys.add(k)
    planC[k] = (planC[k] || 0) + 1
    planA[k] = (planA[k] || 0) + p.contract / 10000
    if ((fin?.actualDate ?? '').trim() || (svc?.actualDate ?? '').trim()) {
      actC[k] = (actC[k] || 0) + 1
      actA[k] = (actA[k] || 0) + p.contract / 10000
    }
  }
  const periods = [...keys].sort()
  return {
    periods,
    planCount: periods.map((k) => planC[k] || 0),
    actualCount: periods.map((k) => actC[k] || 0),
    planAmountWan: periods.map((k) => +(planA[k] || 0).toFixed(2)),
    actualAmountWan: periods.map((k) => +(actA[k] || 0).toFixed(2)),
  }
}

// ---- 可选年份 ----
export function availableYears(ps: MilestoneProject[], scope: 'finalAccept' | 'node'): number[] {
  const ys = new Set<number>()
  for (const p of ps) {
    if (scope === 'finalAccept') {
      const fin = nodeByName(p, '终验'), svc = nodeByName(p, '服务完成')
      const y = ((fin?.planDate || svc?.planDate) ?? '').slice(0, 4)
      if (y) ys.add(parseInt(y, 10))
    } else {
      for (const n of p.nodes) {
        if (!distSeriesOf(n)) continue
        const y = (n.planDate ?? '').slice(0, 4)
        if (y) ys.add(parseInt(y, 10))
      }
    }
  }
  return [...ys].filter((y) => !Number.isNaN(y)).sort((a, b) => a - b)
}
```

> 注意：`availableYears('node')` 引用 `distSeriesOf`，该函数在 Task 3 追加到同文件。Task 2 与 Task 3 顺序执行、同文件，Task 3 完成后 `distSeriesOf` 即存在；但 Task 2 的 `availableYears('node')` 测试在 Task 2 阶段会因 `distSeriesOf` 未定义而 typecheck/运行失败。**因此 Task 2 的 `distSeriesOf` 也在本步一并定义**（见下），Task 3 直接复用、不重复定义。

在 Task 2 实现末尾**先行追加** `distSeriesOf`（Task 3 复用）：

```ts
// ---- 节点分布系列判定（B/E 共用；E 图与下钻在 Task 3）----
export type DistSeries = 'arrival' | 'firstAccept' | 'finalAccept' | 'serviceDone'
/** 到货/初验需 payStage 非空(关联回款);终验/服务完成只需名称匹配。 */
export function distSeriesOf(n: MilestoneItem): DistSeries | null {
  const name = n.name ?? ''
  const hasPay = !!((n as any).payStage && String((n as any).payStage).trim())
  if (name.includes('到货') && hasPay) return 'arrival'
  if (name.includes('初验') && hasPay) return 'firstAccept'
  if (name.includes('终验')) return 'finalAccept'
  if (name.includes('服务完成')) return 'serviceDone'
  return null
}
```

- [ ] **Step 4: 跑绿 + typecheck**

Run: `cd frontend && npm run test:run -- src/lib/milestoneAnalytics.test.ts && npm run typecheck`
Expected: PASS；typecheck 无错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/milestoneAnalytics.ts frontend/src/lib/milestoneAnalytics.test.ts
git commit -m "feat(milestone): lib 到期提醒+终验完成+可选年份+系列判定 (SP-B1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: lib 部门分布 + 节点分布 + 下钻取数

**Files:**
- Modify: `frontend/src/lib/milestoneAnalytics.ts`（追加）
- Test: `frontend/src/lib/milestoneAnalytics.test.ts`（追加）

**Interfaces:**
- Consumes: Task 1 `MilestoneProject`、Task 2 `distSeriesOf`/`DistSeries`。
- Produces: `deptAbnormalTop15(ps)`、`DeptAbnormal`、`deptComplianceRate(ps, deptOrder)`、`DeptCompliance`、`nodeDistribution(ps, year)`、`NodeDistribution`、`nodesForDrill(ps, seriesKey, monthIndex, year)`、`MilestoneDrillRow`。

- [ ] **Step 1: 追加失败测试**

import 追加并新增 describe：

```ts
import { deptAbnormalTop15, deptComplianceRate, nodeDistribution, nodesForDrill } from './milestoneAnalytics'

describe('deptAbnormalTop15 / deptComplianceRate', () => {
  const ps = [
    mp({ projectId: '1', orgL4: 'D1', status: '延期' }),
    mp({ projectId: '2', orgL4: 'D1', status: '严重延期' }),
    mp({ projectId: '3', orgL4: 'D1', status: '正常' }),
    mp({ projectId: '4', orgL4: 'D2', status: '未发布' }),
    mp({ projectId: '5', orgL4: '', status: '延期' }), // orgL4 空→排除
  ]
  it('按异常数降序 + 排除空部门', () => {
    const r = deptAbnormalTop15(ps)
    expect(r.map((x) => x.orgL4)).toEqual(['D1', 'D2'])
    expect(r[0]).toMatchObject({ orgL4: 'D1', delayed: 1, severe: 1, unpublished: 0, abnormal: 2 })
    expect(r[1]).toMatchObject({ orgL4: 'D2', unpublished: 1, abnormal: 1 })
  })
  it('合规率=正常/部门总数×100,按 deptOrder', () => {
    const r = deptComplianceRate(ps, ['D1', 'D2'])
    expect(r).toEqual([{ orgL4: 'D1', rate: 33.3 }, { orgL4: 'D2', rate: 0 }])
  })
})

describe('nodeDistribution / nodesForDrill', () => {
  const ps = [
    mp({ projectId: 'A', orgL4: 'D1', status: '正常', nodes: [
      { name: '到货', planDate: '2026-03-05', actualDate: '', payStage: '到货款', priority: 'high' }, // arrival(有payStage)
      { name: '到货', planDate: '2026-03-20', actualDate: '', payStage: '', priority: 'low' },          // 到货无payStage→不计
      { name: '终验', planDate: '2026-06-10', actualDate: '', priority: 'high' },                       // finalAccept(无需payStage)
    ] }),
    mp({ projectId: 'B', orgL4: 'D2', status: '延期', nodes: [
      { name: '服务完成', planDate: '2026-03-15', actualDate: '', priority: 'high' },                   // serviceDone(3月)
    ] }),
  ]
  it('按月按系列计数(payStage 条件)', () => {
    const d = nodeDistribution(ps, 2026)
    expect(d.arrival[2]).toBe(1)      // 3月 1 个到货(有payStage)
    expect(d.serviceDone[2]).toBe(1)  // 3月 1 个服务完成
    expect(d.finalAccept[5]).toBe(1)  // 6月 1 个终验
    expect(d.arrival.reduce((s, n) => s + n, 0)).toBe(1) // 无payStage的到货未计
  })
  it('year 过滤', () => {
    expect(nodeDistribution(ps, 2025).arrival.every((n) => n === 0)).toBe(true)
  })
  it('下钻取该系列+月份行', () => {
    const rows = nodesForDrill(ps, 'serviceDone', 2, 2026) // 3月=index2
    expect(rows).toEqual([{ projectId: 'B', projectName: 'x', manager: '', orgL4: 'D2', node: '服务完成', planDate: '2026-03-15', status: '延期' }])
  })
})
```

- [ ] **Step 2: 跑红**

Run: `cd frontend && npm run test:run -- src/lib/milestoneAnalytics.test.ts`
Expected: FAIL（新函数未定义）。

- [ ] **Step 3: 追加实现**

`milestoneAnalytics.ts` 末尾追加：

```ts
// ---- 部门异常分布（C 图）+ 合规率（D 图）----
export interface DeptAbnormal { orgL4: string; delayed: number; severe: number; unpublished: number; abnormal: number }
export function deptAbnormalTop15(ps: MilestoneProject[]): DeptAbnormal[] {
  const m: Record<string, DeptAbnormal> = {}
  for (const p of ps) {
    const d = p.orgL4
    if (!d) continue
    if (!m[d]) m[d] = { orgL4: d, delayed: 0, severe: 0, unpublished: 0, abnormal: 0 }
    if (p.status === '延期') { m[d].delayed++; m[d].abnormal++ }
    else if (p.status === '严重延期') { m[d].severe++; m[d].abnormal++ }
    else if (p.status === '未发布') { m[d].unpublished++; m[d].abnormal++ }
  }
  return Object.values(m).sort((a, b) => b.abnormal - a.abnormal).slice(0, 15)
}

export interface DeptCompliance { orgL4: string; rate: number }
export function deptComplianceRate(ps: MilestoneProject[], deptOrder: string[]): DeptCompliance[] {
  const tot: Record<string, number> = {}, norm: Record<string, number> = {}
  for (const p of ps) {
    const d = p.orgL4
    if (!d) continue
    tot[d] = (tot[d] || 0) + 1
    if (p.status === '正常') norm[d] = (norm[d] || 0) + 1
  }
  return deptOrder.map((d) => ({ orgL4: d, rate: tot[d] ? +(((norm[d] || 0) / tot[d]) * 100).toFixed(1) : 0 }))
}

// ---- 关键节点分布（E 图）+ 下钻 ----
export interface NodeDistribution { months: number[]; arrival: number[]; firstAccept: number[]; finalAccept: number[]; serviceDone: number[] }
export function nodeDistribution(ps: MilestoneProject[], year: number | null): NodeDistribution {
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const z = (): number[] => months.map(() => 0)
  const out: NodeDistribution = { months, arrival: z(), firstAccept: z(), finalAccept: z(), serviceDone: z() }
  for (const p of ps) {
    for (const n of p.nodes) {
      const series = distSeriesOf(n)
      if (!series) continue
      const pd = (n.planDate ?? '').slice(0, 10)
      if (!pd) continue
      if (year != null && parseInt(pd.slice(0, 4), 10) !== year) continue
      const mo = parseInt(pd.slice(5, 7), 10)
      if (mo < 1 || mo > 12) continue
      out[series][mo - 1]++
    }
  }
  return out
}

export interface MilestoneDrillRow { projectId: string; projectName: string; manager: string; orgL4: string; node: string; planDate: string; status: MilestoneStatus }
export function nodesForDrill(ps: MilestoneProject[], seriesKey: DistSeries, monthIndex: number, year: number | null): MilestoneDrillRow[] {
  const rows: MilestoneDrillRow[] = []
  for (const p of ps) {
    for (const n of p.nodes) {
      if (distSeriesOf(n) !== seriesKey) continue
      const pd = (n.planDate ?? '').slice(0, 10)
      if (!pd) continue
      if (year != null && parseInt(pd.slice(0, 4), 10) !== year) continue
      if (parseInt(pd.slice(5, 7), 10) - 1 !== monthIndex) continue
      rows.push({ projectId: p.projectId, projectName: p.projectName, manager: p.manager, orgL4: p.orgL4, node: n.name ?? '', planDate: pd, status: p.status })
    }
  }
  return rows
}
```

- [ ] **Step 4: 跑绿 + typecheck**

Run: `cd frontend && npm run test:run -- src/lib/milestoneAnalytics.test.ts && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/milestoneAnalytics.ts frontend/src/lib/milestoneAnalytics.test.ts
git commit -m "feat(milestone): lib 部门异常/合规率+节点分布+下钻取数 (SP-B1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 共享图表基建（MUTED 色 + ChartBox 点击转发）

**Files:**
- Modify: `frontend/src/charts/echartsTheme.ts`
- Modify: `frontend/src/charts/echartsTheme.tokens.test.ts`
- Modify: `frontend/src/charts/ChartBox.vue`
- Modify: `frontend/src/charts/ChartBox.test.ts`

**Interfaces:**
- Produces: `MUTED_LIGHT='#6b6b6b'`、`MUTED_DARK='#8b8e93'`（镜像 theme.css `--mut`）；`ChartBox` 新增 emit `datapoint-click`(转发 VChart 的 ECharts `click` 事件)。

- [ ] **Step 1: 追加失败测试（契约 + 转发）**

`echartsTheme.tokens.test.ts`：import 行追加 `MUTED_LIGHT, MUTED_DARK`，并在文件末尾追加 describe：

```ts
describe('ECharts 双源契约 · 中性灰(MUTED)', () => {
  it('MUTED_* 与 theme.css --mut 同步', () => {
    expect(MUTED_LIGHT).toBe(cssVar(root, '--mut'))
    expect(MUTED_DARK).toBe(cssVar(dark, '--mut'))
  })
})
```

`ChartBox.test.ts` 文件末尾 describe('ChartBox') 内追加用例：

```ts
  it('转发 VChart click 为 datapoint-click', async () => {
    const wrapper = mount(ChartBox, {
      props: { option: {} },
      global: { stubs: { VChart: VChartStub } },
    })
    wrapper.findComponent({ name: 'VChart' }).vm.$emit('click', { seriesName: '终验', dataIndex: 2 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('datapoint-click')?.[0]?.[0]).toMatchObject({ seriesName: '终验', dataIndex: 2 })
  })
```

- [ ] **Step 2: 跑红**

Run: `cd frontend && npm run test:run -- src/charts/echartsTheme.tokens.test.ts src/charts/ChartBox.test.ts`
Expected: FAIL（`MUTED_*` 未导出；ChartBox 未转发事件）。

- [ ] **Step 3: 实现**

`echartsTheme.ts` 末尾追加（紧跟 `STATUS_DARK` 之后）：

```ts
// 中性灰镜像(--mut):里程碑「未发布」等无文字状态系列用;契约测试与 theme.css 同步
export const MUTED_LIGHT = '#6b6b6b'
export const MUTED_DARK = '#8b8e93'
```

`ChartBox.vue`：在 `withDefaults(defineProps...)` 之后加 emit，并在模板 VChart 上转发 click。改 `<script setup>`：

```ts
withDefaults(
  defineProps<{
    option: Record<string, any>
    height?: string
  }>(),
  { height: '320px' },
)

const emit = defineEmits<{ 'datapoint-click': [any] }>()
```

模板 VChart 加 `@click`：

```html
    <VChart :option="option" :theme="theme" autoresize @click="(e: any) => emit('datapoint-click', e)" />
```

- [ ] **Step 4: 跑绿 + typecheck**

Run: `cd frontend && npm run test:run -- src/charts/echartsTheme.tokens.test.ts src/charts/ChartBox.test.ts && npm run typecheck`
Expected: PASS（含既有 ChartBox 3 用例不受影响）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/charts/echartsTheme.ts frontend/src/charts/echartsTheme.tokens.test.ts frontend/src/charts/ChartBox.vue frontend/src/charts/ChartBox.test.ts
git commit -m "feat(charts): MUTED 中性灰镜像 + ChartBox datapoint-click 转发 (SP-B1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: MetricGrid 通用 KPI 卡

**Files:**
- Create: `frontend/src/components/MetricGrid.vue`
- Test: `frontend/src/components/MetricGrid.test.ts`

**Interfaces:**
- Produces: `MetricGrid`，props `items: { k: string; v: string; sub?: string; cls?: string }[]`、`colMin?: string`(默认 `'150px'`)。

- [ ] **Step 1: 写失败测试**

`frontend/src/components/MetricGrid.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricGrid from './MetricGrid.vue'

describe('MetricGrid', () => {
  it('渲染每项 标签/主值/副标 且应用 cls', () => {
    const w = mount(MetricGrid, { props: { items: [
      { k: '项目总数', v: '624' },
      { k: '正常', v: '331', sub: '53.0%', cls: 'ok' },
    ] } })
    const cards = w.findAll('.mg-card')
    expect(cards).toHaveLength(2)
    expect(w.text()).toContain('项目总数')
    expect(w.text()).toContain('624')
    expect(w.text()).toContain('331')
    expect(w.text()).toContain('53.0%')
    expect(cards[1].find('.mg-v').classes()).toContain('ok')
  })
})
```

- [ ] **Step 2: 跑红**

Run: `cd frontend && npm run test:run -- src/components/MetricGrid.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

`frontend/src/components/MetricGrid.vue`：

```vue
<script setup lang="ts">
withDefaults(
  defineProps<{
    items: { k: string; v: string; sub?: string; cls?: string }[]
    colMin?: string
  }>(),
  { colMin: '150px' },
)
</script>

<template>
  <div class="u-grid-auto mg" :style="{ '--col-min': colMin }">
    <div v-for="(it, i) in items" :key="i" class="mg-card">
      <div class="mg-k">{{ it.k }}</div>
      <div class="mg-v u-num" :class="it.cls">{{ it.v }}</div>
      <div v-if="it.sub" class="mg-sub u-num">{{ it.sub }}</div>
    </div>
  </div>
</template>

<style scoped>
.mg { margin-bottom: var(--sp-3); }
.mg-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.mg-k { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.mg-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.mg-v.ok { color: var(--ok); }
.mg-v.warn { color: var(--warn); }
.mg-v.danger { color: var(--danger); }
.mg-v.mut { color: var(--mut); }
.mg-sub { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-1); }
</style>
```

- [ ] **Step 4: 跑绿 + typecheck**

Run: `cd frontend && npm run test:run -- src/components/MetricGrid.test.ts && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MetricGrid.vue frontend/src/components/MetricGrid.test.ts
git commit -m "feat(components): MetricGrid 通用 KPI 卡网格 (SP-B1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: MilestoneDrillModal 节点下钻弹窗

**Files:**
- Create: `frontend/src/components/MilestoneDrillModal.vue`
- Test: `frontend/src/components/MilestoneDrillModal.test.ts`

**Interfaces:**
- Consumes: Task 3 `MilestoneDrillRow`、`Modal.vue`、`DataTable.vue`。
- Produces: `MilestoneDrillModal`，props `modelValue: boolean`、`title: string`、`rows: MilestoneDrillRow[]`；emit `update:modelValue`；行点击 `router.push('/project/'+projectId)` 并关闭。

- [ ] **Step 1: 写失败测试**

`frontend/src/components/MilestoneDrillModal.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneDrillModal from './MilestoneDrillModal.vue'
import DataTable from './DataTable.vue'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

const rows = [
  { projectId: 'P1', projectName: '甲', manager: '张', orgL4: 'D1', node: '终验', planDate: '2026-06-01', status: '正常' },
]

describe('MilestoneDrillModal', () => {
  it('打开时把 rows 传给 DataTable', () => {
    const w = mount(MilestoneDrillModal, { props: { modelValue: true, title: '终验 · 6月', rows }, global: { plugins: [ElementPlus] } })
    expect(w.findComponent(DataTable).props('rows')).toHaveLength(1)
    expect(w.text()).toContain('终验 · 6月')
  })
  it('行点击跳项目详情并关闭', async () => {
    pushSpy.mockClear()
    const w = mount(MilestoneDrillModal, { props: { modelValue: true, title: 't', rows }, global: { plugins: [ElementPlus] } })
    await w.findComponent(DataTable).vm.$emit('row-click', rows[0])
    expect(pushSpy).toHaveBeenCalledWith('/project/P1')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
```

- [ ] **Step 2: 跑红**

Run: `cd frontend && npm run test:run -- src/components/MilestoneDrillModal.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

`frontend/src/components/MilestoneDrillModal.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import type { MilestoneDrillRow } from '@/lib/milestoneAnalytics'

const props = defineProps<{ modelValue: boolean; title: string; rows: MilestoneDrillRow[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const router = useRouter()

const open = computed({ get: () => props.modelValue, set: (v: boolean) => emit('update:modelValue', v) })

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 140 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'manager', label: '经理', width: 80 },
  { key: 'orgL4', label: 'L4', width: 110 },
  { key: 'node', label: '节点', width: 100 },
  { key: 'planDate', label: '计划时间', width: 110, num: true },
  { key: 'status', label: '状态', width: 90 },
]

function onRow(row: Record<string, any>) {
  emit('update:modelValue', false)
  router.push('/project/' + row.projectId)
}
</script>

<template>
  <Modal v-model="open" :title="title" width="60%">
    <DataTable :columns="COLS" :rows="rows" clickable @row-click="onRow">
      <template #cell-projectId="{ value }"><span class="mdm-link">{{ value }}</span></template>
    </DataTable>
  </Modal>
</template>

<style scoped>
.mdm-link { color: var(--accent); cursor: pointer; }
</style>
```

- [ ] **Step 4: 跑绿 + typecheck**

Run: `cd frontend && npm run test:run -- src/components/MilestoneDrillModal.test.ts && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MilestoneDrillModal.vue frontend/src/components/MilestoneDrillModal.test.ts
git commit -m "feat(components): MilestoneDrillModal 节点下钻弹窗 (SP-B1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: MilestoneView 骨架 + KPI + 剔除控件 + 图 A/C/D

**Files:**
- Modify: `frontend/src/views/MilestoneView.vue`（替换 stub）
- Test: `frontend/src/views/MilestoneView.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1-3 lib、Task 4 `MUTED_*`/`STATUS_*`/`CHART_*`、Task 5 `MetricGrid`、`SegToggle`、`ChartBox`、stores（data/filter/projectTags/settings）。
- Produces: 页面骨架 + `mps`/`kpi` computed + 剔除控件 + 图 A(到期提醒)/C(部门异常)/D(合规率)。图 B/E 与下钻在 Task 8 追加。

- [ ] **Step 1: 写失败测试**

`frontend/src/views/MilestoneView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MilestoneView from './MilestoneView.vue'
import ChartBox from '@/charts/ChartBox.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    projectOverview: { projects: [], columns: [] }, naguanMap: {}, naguanExclude: {}, followupRecords: {},
    projects: [
      { projectId: 'A', projectName: '甲', projectManager: '张', orgL4: 'D1', orgL3_1: 'S', isPresale: false, paymentPmis: { contract: 1000000 } },
      { projectId: 'B', projectName: '乙', projectManager: '李', orgL4: 'D1', orgL3_1: 'S', isPresale: false, paymentPmis: { contract: 2000000 } },
    ],
    projectPmis: {
      A: { progress: { 里程碑进度状态: '正常' }, status: { 项目类型: '正常实施类' } },
      B: { progress: { 里程碑进度状态: '严重延期' }, status: { 项目类型: '正常实施类' } },
    },
    projectMilestones: {
      A: [{ name: '终验', planDate: '2026-06-01', actualDate: '', priority: 'high' }],
      B: [{ name: '到货', planDate: '2026-03-01', actualDate: '', payStage: '到货款', priority: 'high' }],
    },
  } as any
}

const opts = { global: { plugins: [ElementPlus], stubs: { VChart: true } } }

describe('MilestoneView 概览', () => {
  it('渲染标题 + KPI(MetricGrid 5 卡)', () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect(w.text()).toContain('里程碑管理')
    expect(w.findComponent(MetricGrid).props('items')).toHaveLength(5)
    expect(w.text()).toContain('项目总数')
  })
  it('KPI 计数正确(正常1/严重延期1/未发布0)', () => {
    seed()
    const w = mount(MilestoneView, opts)
    const items = w.findComponent(MetricGrid).props('items') as any[]
    expect(items.find((i) => i.k === '正常').v).toBe('1')
    expect(items.find((i) => i.k === '严重延期').v).toBe('1')
    expect(items.find((i) => i.k === '项目总数').v).toBe('2')
  })
  it('渲染图 A/C/D 三个 ChartBox', () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect(w.findAllComponents(ChartBox).length).toBeGreaterThanOrEqual(3)
  })
  it('剔除控件开关写 filter.setExclude', async () => {
    seed()
    const f = useFilterStore()
    const spy = vi.spyOn(f, 'setExclude')
    const w = mount(MilestoneView, opts)
    await w.get('[data-test="ms-exclude-switch"] input').setValue(true)
    expect(spy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑红**

Run: `cd frontend && npm run test:run -- src/views/MilestoneView.test.ts`
Expected: FAIL（MilestoneView 仍是 stub）。

- [ ] **Step 3: 实现（替换整个 MilestoneView.vue）**

`frontend/src/views/MilestoneView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useSettingsStore } from '@/stores/settings'
import type { Project, ProjectPmis, MilestoneItem } from '@/types/analysis'
import {
  buildMilestoneProjects, statusKpis,
  reminderBuckets, deptAbnormalTop15, deptComplianceRate,
} from '@/lib/milestoneAnalytics'
import { STATUS_LIGHT, STATUS_DARK, MUTED_LIGHT, MUTED_DARK } from '@/charts/echartsTheme'
import MetricGrid from '@/components/MetricGrid.vue'
import ChartBox from '@/charts/ChartBox.vue'

const data = useDataStore()
const filter = useFilterStore()
const projectTags = useProjectTagsStore()
const settings = useSettingsStore()

onMounted(() => {
  if (!data.data) data.load()
  if (!projectTags.loaded) projectTags.load()
})

const dark = computed(() => settings.theme === 'dark')
const sc = computed(() => (dark.value ? STATUS_DARK : STATUS_LIGHT))
const muted = computed(() => (dark.value ? MUTED_DARK : MUTED_LIGHT))

// 域：主域 ∩ 全局标签剔除
const mps = computed(() => buildMilestoneProjects(
  (data.data?.projects ?? []) as Project[],
  (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
  (data.data?.projectMilestones ?? {}) as Record<string, MilestoneItem[]>,
  { excludeOn: filter.excludeOn, excludedIds: filter.excludedIds },
))

// 剔除控件（镜像 /data：开关 + 标签多选，写 filter.setExclude，全局持久化）
const excludeOn = computed({ get: () => filter.excludeOn, set: (v: boolean) => filter.setExclude(v, filter.excludeTags) })
const excludeTags = computed({ get: () => filter.excludeTags, set: (v: string[]) => filter.setExclude(filter.excludeOn, v) })

// KPI
const kpi = computed(() => statusKpis(mps.value))
const kpiItems = computed(() => {
  const k = kpi.value
  const p = (n: number) => (k.total > 0 ? (n / k.total * 100).toFixed(1) + '%' : '-')
  return [
    { k: '项目总数', v: String(k.total) },
    { k: '正常', v: String(k.normal), sub: p(k.normal), cls: 'ok' },
    { k: '延期', v: String(k.delayed), sub: p(k.delayed), cls: 'warn' },
    { k: '严重延期', v: String(k.severe), sub: p(k.severe), cls: 'danger' },
    { k: '未发布', v: String(k.unpublished), sub: p(k.unpublished), cls: 'mut' },
  ]
})

const dataLabel = { show: true, formatter: (p: any) => p.value || '' }

// A 到期提醒（横向堆叠条）
const reminderOption = computed(() => {
  const w = reminderBuckets(mps.value, new Date()).windows
  const keys = ['7d', '30d', 'quarter'] as const
  const s = sc.value
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['高优先级', '中优先级', '低优先级'], bottom: 0 },
    grid: { left: 80, right: 20, top: 10, bottom: 40 },
    xAxis: { type: 'value', name: '节点数' },
    yAxis: { type: 'category', data: ['未来7天', '未来30天', '本季度'] },
    series: [
      { name: '高优先级', type: 'bar', stack: 't', color: s.danger, label: dataLabel, data: keys.map((k) => w[k].high) },
      { name: '中优先级', type: 'bar', stack: 't', color: s.warn, label: dataLabel, data: keys.map((k) => w[k].mid) },
      { name: '低优先级', type: 'bar', stack: 't', color: s.ok, label: dataLabel, data: keys.map((k) => w[k].low) },
    ],
  }
})

// C/D 部门（同序 Top15）
function wrapDept(s: string): string { return s.replace(/(服务组|一部|二部|三部|四部)/, '\n$1') }
const deptTop = computed(() => deptAbnormalTop15(mps.value))
const deptOrder = computed(() => deptTop.value.map((d) => d.orgL4))
const deptAbnormalOption = computed(() => {
  const d = deptTop.value, s = sc.value
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['延期', '严重延期', '未发布'], bottom: 0 },
    grid: { left: 40, right: 20, top: 10, bottom: 70 },
    xAxis: { type: 'category', data: d.map((x) => wrapDept(x.orgL4)), axisLabel: { interval: 0, fontSize: 11 } },
    yAxis: { type: 'value', name: '异常项目数' },
    series: [
      { name: '延期', type: 'bar', stack: 'ab', color: s.warn, label: dataLabel, data: d.map((x) => x.delayed) },
      { name: '严重延期', type: 'bar', stack: 'ab', color: s.danger, label: dataLabel, data: d.map((x) => x.severe) },
      { name: '未发布', type: 'bar', stack: 'ab', color: muted.value, label: dataLabel, data: d.map((x) => x.unpublished) },
    ],
  }
})
const complianceOption = computed(() => {
  const c = deptComplianceRate(mps.value, deptOrder.value), s = sc.value
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 20, bottom: 70 },
    xAxis: { type: 'category', data: c.map((x) => wrapDept(x.orgL4)), axisLabel: { interval: 0, fontSize: 11 } },
    yAxis: { type: 'value', name: '合规率(%)', min: 0, max: 100 },
    series: [{
      name: '里程碑合规率', type: 'line', smooth: true, color: s.ok, areaStyle: { opacity: 0.08 },
      label: { show: true, formatter: (p: any) => p.value + '%', color: (p: any) => (p.value < 100 ? s.danger : s.ok) },
      data: c.map((x) => x.rate),
    }],
  }
})
</script>

<template>
  <div class="mv-view">
    <h2 class="mv-title">里程碑管理</h2>

    <div class="mv-toolbar">
      <span class="mv-ex-label">按标签排除</span>
      <el-switch data-test="ms-exclude-switch" v-model="excludeOn" />
      <el-select v-model="excludeTags" size="small" multiple collapse-tags clearable placeholder="选要排除的标签" style="width: 220px">
        <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
      </el-select>
    </div>

    <div v-if="!mps.length" class="mv-empty">暂无主域里程碑数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>

    <template v-else>
      <MetricGrid :items="kpiItems" />

      <div class="mv-grid2">
        <div class="mv-card"><div class="mv-card-h">里程碑到期提醒</div><ChartBox :option="reminderOption" height="240px" /></div>
        <div class="mv-card"><div class="mv-card-h">部门异常项目分布(Top15)</div><ChartBox :option="deptAbnormalOption" height="240px" /></div>
        <div class="mv-card"><div class="mv-card-h">部门里程碑合规率</div><ChartBox :option="complianceOption" height="240px" /></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mv-view { padding: var(--sp-4); }
.mv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.mv-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mv-ex-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.mv-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: var(--gap-card); }
.mv-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3); margin-bottom: var(--sp-3); }
.mv-card-h { font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-2); }
.mv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
</style>
```

- [ ] **Step 4: 跑绿 + typecheck**

Run: `cd frontend && npm run test:run -- src/views/MilestoneView.test.ts && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/MilestoneView.vue frontend/src/views/MilestoneView.test.ts
git commit -m "feat(milestone): MilestoneView 骨架+KPI+剔除控件+到期提醒/部门异常/合规率三图 (SP-B1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: MilestoneView 图 B(终验完成) + 图 E(节点分布·下钻)

**Files:**
- Modify: `frontend/src/views/MilestoneView.vue`（追加）
- Test: `frontend/src/views/MilestoneView.test.ts`（追加）

**Interfaces:**
- Consumes: Task 2 `finalAcceptStats`/`availableYears`、Task 3 `nodeDistribution`/`nodesForDrill`/`DistSeries`/`MilestoneDrillRow`、Task 4 `CHART_*` + ChartBox `datapoint-click`、Task 6 `MilestoneDrillModal`、`SegToggle`。

- [ ] **Step 1: 追加失败测试**

在 `MilestoneView.test.ts` 顶部 import 追加 `import MilestoneDrillModal from '@/components/MilestoneDrillModal.vue'`、`import SegToggle from '@/components/SegToggle.vue'`，并新增 describe：

```ts
describe('MilestoneView 终验/节点分布', () => {
  it('渲染 5 个 ChartBox(含 B 双图 + E)', () => {
    seed()
    const w = mount(MilestoneView, opts)
    // A + C + D + B(项目数) + B(金额) + E = 6
    expect(w.findAllComponents(ChartBox).length).toBe(6)
  })
  it('终验图季/月 SegToggle 可切换', async () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect(w.find('[data-test="seg-month"]').exists()).toBe(true)
    await w.get('[data-test="seg-month"]').trigger('click')
    expect((w.vm as any).faGran).toBe('month')
  })
  it('节点分布图点击数据点开下钻 modal', async () => {
    seed()
    const w = mount(MilestoneView, opts)
    ;(w.vm as any).onNodeClick({ seriesName: '到货(关联回款)', dataIndex: 2 })
    await w.vm.$nextTick()
    expect(w.findComponent(MilestoneDrillModal).props('modelValue')).toBe(true)
    expect(w.findComponent(MilestoneDrillModal).props('rows').length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: 跑红**

Run: `cd frontend && npm run test:run -- src/views/MilestoneView.test.ts`
Expected: FAIL（B/E/下钻未实现；`faGran`/`onNodeClick` 未定义）。

- [ ] **Step 3: 追加实现**

3a. `<script setup>` import 段补充：

```ts
import { ref } from 'vue'
import {
  finalAcceptStats, availableYears, nodeDistribution, nodesForDrill,
  type DistSeries, type MilestoneDrillRow,
} from '@/lib/milestoneAnalytics'
import { CHART_LIGHT, CHART_DARK } from '@/charts/echartsTheme'
import SegToggle from '@/components/SegToggle.vue'
import MilestoneDrillModal from '@/components/MilestoneDrillModal.vue'
```

> 说明：`computed`/`onMounted` 已在 Task 7 的 import 行；本步把 `ref` 并入该行（即改为 `import { computed, onMounted, ref } from 'vue'`），并把上面 lib 的具名导入合并进 Task 7 已有的 `from '@/lib/milestoneAnalytics'` 同一条 import（避免重复导入同模块）。

3b. `<script setup>` 末尾追加（图 B/E + 下钻）：

```ts
const chart = computed(() => (dark.value ? CHART_DARK : CHART_LIGHT))
const topLabel = { show: true, position: 'top', formatter: (p: any) => p.value || '' }

// B 终验完成情况（双图：项目数 + 金额万元）
const faGran = ref<'quarter' | 'month'>('quarter')
const faYear = ref<number | null>(null)
const GRAN_OPTS = [{ value: 'quarter', label: '按季度' }, { value: 'month', label: '按月度' }]
const faYearOpts = computed(() => availableYears(mps.value, 'finalAccept'))
const fa = computed(() => finalAcceptStats(mps.value, faGran.value, faYear.value))
const faCountOption = computed(() => {
  const c = chart.value
  return {
    tooltip: { trigger: 'axis' }, legend: { data: ['计划项目数', '实际完成数'], bottom: 0 },
    grid: { left: 40, right: 20, top: 10, bottom: 40 },
    xAxis: { type: 'category', data: fa.value.periods }, yAxis: { type: 'value', name: '项目数' },
    series: [
      { name: '计划项目数', type: 'bar', barWidth: '40%', color: c[5], label: topLabel, data: fa.value.planCount },
      { name: '实际完成数', type: 'bar', barWidth: '22%', barGap: '-55%', color: c[2], label: topLabel, data: fa.value.actualCount },
    ],
  }
})
const faAmountOption = computed(() => {
  const c = chart.value
  return {
    tooltip: { trigger: 'axis' }, legend: { data: ['计划金额', '实际完成金额'], bottom: 0 },
    grid: { left: 50, right: 20, top: 10, bottom: 40 },
    xAxis: { type: 'category', data: fa.value.periods }, yAxis: { type: 'value', name: '金额(万)' },
    series: [
      { name: '计划金额', type: 'bar', barWidth: '40%', color: c[3], label: topLabel, data: fa.value.planAmountWan },
      { name: '实际完成金额', type: 'bar', barWidth: '22%', barGap: '-55%', color: c[1], label: topLabel, data: fa.value.actualAmountWan },
    ],
  }
})

// E 关键节点分布（多线按月，年份过滤，点击下钻）
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const SERIES_KEY: Record<string, DistSeries> = {
  '到货(关联回款)': 'arrival', '初验(关联回款)': 'firstAccept', '终验': 'finalAccept', '服务完成': 'serviceDone',
}
const nodeYear = ref<number | null>(null)
const nodeYearOpts = computed(() => availableYears(mps.value, 'node'))
const nd = computed(() => nodeDistribution(mps.value, nodeYear.value))
const lineLabel = { show: true, formatter: (p: any) => p.value || '', }
const nodeDistOption = computed(() => {
  const c = chart.value, s = sc.value
  const line = (name: string, color: string, d: number[]) => ({ name, type: 'line', smooth: true, color, label: lineLabel, labelLayout: { moveOverlap: 'shiftY' }, data: d })
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['到货(关联回款)', '初验(关联回款)', '终验', '服务完成'], bottom: 0 },
    grid: { left: 40, right: 20, top: 10, bottom: 50 },
    xAxis: { type: 'category', data: MONTH_LABELS }, yAxis: { type: 'value', name: '节点数' },
    series: [
      line('到货(关联回款)', c[0], nd.value.arrival),
      line('初验(关联回款)', c[2], nd.value.firstAccept),
      line('终验', s.warn, nd.value.finalAccept),
      line('服务完成', s.danger, nd.value.serviceDone),
    ],
  }
})

const drillOpen = ref(false)
const drillTitle = ref('')
const drillRows = ref<MilestoneDrillRow[]>([])
function onNodeClick(params: any) {
  const key = SERIES_KEY[params?.seriesName]
  if (!key) return
  drillRows.value = nodesForDrill(mps.value, key, params.dataIndex, nodeYear.value)
  drillTitle.value = `${params.seriesName} · ${MONTH_LABELS[params.dataIndex]}`
  drillOpen.value = true
}
defineExpose({ faGran, onNodeClick })
```

3c. 模板 `<template v-else>` 内，`</MetricGrid>` 之后、`.mv-grid2` 之前插入图 B；并在 `.mv-grid2` 之后插入图 E + 下钻 modal：

```html
      <div class="mv-card">
        <div class="mv-card-h">
          项目终验完成情况
          <span class="mv-card-tools">
            <el-select v-model="faYear" size="small" clearable placeholder="全部年份" style="width: 120px">
              <el-option v-for="y in faYearOpts" :key="y" :value="y" :label="y + '年'" />
            </el-select>
            <SegToggle v-model="faGran" :options="GRAN_OPTS" />
          </span>
        </div>
        <div class="mv-grid2-half">
          <ChartBox :option="faCountOption" height="240px" />
          <ChartBox :option="faAmountOption" height="240px" />
        </div>
      </div>
```

（E 图块，置于 `.mv-grid2` 之后）：

```html
      <div class="mv-card">
        <div class="mv-card-h">
          关键里程碑节点分布
          <span class="mv-card-tools">
            <el-select v-model="nodeYear" size="small" clearable placeholder="全部年份" style="width: 120px">
              <el-option v-for="y in nodeYearOpts" :key="y" :value="y" :label="y + '年'" />
            </el-select>
          </span>
        </div>
        <ChartBox :option="nodeDistOption" height="280px" @datapoint-click="onNodeClick" />
      </div>

      <MilestoneDrillModal v-model="drillOpen" :title="drillTitle" :rows="drillRows" />
```

3d. `<style scoped>` 追加：

```css
.mv-card-h { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.mv-card-tools { display: inline-flex; align-items: center; gap: var(--sp-2); }
.mv-grid2-half { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-card); }
```

> 注意：Task 7 已有 `.mv-card-h` 规则（仅字号/色/间距）；本步用上面这条**覆盖**为 flex 布局——实现时把 Task 7 那条 `.mv-card-h` 删除、替换为本条（保留字号/色：合并为一条含 `display:flex` + 原 `font-size/font-weight/color/margin-bottom`）。即最终：`.mv-card-h { display:flex; align-items:center; justify-content:space-between; gap:var(--sp-3); font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-2); }`。

- [ ] **Step 4: 跑绿 + typecheck**

Run: `cd frontend && npm run test:run -- src/views/MilestoneView.test.ts && npm run typecheck`
Expected: PASS（含 Task 7 用例仍绿）。

- [ ] **Step 5: 全前端套件 + 构建**

Run: `cd frontend && npm run test:run && npm run typecheck && npm run build`
Expected: 全绿；build 成功。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/MilestoneView.vue frontend/src/views/MilestoneView.test.ts
git commit -m "feat(milestone): MilestoneView 终验完成双图 + 节点分布折线·点击下钻 (SP-B1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 收尾验证（全分支，控制器执行，非任务）

- [ ] Run: `bash verify.sh` —— 后端 ruff+pytest + 前端 typecheck/vitest/build 全绿（本计划未碰后端，应原样绿）。
- [ ] 手动冒烟：`python server.py`(:8080) + `cd frontend && npm run dev`(:5173)，访问 `/insight/milestone`：
  - 5 KPI 数与真实分布吻合（正常331/延期8/严重延期258/未发布27/总624，未开剔除时）。
  - 5 图渲染正常（到期提醒横条/终验双柱可切季月+年份/部门 Top15 异常+合规率/节点分布多线）。
  - 点击节点分布折线点弹出下钻 modal，行点击跳 `/project/:id`。
  - 剔除控件：给某标签开启剔除后 KPI/图随之变化；切到带 FilterBar 的页确认剔除状态同步（全局持久化）。
  - 控制台无报错。

---

## Self-Review（已对照 spec 与复用锚点核验）

- **Spec 覆盖**：§2 域装配+售前回退+不硬编码剔除（T1）；§3 标签剔除全局+页内控件（T7）；§4 五 KPI（T7）；§5 五图 A-E + 色 token 化 + 下钻（T7/T8）；§6 组件契约 MetricGrid/MilestoneDrillModal（T5/T6）；lib API 面全部函数（T1-T3）；MUTED_* + 契约（T4）；§8 测试策略（各任务测试 + 收尾冒烟）。
- **Placeholder 扫描**：无 TBD/TODO；每个改码步给完整代码或精确替换/插入位置。
- **类型/命名一致**：`MilestoneProject`/`MilestoneStatus`/`DistSeries`/`MilestoneDrillRow`/`ExcludeOpts` 跨任务一致；`reminderBuckets` 返回 `{windows:{'7d'|'30d'|'quarter':ReminderWindow}}`、`finalAcceptStats(gran,year?)`、`nodeDistribution(year)`、`nodesForDrill(seriesKey,monthIndex,year)` 与 view 调用对齐；`distSeriesOf` 在 T2 定义、T3/T2 复用（无前向缺失）；ChartBox `datapoint-click`（T4）↔ view `@datapoint-click`（T8）一致；MetricGrid `items {k,v,sub?,cls?}` ↔ view kpiItems 一致。
- **硬约束**：仅令牌+echartsTheme 桥接色、无散值（图色全取 STATUS_*/MUTED_*/CHART_*）；无 emoji；逐文件 add + Co-Authored-By trailer；不碰后端/version.ts。
