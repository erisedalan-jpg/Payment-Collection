# SP-B2 里程碑明细三表 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。步骤 checkbox 跟踪。

**Goal：** 在 `/insight/milestone` 概览下方补齐三张明细表 tab（延期清单 / 到期提醒节点表 / 在建里程碑计划宽表），各含多筛选、客户端分页、Excel 导出，数据全取自 `mps`（SP-B1 域）。

**Architecture：** 行构造纯函数集中在 `lib/milestoneDetailRows.ts`；分页 DRY 到 `lib/usePagedRows.ts`；徽章 DRY 到 `components/StatusBadge.vue`；三 tab 各独立组件；`MilestoneView` 加 `SegToggle` + 三段渲染。复用 `DataTable`/`exportXlsx`/`SegToggle`。

**Tech Stack：** Vue3 + Vite + TS + Pinia + Element Plus + Vitest。

## Global Constraints
- 无 emoji；样式仅 theme.css 令牌（状态三态用 `--ok-bg/--ok-text`/`--warn-bg/--warn-text`/`--danger-bg/--danger-text`/`--urgent-bg/--urgent-text`/`--card2`/`--mut`）；金额/日期/计数列挂 `.u-num`；无散值（el-select/el-input/分页 inline `style="width:..px"` 沿用既有 ProjectsView 范式，可接受）。
- git 逐文件 add；commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不提交 docs/plan/spec/.superpowers/data；版本不动（V1.16.0）。不碰后端。
- TDD：先写/改测试→红→实现→绿→`cd frontend && npm run typecheck`→提交。测试命令 `cd frontend && npm run test:run -- <file>`。

## 复用锚点（实测）
- `lib/exportXlsx.ts`：`exportRows(filename: string, rows: Record<string,unknown>[]): void`（键=列头）。
- `components/DataTable.vue`：`DataColumn={key,label,width?,sortable?,formatter?,wrap?,fixed?,num?}`；props `columns/rows/showCount?/clickable?`；emit `row-click`；插槽 `#cell-<key>`(作用域 `{row,value}`)。
- `components/SegToggle.vue`：props `modelValue:string`、`options:{value,label}[]`；emit `update:modelValue`；按钮 `data-test="seg-<value>"`。
- `lib/milestoneAnalytics.ts`(SP-B1)：`MilestoneProject{projectId,projectName,manager,orgL4,orgL3_1,projectType,contract,status,nodes}`、`statusKpis`、`reminderBuckets`、私有 `ymd/addDays/quarterRange`。
- `components/HealthBadge.vue`：淡底深字徽章范式（本计划据此建通用 `StatusBadge.vue`）。
- 分页范式（ProjectsView）：`pageSize/currentPage` ref + `slice` + `el-pagination` + `watch(filtered)→currentPage=1`。
- 宽表横滚：外层 `div.xx-scroll{overflow-x:auto}` 包 `DataTable`，关键列 `fixed:'left'`。

## 文件结构
- 改 `lib/milestoneAnalytics.ts`（+`orgL3`、导出 `ymd`/`addDays`、+`reminderBounds`、reminderBuckets 用之）+ 其测试。
- 新 `lib/milestoneDetailRows.ts` + 测试。
- 新 `lib/usePagedRows.ts` + 测试。
- 新 `components/StatusBadge.vue` + 测试。
- 新 `components/MilestoneDelayedTab.vue` / `MilestoneReminderTab.vue` / `MilestonePlanTab.vue` + 各测试。
- 改 `views/MilestoneView.vue` + 其测试。

---

## Task 1: 扩展 milestoneAnalytics（orgL3 + 导出日期助手 + reminderBounds）

**Files:** Modify `frontend/src/lib/milestoneAnalytics.ts`; Test `frontend/src/lib/milestoneAnalytics.test.ts`

**Interfaces:** Produces `MilestoneProject.orgL3:string`；`export ymd(d):string`/`export addDays(d,n):string`/`export reminderBounds(now):{today,d7,d30,qs,qe}`。reminderBuckets 行为不变。

- [ ] **Step 1: 改/补测试**

在 `milestoneAnalytics.test.ts` 的 `buildMilestoneProjects` 域，`pmis` 夹具给 A 加 team，并加断言。把现有 `const pmis = {...}` 块替换为：

```ts
const pmis = {
  A: { progress: { 里程碑进度状态: '正常' }, status: { 项目类型: '正常实施类' }, team: { L3部门: '交付一部' } },
  B: { progress: { 里程碑进度状态: '严重延期' }, status: { 项目类型: '售前服务类' } },
  C: { progress: { 里程碑进度状态: '' }, status: { 项目类型: '特殊支持类' } },
} as any
```

并在 `describe('buildMilestoneProjects')` 内追加用例：

```ts
  it('orgL3 取 team.L3部门(缺为空串)', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones)
    expect(ps.find((p) => p.projectId === 'A')!.orgL3).toBe('交付一部')
    expect(ps.find((p) => p.projectId === 'B')!.orgL3).toBe('')
  })
```

文件末尾追加 reminderBounds 测试：

```ts
import { reminderBounds } from './milestoneAnalytics'
describe('reminderBounds', () => {
  it('给出 today/d7/d30/季初季末', () => {
    const b = reminderBounds(new Date(2026, 2, 10))
    expect(b).toEqual({ today: '2026-03-10', d7: '2026-03-17', d30: '2026-04-09', qs: '2026-01-01', qe: '2026-03-31' })
  })
})
```

- [ ] **Step 2: 跑红** — `cd frontend && npm run test:run -- src/lib/milestoneAnalytics.test.ts` → FAIL（orgL3/reminderBounds 未定义）。

- [ ] **Step 3: 实现**

3a. `MilestoneProject` 接口加字段（在 `orgL3_1: string` 行后加）：
```ts
  orgL3: string
```

3b. `buildMilestoneProjects` 的 push 对象里加（在 `orgL3_1` 行后）：
```ts
      orgL3: (m.team?.L3部门 ?? '').trim(),
```

3c. 把私有 `function ymd` 改为 `export function ymd`，私有 `function addDays` 改为 `export function addDays`（仅加 `export`，签名不变）。

3d. 在 `reminderBuckets` 定义前**新增** `reminderBounds`，并改 reminderBuckets 头部用它：
```ts
export function reminderBounds(now: Date): { today: string; d7: string; d30: string; qs: string; qe: string } {
  const [qs, qe] = quarterRange(now)
  return { today: ymd(now), d7: addDays(now, 7), d30: addDays(now, 30), qs, qe }
}
```
把 `reminderBuckets` 开头的
```ts
  const today = ymd(now), d7 = addDays(now, 7), d30 = addDays(now, 30)
  const [qs, qe] = quarterRange(now)
```
替换为：
```ts
  const { today, d7, d30, qs, qe } = reminderBounds(now)
```

- [ ] **Step 4: 跑绿 + typecheck** — `cd frontend && npm run test:run -- src/lib/milestoneAnalytics.test.ts && npm run typecheck` → PASS（含既有 reminderBuckets/其它用例）。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/milestoneAnalytics.ts frontend/src/lib/milestoneAnalytics.test.ts
git commit -m "feat(milestone): MilestoneProject 增 orgL3 + 导出日期助手/reminderBounds (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: lib 延期清单行 buildDelayedRows

**Files:** Create `frontend/src/lib/milestoneDetailRows.ts`; Test `frontend/src/lib/milestoneDetailRows.test.ts`

**Interfaces:** Consumes Task 1 `MilestoneProject`/`ymd`。Produces `NODE_TYPES`、`DelayedRow`、`buildDelayedRows(ps, now)`、私有 `dayDiff`。

- [ ] **Step 1: 写失败测试** — `frontend/src/lib/milestoneDetailRows.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildDelayedRows } from './milestoneDetailRows'

function mp(over: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...over }
}

describe('buildDelayedRows', () => {
  const now = new Date(2026, 2, 10) // 2026-03-10
  it('仅非正常项目;延期节点=planDate<今且未完成的去重节点名', () => {
    const ps = [
      mp({ projectId: 'A', status: '正常' }), // 正常→不出
      mp({ projectId: 'B', status: '延期', nodes: [
        { name: '到货', planDate: '2026-02-01', actualDate: '', priority: 'low' },   // 过期未完→延期节点
        { name: '初验', planDate: '2026-02-05', actualDate: '2026-02-06', priority: 'mid' }, // 已完→不计
        { name: '终验', planDate: '2026-05-01', actualDate: '', priority: 'high' },   // 未来→不计
      ] }),
      mp({ projectId: 'C', status: '严重延期', nodes: [] }), // 无延期节点→'-'
    ]
    const rows = buildDelayedRows(ps, now)
    expect(rows.map((r) => r.projectId)).toEqual(['B', 'C'])
    expect(rows.find((r) => r.projectId === 'B')!.delayedNodes).toBe('到货')
    expect(rows.find((r) => r.projectId === 'C')!.delayedNodes).toBe('-')
    expect(rows.find((r) => r.projectId === 'B')).toMatchObject({ projectType: 'T', orgL3: 'L3', orgL4: 'L4', status: '延期' })
  })
})
```

- [ ] **Step 2: 跑红** — `cd frontend && npm run test:run -- src/lib/milestoneDetailRows.test.ts` → FAIL。

- [ ] **Step 3: 实现** — `frontend/src/lib/milestoneDetailRows.ts`：

```ts
import type { MilestoneProject, MilestoneStatus } from './milestoneAnalytics'
import { ymd } from './milestoneAnalytics'

export const NODE_TYPES = [
  '项目启动', '到货', '服务进场', '交付完工', '初验', '项目完工（服务离场）',
  '终验', '项目关闭', '驻场', '实物点验', '服务完成', '节点成果确认',
] as const

function dayDiff(planYmd: string, now: Date): number {
  const [y, m, d] = planYmd.split('-').map(Number)
  const plan = new Date(y, (m || 1) - 1, d || 1).getTime()
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((plan - t) / 86400000)
}

export interface DelayedRow {
  projectId: string; projectName: string; projectType: string; orgL3: string; orgL4: string
  manager: string; status: MilestoneStatus; delayedNodes: string
}

/** 延期清单：非正常项目;延期节点=该项目 planDate<今 且 actualDate 空 的去重节点名(、连接),无则 '-'。 */
export function buildDelayedRows(ps: MilestoneProject[], now: Date): DelayedRow[] {
  const today = ymd(now)
  const out: DelayedRow[] = []
  for (const p of ps) {
    if (p.status === '正常') continue
    const names: string[] = []
    for (const n of p.nodes) {
      const pd = (n.planDate ?? '').slice(0, 10)
      if (pd && pd < today && !(n.actualDate ?? '').trim()) {
        const nm = n.name ?? ''
        if (nm && !names.includes(nm)) names.push(nm)
      }
    }
    out.push({
      projectId: p.projectId, projectName: p.projectName, projectType: p.projectType,
      orgL3: p.orgL3, orgL4: p.orgL4, manager: p.manager, status: p.status,
      delayedNodes: names.length ? names.join('、') : '-',
    })
  }
  return out
}

export { dayDiff }
```

- [ ] **Step 4: 跑绿 + typecheck** — `cd frontend && npm run test:run -- src/lib/milestoneDetailRows.test.ts && npm run typecheck` → PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/milestoneDetailRows.ts frontend/src/lib/milestoneDetailRows.test.ts
git commit -m "feat(milestone): lib 延期清单行 buildDelayedRows + NODE_TYPES (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: lib 到期提醒行 buildReminderRows + reminderStat

**Files:** Modify `frontend/src/lib/milestoneDetailRows.ts`（追加）; Test 同文件追加

**Interfaces:** Consumes Task 1 `reminderBounds`/`addDays`、Task 2 `dayDiff`。Produces `ReminderWin`、`ReminderRow`、`buildReminderRows(ps, now, win)`、`reminderStat(rows, now)`。

- [ ] **Step 1: 追加失败测试** — import 追加 + describe：

```ts
import { buildReminderRows, reminderStat } from './milestoneDetailRows'

describe('buildReminderRows / reminderStat', () => {
  const now = new Date(2026, 2, 10) // 2026-03-10; 7d→03-17, 30d→04-09, 季→01-01..03-31
  const ps = [
    mp({ projectId: 'A', manager: '张', nodes: [
      { name: '到货', planDate: '2026-03-12', actualDate: '', payStage: '到货款', priority: 'high' }, // 7d内,关联回款
      { name: '初验', planDate: '2026-04-05', actualDate: '', payStage: '', priority: 'mid' },          // 30d内
      { name: '终验', planDate: '2026-03-15', actualDate: '2026-03-09', priority: 'high' },             // 已完→不计
    ] }),
  ]
  it('7天窗:仅 planDate∈[今,今+7]且未完成', () => {
    const rows = buildReminderRows(ps, now, '7d')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ projectId: 'A', node: '到货', planDate: '2026-03-12', payStage: '到货款', linked: '是', priority: 'high', priorityLabel: '高', urgency: 'warn' })
  })
  it('30天窗含初验(未关联回款)', () => {
    const rows = buildReminderRows(ps, now, '30d')
    expect(rows.map((r) => r.node).sort()).toEqual(['初验', '到货'])
    expect(rows.find((r) => r.node === '初验')!.linked).toBe('否')
  })
  it('reminderStat 统计', () => {
    const rows = buildReminderRows(ps, now, '30d')
    const s = reminderStat(rows, now)
    expect(s.projectCount).toBe(1)
    expect(s.nodeCount).toBe(2)
    expect(s.within7).toBe(1) // 仅到货 03-12 在 7 天内
  })
})
```

- [ ] **Step 2: 跑红** — FAIL。

- [ ] **Step 3: 追加实现** — `milestoneDetailRows.ts` 末尾追加：

```ts
import { reminderBounds, addDays } from './milestoneAnalytics'

export type ReminderWin = '7d' | '30d' | 'quarter'
export interface ReminderRow {
  projectId: string; projectName: string; projectType: string; manager: string
  orgL3: string; orgL4: string; node: string; planDate: string; payStage: string
  linked: '是' | '否'; priority: string; priorityLabel: string; urgency: 'urgent' | 'warn' | ''
}

const PR_LABEL: Record<string, string> = { high: '高', mid: '中', low: '低' }

/** 到期提醒(节点级):窗口内未完成节点逐条成行。 */
export function buildReminderRows(ps: MilestoneProject[], now: Date, win: ReminderWin): ReminderRow[] {
  const b = reminderBounds(now)
  const [start, end] = win === '7d' ? [b.today, b.d7] : win === '30d' ? [b.today, b.d30] : [b.qs, b.qe]
  const out: ReminderRow[] = []
  for (const p of ps) {
    for (const n of p.nodes) {
      if ((n.actualDate ?? '').trim()) continue
      const pd = (n.planDate ?? '').slice(0, 10)
      if (!pd || pd < start || pd > end) continue
      const diff = dayDiff(pd, now)
      const pr = ((n as any).priority === 'high' || (n as any).priority === 'mid') ? (n as any).priority : 'low'
      const payStage = ((n as any).payStage ?? '').trim()
      out.push({
        projectId: p.projectId, projectName: p.projectName, projectType: p.projectType, manager: p.manager,
        orgL3: p.orgL3, orgL4: p.orgL4, node: n.name ?? '', planDate: pd, payStage,
        linked: payStage ? '是' : '否', priority: pr, priorityLabel: PR_LABEL[pr],
        urgency: diff <= 3 ? 'urgent' : diff <= 7 ? 'warn' : '',
      })
    }
  }
  return out
}

export interface ReminderStat { projectCount: number; nodeCount: number; within7: number; withinWeek: number }
export function reminderStat(rows: ReminderRow[], now: Date): ReminderStat {
  const today = reminderBounds(now).today
  const d7 = addDays(now, 7)
  const we = addDays(now, 7 - now.getDay()) // 本周末(下个周日)
  const pids = new Set<string>()
  let within7 = 0, withinWeek = 0
  for (const r of rows) {
    pids.add(r.projectId)
    const pd = r.planDate.slice(0, 10)
    if (pd >= today && pd <= d7) within7++
    if (pd >= today && pd <= we) withinWeek++
  }
  return { projectCount: pids.size, nodeCount: rows.length, within7, withinWeek }
}
```

- [ ] **Step 4: 跑绿 + typecheck** — PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/milestoneDetailRows.ts frontend/src/lib/milestoneDetailRows.test.ts
git commit -m "feat(milestone): lib 到期提醒行 buildReminderRows + reminderStat (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: lib 在建计划宽表行 buildPlanRows

**Files:** Modify `frontend/src/lib/milestoneDetailRows.ts`（追加）; Test 追加

**Interfaces:** Consumes Task 2 `NODE_TYPES`。Produces `PlanRow`(含动态 `计划_<type>`/`实际_<type>` 键)、`buildPlanRows(ps)`。

- [ ] **Step 1: 追加失败测试**：

```ts
import { buildPlanRows } from './milestoneDetailRows'

describe('buildPlanRows', () => {
  it('每项目一行 + 节点类型计划/实际日期映射', () => {
    const ps = [mp({ projectId: 'A', projectName: '甲', contract: 1234567, orgL3: 'L3', orgL3_1: 'L31', orgL4: 'L4', manager: '张', projectType: 'T', nodes: [
      { name: '到货', planDate: '2026-03-01', actualDate: '2026-03-05', priority: 'high' },
      { name: '终验', planDate: '2026-06-01', actualDate: '', priority: 'high' },
    ] })]
    const rows = buildPlanRows(ps)
    expect(rows).toHaveLength(1)
    const r = rows[0] as any
    expect(r).toMatchObject({ projectId: 'A', projectName: '甲', contract: 1234567, orgL3: 'L3', orgL3_1: 'L31', orgL4: 'L4', manager: '张', projectType: 'T' })
    expect(r['计划_到货']).toBe('2026-03-01')
    expect(r['实际_到货']).toBe('2026-03-05')
    expect(r['计划_终验']).toBe('2026-06-01')
    expect(r['实际_终验']).toBe('')
    expect(r['计划_初验']).toBe('') // 无该节点
  })
})
```

- [ ] **Step 2: 跑红** — FAIL。

- [ ] **Step 3: 追加实现** — 末尾追加：

```ts
export interface PlanRow extends Record<string, string | number> {
  projectId: string; projectName: string; contract: number
  orgL3: string; orgL3_1: string; orgL4: string; manager: string; projectType: string
}

/** 在建里程碑计划宽表:每项目一行,12 节点类型各两列(计划/实际日期,取首个同名节点,缺为 '')。 */
export function buildPlanRows(ps: MilestoneProject[]): PlanRow[] {
  return ps.map((p) => {
    const row: Record<string, string | number> = {
      projectId: p.projectId, projectName: p.projectName, contract: p.contract,
      orgL3: p.orgL3, orgL3_1: p.orgL3_1, orgL4: p.orgL4, manager: p.manager, projectType: p.projectType,
    }
    for (const t of NODE_TYPES) {
      const n = p.nodes.find((x) => (x.name ?? '') === t)
      row[`计划_${t}`] = (n?.planDate ?? '').slice(0, 10)
      row[`实际_${t}`] = (n?.actualDate ?? '').slice(0, 10)
    }
    return row as PlanRow
  })
}
```

- [ ] **Step 4: 跑绿 + typecheck** — PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/milestoneDetailRows.ts frontend/src/lib/milestoneDetailRows.test.ts
git commit -m "feat(milestone): lib 在建计划宽表行 buildPlanRows (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: usePagedRows 组合式

**Files:** Create `frontend/src/lib/usePagedRows.ts`; Test `frontend/src/lib/usePagedRows.test.ts`

**Interfaces:** Produces `usePagedRows<T>(source: Ref<T[]> | ComputedRef<T[]>, size?=50): { paged: ComputedRef<T[]>; currentPage: Ref<number>; pageSize: Ref<number> }`。source 变更重置 currentPage=1。

- [ ] **Step 1: 写失败测试** — `frontend/src/lib/usePagedRows.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { usePagedRows } from './usePagedRows'

describe('usePagedRows', () => {
  it('按页切片', () => {
    const src = ref(Array.from({ length: 25 }, (_, i) => i))
    const { paged, currentPage, pageSize } = usePagedRows(src, 10)
    expect(paged.value).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    currentPage.value = 3
    expect(paged.value).toEqual([20, 21, 22, 23, 24])
    expect(pageSize.value).toBe(10)
  })
  it('source 变更重置页码到 1', async () => {
    const src = ref([1, 2, 3, 4, 5])
    const { currentPage } = usePagedRows(src, 2)
    currentPage.value = 3
    src.value = [9]
    await nextTick()
    expect(currentPage.value).toBe(1)
  })
})
```

- [ ] **Step 2: 跑红** — FAIL。

- [ ] **Step 3: 实现** — `frontend/src/lib/usePagedRows.ts`：

```ts
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

/** 客户端分页:返回当前页切片 + 页码/页大小;source 变更自动回到第 1 页。 */
export function usePagedRows<T>(source: Ref<T[]> | ComputedRef<T[]>, size = 50) {
  const currentPage = ref(1)
  const pageSize = ref(size)
  const paged = computed<T[]>(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return source.value.slice(start, start + pageSize.value)
  })
  watch(source, () => { currentPage.value = 1 })
  return { paged, currentPage, pageSize }
}
```

- [ ] **Step 4: 跑绿 + typecheck** — PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/usePagedRows.ts frontend/src/lib/usePagedRows.test.ts
git commit -m "feat(milestone): usePagedRows 客户端分页组合式 (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: StatusBadge 通用三态徽章

**Files:** Create `frontend/src/components/StatusBadge.vue`; Test `frontend/src/components/StatusBadge.test.ts`

**Interfaces:** Produces `StatusBadge` props `label:string`、`tone?:string`('ok'|'warn'|'danger'|'urgent'|'mut'，默认 'mut')。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/StatusBadge.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from './StatusBadge.vue'

describe('StatusBadge', () => {
  it('渲染 label 并按 tone 给类', () => {
    const w = mount(StatusBadge, { props: { label: '延期', tone: 'warn' } })
    expect(w.text()).toBe('延期')
    expect(w.find('span').classes()).toContain('warn')
  })
  it('tone 缺省为 mut', () => {
    const w = mount(StatusBadge, { props: { label: '未发布' } })
    expect(w.find('span').classes()).toContain('mut')
  })
})
```

- [ ] **Step 2: 跑红** — FAIL。

- [ ] **Step 3: 实现** — `frontend/src/components/StatusBadge.vue`：

```vue
<script setup lang="ts">
withDefaults(defineProps<{ label: string; tone?: string }>(), { tone: 'mut' })
</script>

<template>
  <span class="u-stbadge" :class="tone">{{ label }}</span>
</template>

<style scoped>
.u-stbadge { display: inline-block; padding: 1px var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); font-weight: 600; line-height: var(--lh-base); }
.u-stbadge.ok { background: var(--ok-bg); color: var(--ok-text); }
.u-stbadge.warn { background: var(--warn-bg); color: var(--warn-text); }
.u-stbadge.danger { background: var(--danger-bg); color: var(--danger-text); }
.u-stbadge.urgent { background: var(--urgent-bg); color: var(--urgent-text); }
.u-stbadge.mut { background: var(--card2); color: var(--mut); }
</style>
```

- [ ] **Step 4: 跑绿 + typecheck** — PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/StatusBadge.vue frontend/src/components/StatusBadge.test.ts
git commit -m "feat(components): StatusBadge 通用三态徽章 (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: MilestoneDelayedTab 延期清单 tab

**Files:** Create `frontend/src/components/MilestoneDelayedTab.vue`; Test `frontend/src/components/MilestoneDelayedTab.test.ts`

**Interfaces:** Consumes `buildDelayedRows`、`statusKpis`、`usePagedRows`、`exportRows`、`DataTable`、`StatusBadge`。Props `projects: MilestoneProject[]`、`now: Date`。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/MilestoneDelayedTab.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneDelayedTab from './MilestoneDelayedTab.vue'
import DataTable from './DataTable.vue'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

const now = new Date(2026, 2, 10)
function mp(o: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...o }
}
const projects = [
  mp({ projectId: 'A', status: '正常' }),
  mp({ projectId: 'B', projectName: '乙', status: '延期', orgL4: '甲组', manager: '张' }),
  mp({ projectId: 'C', projectName: '丙', status: '严重延期', orgL4: '乙组', manager: '李' }),
]
const opts = { global: { plugins: [ElementPlus] } }

describe('MilestoneDelayedTab', () => {
  it('默认只列非正常项目 + 汇总条显全量计数', () => {
    const w = mount(MilestoneDelayedTab, { props: { projects, now }, ...opts })
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.projectId).sort()).toEqual(['B', 'C'])
    expect(w.text()).toContain('正常 1')
    expect(w.text()).toContain('严重延期 1')
  })
  it('L4 多选筛选缩小行', async () => {
    const w = mount(MilestoneDelayedTab, { props: { projects, now }, ...opts })
    ;(w.vm as any).fL4 = ['甲组']
    await w.vm.$nextTick()
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.projectId)).toEqual(['B'])
  })
  it('行点击跳详情;有导出按钮', async () => {
    pushSpy.mockClear()
    const w = mount(MilestoneDelayedTab, { props: { projects, now }, ...opts })
    await w.findComponent(DataTable).vm.$emit('row-click', { projectId: 'B' })
    expect(pushSpy).toHaveBeenCalledWith('/project/B')
    expect(w.find('[data-test="delayed-export"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑红** — FAIL（组件不存在）。

- [ ] **Step 3: 实现** — `frontend/src/components/MilestoneDelayedTab.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MilestoneProject } from '@/lib/milestoneAnalytics'
import { statusKpis } from '@/lib/milestoneAnalytics'
import { buildDelayedRows } from '@/lib/milestoneDetailRows'
import { usePagedRows } from '@/lib/usePagedRows'
import { exportRows } from '@/lib/exportXlsx'
import DataTable, { type DataColumn } from './DataTable.vue'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ projects: MilestoneProject[]; now: Date }>()
const router = useRouter()

const STATUS_OPTS = ['延期', '严重延期', '未发布']
const fStatus = ref<string[]>([...STATUS_OPTS])
const fL4 = ref<string[]>([])
const fManager = ref('')
const fKw = ref('')

const allRows = computed(() => buildDelayedRows(props.projects, props.now))
const l4Opts = computed(() => [...new Set(allRows.value.map((r) => r.orgL4).filter(Boolean))])
const summary = computed(() => statusKpis(props.projects))
const filtered = computed(() => allRows.value.filter((r) =>
  (fStatus.value.length === 0 || fStatus.value.includes(r.status)) &&
  (fL4.value.length === 0 || fL4.value.includes(r.orgL4)) &&
  (!fManager.value || r.manager.includes(fManager.value)) &&
  (!fKw.value || r.projectId.includes(fKw.value) || r.projectName.includes(fKw.value)),
))
const { paged, currentPage, pageSize } = usePagedRows(filtered)

const TONE: Record<string, string> = { 正常: 'ok', 延期: 'warn', 严重延期: 'danger', 未发布: 'mut' }
const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 150 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'projectType', label: '项目类型', width: 100 },
  { key: 'orgL3', label: 'L3部门', width: 120 },
  { key: 'orgL4', label: 'L4部门', width: 120 },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'status', label: '里程碑状态', width: 110 },
  { key: 'delayedNodes', label: '延期节点', width: 180, wrap: true },
]
function reset() { fStatus.value = [...STATUS_OPTS]; fL4.value = []; fManager.value = ''; fKw.value = '' }
function onExport() {
  exportRows('延期项目清单.xlsx', filtered.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 项目类型: r.projectType, L3部门: r.orgL3,
    L4部门: r.orgL4, 项目经理: r.manager, 里程碑状态: r.status, 延期节点: r.delayedNodes,
  })))
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
</script>

<template>
  <div class="mdt">
    <div class="mdt-summary">
      <StatusBadge label="正常" tone="ok" /> {{ summary.normal }}
      <StatusBadge label="延期" tone="warn" /> {{ summary.delayed }}
      <StatusBadge label="严重延期" tone="danger" /> {{ summary.severe }}
      <StatusBadge label="未发布" tone="mut" /> {{ summary.unpublished }}
    </div>
    <div class="mdt-bar">
      <el-select v-model="fStatus" size="small" multiple collapse-tags clearable placeholder="里程碑状态" style="width: 170px">
        <el-option v-for="s in STATUS_OPTS" :key="s" :value="s" :label="s" />
      </el-select>
      <el-select v-model="fL4" size="small" multiple collapse-tags clearable placeholder="L4部门" style="width: 160px">
        <el-option v-for="d in l4Opts" :key="d" :value="d" :label="d" />
      </el-select>
      <el-input v-model="fManager" size="small" placeholder="项目经理" style="width: 120px" />
      <el-input v-model="fKw" size="small" placeholder="编号/名称" style="width: 140px" />
      <button class="mdt-btn" @click="reset">重置</button>
      <button class="mdt-btn" data-test="delayed-export" @click="onExport">导出Excel</button>
    </div>
    <DataTable :columns="COLS" :rows="paged" clickable @row-click="onRow">
      <template #cell-projectId="{ value }"><span class="mdt-link">{{ value }}</span></template>
      <template #cell-status="{ value }"><StatusBadge :label="value" :tone="TONE[value]" /></template>
    </DataTable>
    <div class="mdt-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.mdt-summary { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); font-size: var(--fs-1); color: var(--sub); }
.mdt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mdt-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.mdt-btn:hover { background: var(--bg); color: var(--accent); }
.mdt-link { color: var(--accent); cursor: pointer; }
.mdt-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>
```

- [ ] **Step 4: 跑绿 + typecheck** — `cd frontend && npm run test:run -- src/components/MilestoneDelayedTab.test.ts && npm run typecheck` → PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/MilestoneDelayedTab.vue frontend/src/components/MilestoneDelayedTab.test.ts
git commit -m "feat(milestone): 延期项目清单 tab 组件 (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: MilestoneReminderTab 到期提醒 tab

**Files:** Create `frontend/src/components/MilestoneReminderTab.vue`; Test `frontend/src/components/MilestoneReminderTab.test.ts`

**Interfaces:** Consumes `buildReminderRows`/`reminderStat`、`usePagedRows`、`exportRows`、`SegToggle`、`DataTable`、`StatusBadge`。Props `projects: MilestoneProject[]`、`now: Date`。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/MilestoneReminderTab.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneReminderTab from './MilestoneReminderTab.vue'
import DataTable from './DataTable.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const now = new Date(2026, 2, 10)
function mp(o: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...o }
}
const projects = [
  mp({ projectId: 'A', manager: '张', nodes: [
    { name: '到货', planDate: '2026-03-12', actualDate: '', payStage: '到货款', priority: 'high' },
    { name: '初验', planDate: '2026-04-05', actualDate: '', payStage: '', priority: 'mid' },
  ] }),
]
const opts = { global: { plugins: [ElementPlus] } }

describe('MilestoneReminderTab', () => {
  it('默认 7 天窗:仅 03-12 到货一行;统计卡显数', () => {
    const w = mount(MilestoneReminderTab, { props: { projects, now }, ...opts })
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.node)).toEqual(['到货'])
    expect(w.text()).toContain('到期节点总数')
  })
  it('切 30 天窗加入初验', async () => {
    const w = mount(MilestoneReminderTab, { props: { projects, now }, ...opts })
    await w.get('[data-test="seg-30d"]').trigger('click')
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.node).sort()).toEqual(['初验', '到货'])
  })
})
```

- [ ] **Step 2: 跑红** — FAIL。

- [ ] **Step 3: 实现** — `frontend/src/components/MilestoneReminderTab.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MilestoneProject } from '@/lib/milestoneAnalytics'
import { buildReminderRows, reminderStat, type ReminderWin } from '@/lib/milestoneDetailRows'
import { usePagedRows } from '@/lib/usePagedRows'
import { exportRows } from '@/lib/exportXlsx'
import SegToggle from './SegToggle.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ projects: MilestoneProject[]; now: Date }>()
const router = useRouter()

const WIN_OPTS = [{ value: '7d', label: '未来7天' }, { value: '30d', label: '未来30天' }, { value: 'quarter', label: '本季度' }]
const win = ref<ReminderWin>('7d')
const fL4 = ref<string[]>([])
const fNode = ref<string[]>([])
const fPriority = ref<string[]>([])
const fManager = ref('')
const fKw = ref('')

const winRows = computed(() => buildReminderRows(props.projects, props.now, win.value))
const l4Opts = computed(() => [...new Set(winRows.value.map((r) => r.orgL4).filter(Boolean))])
const nodeOpts = computed(() => [...new Set(winRows.value.map((r) => r.node).filter(Boolean))])
const filtered = computed(() => winRows.value.filter((r) =>
  (fL4.value.length === 0 || fL4.value.includes(r.orgL4)) &&
  (fNode.value.length === 0 || fNode.value.includes(r.node)) &&
  (fPriority.value.length === 0 || fPriority.value.includes(r.priority)) &&
  (!fManager.value || r.manager.includes(fManager.value)) &&
  (!fKw.value || r.projectId.includes(fKw.value) || r.projectName.includes(fKw.value)),
))
const stat = computed(() => reminderStat(filtered.value, props.now))
const { paged, currentPage, pageSize } = usePagedRows(filtered)

const PR_OPTS = [{ value: 'high', label: '高' }, { value: 'mid', label: '中' }, { value: 'low', label: '低' }]
const PR_TONE: Record<string, string> = { high: 'danger', mid: 'warn', low: 'mut' }
const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 150 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'projectType', label: '项目类型', width: 100 },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'orgL3', label: 'L3部门', width: 110 },
  { key: 'orgL4', label: 'L4部门', width: 110 },
  { key: 'node', label: '到期节点', width: 110 },
  { key: 'planDate', label: '计划时间', width: 110, num: true },
  { key: 'payStage', label: '回款阶段', width: 150, wrap: true },
  { key: 'linked', label: '是否关联回款', width: 110 },
  { key: 'priorityLabel', label: '处置优先级', width: 100 },
]
function reset() { fL4.value = []; fNode.value = []; fPriority.value = []; fManager.value = ''; fKw.value = '' }
function onExport() {
  exportRows(`里程碑到期提醒_${win.value}.xlsx`, filtered.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 项目类型: r.projectType, 项目经理: r.manager,
    L3部门: r.orgL3, L4部门: r.orgL4, 到期节点: r.node, 计划时间: r.planDate, 回款阶段: r.payStage,
    是否关联回款: r.linked, 处置优先级: r.priorityLabel,
  })))
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
</script>

<template>
  <div class="mrt">
    <div class="mrt-head">
      <SegToggle v-model="win" :options="WIN_OPTS" />
    </div>
    <div class="mrt-stats">
      <div class="mrt-card"><div class="mrt-k">待提醒项目数</div><div class="mrt-v u-num">{{ stat.projectCount }}</div></div>
      <div class="mrt-card"><div class="mrt-k">到期节点总数</div><div class="mrt-v u-num">{{ stat.nodeCount }}</div></div>
      <div class="mrt-card"><div class="mrt-k">7天内到期</div><div class="mrt-v u-num">{{ stat.within7 }}</div></div>
      <div class="mrt-card"><div class="mrt-k">本周到期</div><div class="mrt-v u-num">{{ stat.withinWeek }}</div></div>
    </div>
    <div class="mrt-bar">
      <el-select v-model="fL4" size="small" multiple collapse-tags clearable placeholder="L4部门" style="width: 150px">
        <el-option v-for="d in l4Opts" :key="d" :value="d" :label="d" />
      </el-select>
      <el-select v-model="fNode" size="small" multiple collapse-tags clearable placeholder="到期节点" style="width: 150px">
        <el-option v-for="n in nodeOpts" :key="n" :value="n" :label="n" />
      </el-select>
      <el-select v-model="fPriority" size="small" multiple collapse-tags clearable placeholder="优先级" style="width: 130px">
        <el-option v-for="p in PR_OPTS" :key="p.value" :value="p.value" :label="p.label" />
      </el-select>
      <el-input v-model="fManager" size="small" placeholder="项目经理" style="width: 120px" />
      <el-input v-model="fKw" size="small" placeholder="编号/名称" style="width: 140px" />
      <button class="mrt-btn" @click="reset">重置</button>
      <button class="mrt-btn" data-test="reminder-export" @click="onExport">导出Excel</button>
    </div>
    <DataTable :columns="COLS" :rows="paged" clickable @row-click="onRow">
      <template #cell-projectId="{ value }"><span class="mrt-link">{{ value }}</span></template>
      <template #cell-planDate="{ row, value }"><span :class="row.urgency ? 'mrt-date-' + row.urgency : ''">{{ value }}</span></template>
      <template #cell-linked="{ value }"><StatusBadge :label="value" :tone="value === '是' ? 'ok' : 'mut'" /></template>
      <template #cell-priorityLabel="{ row, value }"><StatusBadge :label="value" :tone="PR_TONE[row.priority]" /></template>
    </DataTable>
    <div class="mrt-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.mrt-head { margin-bottom: var(--sp-3); }
.mrt-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-card); margin-bottom: var(--sp-3); }
.mrt-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.mrt-k { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.mrt-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.mrt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mrt-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.mrt-btn:hover { background: var(--bg); color: var(--accent); }
.mrt-link { color: var(--accent); cursor: pointer; }
.mrt-date-urgent { color: var(--danger); font-weight: 600; }
.mrt-date-warn { color: var(--warn-text); font-weight: 600; }
.mrt-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>
```

- [ ] **Step 4: 跑绿 + typecheck** — PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/MilestoneReminderTab.vue frontend/src/components/MilestoneReminderTab.test.ts
git commit -m "feat(milestone): 到期提醒(节点级) tab 组件 (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: MilestonePlanTab 在建里程碑计划宽表 tab

**Files:** Create `frontend/src/components/MilestonePlanTab.vue`; Test `frontend/src/components/MilestonePlanTab.test.ts`

**Interfaces:** Consumes `buildPlanRows`/`NODE_TYPES`、`usePagedRows`、`exportRows`、`DataTable`。Props `projects: MilestoneProject[]`。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/MilestonePlanTab.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestonePlanTab from './MilestonePlanTab.vue'
import DataTable from './DataTable.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function mp(o: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: 'L31', projectType: 'T', contract: 0, status: '正常', nodes: [], ...o }
}
const projects = [
  mp({ projectId: 'A', projectName: '甲', nodes: [{ name: '到货', planDate: '2026-03-01', actualDate: '', priority: 'high' }] }),
  mp({ projectId: 'B', projectName: '乙项目' }),
]
const opts = { global: { plugins: [ElementPlus] } }

describe('MilestonePlanTab', () => {
  it('每项目一行 + 含动态节点列 + 关键词筛选', async () => {
    const w = mount(MilestonePlanTab, { props: { projects }, ...opts })
    let rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows).toHaveLength(2)
    const cols = (w.findComponent(DataTable).props('columns') as any[]).map((c) => c.key)
    expect(cols).toContain('计划_到货')
    expect(cols).toContain('实际_终验')
    ;(w.vm as any).fKw = '乙'
    await w.vm.$nextTick()
    rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.projectId)).toEqual(['B'])
    expect(w.find('[data-test="plan-export"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑红** — FAIL。

- [ ] **Step 3: 实现** — `frontend/src/components/MilestonePlanTab.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MilestoneProject } from '@/lib/milestoneAnalytics'
import { buildPlanRows, NODE_TYPES } from '@/lib/milestoneDetailRows'
import { usePagedRows } from '@/lib/usePagedRows'
import { exportRows } from '@/lib/exportXlsx'
import DataTable, { type DataColumn } from './DataTable.vue'

const props = defineProps<{ projects: MilestoneProject[] }>()
const router = useRouter()

const fKw = ref('')
const allRows = computed(() => buildPlanRows(props.projects))
const filtered = computed(() => allRows.value.filter((r) =>
  !fKw.value || r.projectId.includes(fKw.value) || r.projectName.includes(fKw.value),
))
const { paged, currentPage, pageSize } = usePagedRows(filtered)

const COLS = computed<DataColumn[]>(() => {
  const base: DataColumn[] = [
    { key: 'projectId', label: '项目编号', width: 150, fixed: 'left' },
    { key: 'projectName', label: '项目名称', width: 200, fixed: 'left' },
    { key: 'contract', label: '项目金额', width: 130, num: true, formatter: (v) => '¥' + Number(v || 0).toLocaleString('zh-CN') },
    { key: 'orgL3', label: 'L3部门', width: 120 },
    { key: 'orgL3_1', label: 'L3-1部门', width: 120 },
    { key: 'orgL4', label: 'L4部门', width: 120 },
    { key: 'manager', label: '项目经理', width: 90 },
    { key: 'projectType', label: '项目类型', width: 100 },
  ]
  const nodeCols: DataColumn[] = []
  for (const t of NODE_TYPES) {
    nodeCols.push({ key: `计划_${t}`, label: `计划·${t}`, width: 120, num: true, formatter: (v) => (v ? String(v) : '-') })
    nodeCols.push({ key: `实际_${t}`, label: `实际·${t}`, width: 120, num: true, formatter: (v) => (v ? String(v) : '-') })
  }
  return [...base, ...nodeCols]
})

function reset() { fKw.value = '' }
function onExport() { exportRows('在建项目里程碑计划.xlsx', filtered.value as unknown as Record<string, unknown>[]) }
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
</script>

<template>
  <div class="mpt">
    <div class="mpt-bar">
      <el-input v-model="fKw" size="small" placeholder="编号/名称" style="width: 160px" />
      <button class="mpt-btn" @click="reset">重置</button>
      <button class="mpt-btn" data-test="plan-export" @click="onExport">导出Excel</button>
    </div>
    <div class="mpt-scroll">
      <DataTable :columns="COLS" :rows="paged" :show-count="false" clickable @row-click="onRow">
        <template #cell-projectId="{ value }"><span class="mpt-link">{{ value }}</span></template>
      </DataTable>
    </div>
    <div class="mpt-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[50, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.mpt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mpt-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.mpt-btn:hover { background: var(--bg); color: var(--accent); }
.mpt-scroll { overflow-x: auto; }
.mpt-link { color: var(--accent); cursor: pointer; }
.mpt-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>
```

- [ ] **Step 4: 跑绿 + typecheck** — PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/MilestonePlanTab.vue frontend/src/components/MilestonePlanTab.test.ts
git commit -m "feat(milestone): 在建里程碑计划宽表 tab 组件 (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: MilestoneView 接入三 tab

**Files:** Modify `frontend/src/views/MilestoneView.vue`; Test `frontend/src/views/MilestoneView.test.ts`（追加）

**Interfaces:** Consumes 三 tab 组件、`SegToggle`、SP-B1 `mps`。

- [ ] **Step 1: 追加失败测试** — 顶部 import 追加：
```ts
import MilestoneDelayedTab from '@/components/MilestoneDelayedTab.vue'
import MilestoneReminderTab from '@/components/MilestoneReminderTab.vue'
import MilestonePlanTab from '@/components/MilestonePlanTab.vue'
```
新增 describe：
```ts
describe('MilestoneView 明细 tab', () => {
  it('默认显延期清单 tab;切换到到期提醒/在建计划', async () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect(w.findComponent(MilestoneDelayedTab).exists()).toBe(true)
    expect(w.findComponent(MilestoneReminderTab).exists()).toBe(false)
    await w.get('[data-test="seg-reminder"]').trigger('click')
    expect(w.findComponent(MilestoneReminderTab).exists()).toBe(true)
    await w.get('[data-test="seg-plan"]').trigger('click')
    expect(w.findComponent(MilestonePlanTab).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑红** — FAIL。

- [ ] **Step 3: 实现**

3a. `<script setup>` import 段追加：
```ts
import MilestoneDelayedTab from '@/components/MilestoneDelayedTab.vue'
import MilestoneReminderTab from '@/components/MilestoneReminderTab.vue'
import MilestonePlanTab from '@/components/MilestonePlanTab.vue'
```

3b. `<script setup>` 末尾追加（`now` 供延期/到期 tab）：
```ts
const now = new Date()
const detailTab = ref<'delayed' | 'reminder' | 'plan'>('delayed')
const DETAIL_TABS = [
  { value: 'delayed', label: '延期项目清单' },
  { value: 'reminder', label: '到期提醒' },
  { value: 'plan', label: '在建里程碑计划' },
]
```
（`ref` 已在 vue import；`SegToggle` 已在 Task 8/本视图 import——若 MilestoneView 尚未 import SegToggle，则在 import 段加 `import SegToggle from '@/components/SegToggle.vue'`。）

3c. 模板 `</template>` 前、最后一个图表块/下钻 modal 之后，追加明细区（仍在 `<template v-else>` 内，即有数据时）：
```html
      <div class="mv-detail">
        <SegToggle v-model="detailTab" :options="DETAIL_TABS" />
        <MilestoneDelayedTab v-if="detailTab === 'delayed'" :projects="mps" :now="now" />
        <MilestoneReminderTab v-else-if="detailTab === 'reminder'" :projects="mps" :now="now" />
        <MilestonePlanTab v-else :projects="mps" />
      </div>
```

3d. `<style scoped>` 追加：
```css
.mv-detail { margin-top: var(--sp-4); }
.mv-detail > :first-child { margin-bottom: var(--sp-3); }
```

- [ ] **Step 4: 跑绿 + typecheck** — `cd frontend && npm run test:run -- src/views/MilestoneView.test.ts && npm run typecheck` → PASS（含既有用例）。

- [ ] **Step 5: 全套件 + 构建** — `cd frontend && npm run test:run && npm run typecheck && npm run build` → 全绿。

- [ ] **Step 6: Commit**
```bash
git add frontend/src/views/MilestoneView.vue frontend/src/views/MilestoneView.test.ts
git commit -m "feat(milestone): MilestoneView 接入延期/到期/在建计划 三 tab (SP-B2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 收尾验证（控制器执行）
- [ ] `bash verify.sh` 全绿。
- [ ] 冒烟：`/insight/milestone` 三 tab 切换;延期清单状态/L4 筛选 + 导出;到期提醒时间窗切换 + 4 卡 + 节点/优先级筛选 + 染色;在建计划宽表横滚 + 关键词 + 导出;链接列跳详情;剔除控件联动明细。控制台无报错。

## Self-Review（对照 spec §3-§5）
- 覆盖：orgL3(T1)；三 row-builder + 延期节点派生口径 + 到期窗口/统计 + 宽表节点列(T2-4)；分页(T5)；徽章(T6)；三 tab 组件含筛选/分页/导出/染色/链接(T7-9)；接线(T10)。
- 类型/命名一致：`MilestoneProject.orgL3`(T1)↔ row-builders(T2-4)；`DelayedRow`/`ReminderRow`/`ReminderWin`/`PlanRow`/`ReminderStat` 跨任务一致；`usePagedRows` 返回 `{paged,currentPage,pageSize}`↔ 三 tab 一致；`StatusBadge{label,tone}`↔ 用处一致；`NODE_TYPES`(T2)↔ buildPlanRows(T4)/PlanTab(T9) 同源；导出键中文列头与组件列对应。
- 无 placeholder；硬约束：状态三态令牌、无散值(仅 inline 宽度沿用既有范式)、无 emoji、逐文件 add + trailer、不碰后端/version。
