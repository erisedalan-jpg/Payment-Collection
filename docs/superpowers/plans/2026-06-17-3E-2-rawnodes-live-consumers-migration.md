# 3E-2 前端活 rawNodes 消费方换源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 5 个仍在用 rawNodes 的活消费方(概览回款带/详情抽屉/详情页骨架/全局筛选下拉/治理信号)换到收款阶段口径，并清除换源后产生的死代码。

**Architecture:** 复用 3A-3D 既有收款阶段构件(`paymentNodeRows`、`ledgerRows`)就地换源；详情抽屉全面对齐 3C 台账口径；buildProjectPage 去 rawNodes 参数(closedNodes 恒空死功能下线)；连带删 `groupByProject`/`ProjectAgg`/`dashboardStats.ts`。后端零触碰(留 3E-3)。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + Vitest（前端 `frontend/`）。

参考 spec：`docs/superpowers/specs/2026-06-17-3E-2-rawnodes-live-consumers-migration-design.md`

## Global Constraints
- 口径对齐收款阶段：金额节点级(计划=expectedPayment/已收=receivedAmount/未收=unpaidAmount/完成率=Σ已收÷Σ计划)、状态收款阶段口径。
- 简体中文注释；不用 emoji（用 → ↓ ❌ ✕ ▾）。
- 提交信息两个 -m，结尾固定：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **严禁 `git add -A`／`git add .`**：仓库根「看板数据取值条件与计算公式.md」未跟踪必须排除，只用显式路径。
- 前端命令在 `frontend/` 下；**不动后端**（rawNodes JSON 键/schema/server.py/snapshots 留 3E-3）；**不动** `RawNode` 类型本体与 `stores/data.ts` 的 `rawNodes:[]` 占位（绑定 schema，留 3E-3）。
- 版本单一来源 `frontend/src/version.ts` → V1.6.8。

**关键背景事实（源码已核）：**
- `paymentNodeRows(paymentNodes, projects, projectPmis) → PayNodeRow[]`（lib/paymentPmis；字段含 projectId/projectName/stage/planDate/expectedPayment/receivedAmount/unpaidAmount/actualRatio/status(5态)/projectManager/dept/tier）。
- `ledgerRows(nodeRows, projects) → LedgerProjectRow[]`（lib/ledger，3C）：每项目一行，字段 projectId/projectName/projectManager/orgL4/tier/projectAmount/expectedPayment/actualPayment/remainingAmount/paymentRatio/paymentStatus(进度3态:已全额回款/部分回款/未回款)/delayed(bool)/nodes(PayNodeRow[])。**无 projectType**。
- `overview.ts paymentBand(rawNodes, now)`：DelayedTopItem 含 `nodeName`。OverviewView.vue:20 调用、:88 模板 `t.nodeName`(key + 显示)。overview.ts 还有 computeKpis/healthSummary(用 Project/ProjectPmis，保留)。
- `projectDetail.ts buildProjectDetail(rawNodes, projectId)` → groupByProject(ProjectAgg)。ProjectDetailDrawer.vue: summary 用 ProjectAgg 12 字段(含 projectType)、NODE_COLS=nodeName/planDate/expectedPayment/actualPayment/actualPaymentRatio/nodeStatus/delayDays。
- `projectPage.ts buildProjectPage(projects, pmisMap, rawNodes, id)`：rawNodes 产 `nodes`(当前项目，**无渲染消费方**)+`closedNodes`(原项目，**恒空**)。ProjectDetailView.vue: NODE_COLS(127-)仅原项目 tab closedNodes 表(375-378)用；`page.nodes` 无消费方(进度里程碑表 3A 已下线)；原项目 tab 另有 originInfo/originMilestones(保留)。PMIS_NODE_COLS(113)是主回款 tab 收款阶段表(保留)。
- `dashboardStats.ts` 经 3E-1 仅余 `groupByProject`/`ProjectAgg`；其唯一活消费方是 projectDetail.ts(本期 Task4 脱离后即死)。
- `governance.ts:58` `yundocsOk = (data.rawNodes?.length ?? 0) > 0`；其卡片 main 用 `meta.totalPaymentNodes`(meta，非 rawNodes，不动)。

---

### Task 1: l4Options/pmOptions 换 projects

**Files:** Modify `frontend/src/stores/filter.ts`；Test `frontend/src/stores/filter.test.ts`

**Interfaces:** Consumes `Project.orgL4`/`Project.projectManager`。

- [ ] **Step 1: 改/加测试** — `filter.test.ts` 中 l4Options/pmOptions 用 projects 夹具断言（若已有旧 rawNodes 夹具用例则改写其 seed）：
```ts
it('l4Options/pmOptions 取自 projects 去重', () => {
  const ds = useDataStore()
  ds.data = { projects: [
    { projectId: 'P1', orgL4: '北京组', projectManager: '张' },
    { projectId: 'P2', orgL4: '上海组', projectManager: '李' },
    { projectId: 'P3', orgL4: '北京组', projectManager: '张' },
  ], paymentNodes: {}, projectPmis: {} } as any
  const f = useFilterStore()
  expect([...f.l4Options].sort()).toEqual(['上海组', '北京组'])
  expect([...f.pmOptions].sort()).toEqual(['张', '李'].sort())
})
```

- [ ] **Step 2: 跑确认失败** — `cd frontend && npx vitest run src/stores/filter.test.ts -t "l4Options"` → FAIL（旧实现读 rawNodes，新 seed 无 rawNodes）。

- [ ] **Step 3: 实现** — `filter.ts` 把两 computed 的循环源换 projects：
```ts
const l4Options = computed(() => {
  const set = new Set<string>()
  for (const p of data.data?.projects ?? []) {
    const v = (p as { orgL4?: string }).orgL4
    if (v) set.add(v)
  }
  return [...set]
})
const pmOptions = computed(() => {
  const set = new Set<string>()
  for (const p of data.data?.projects ?? []) {
    const v = (p as { projectManager?: string }).projectManager
    if (v) set.add(v)
  }
  return [...set]
})
```

- [ ] **Step 4: 跑确认通过** — `cd frontend && npx vitest run src/stores/filter.test.ts && npm run typecheck` → PASS / 无报错。

- [ ] **Step 5: 提交**
```bash
git add frontend/src/stores/filter.ts frontend/src/stores/filter.test.ts
git commit -m "feat(3e-2): l4Options/pmOptions 换 projects(脱离 rawNodes)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: governance yundocsOk 换 projects.length

**Files:** Modify `frontend/src/lib/governance.ts`；Test `frontend/src/lib/governance.test.ts`（若不存在则按既有测试文件命名 `dataQuality.test.ts`，先 grep 确认）

- [ ] **Step 1: grep 测试文件名** — `cd frontend && ls src/lib/governance.test.ts src/lib/dataQuality.test.ts 2>/dev/null; grep -rln "buildHealthReport" src/lib/*.test.ts` → 确定治理测试文件路径。

- [ ] **Step 2: 加失败测试** — 在该测试文件加：
```ts
it('yundocsOk 由 projects 非空决定(rawNodes 空不再误红)', () => {
  const r = buildHealthReport({ meta: {}, projects: [{ projectId: 'P1' }], rawNodes: [] } as any)
  expect(r.verdict).not.toBe('red')
  expect(r.sources[0].provided).toBe(true)
})
it('projects 空则红色告警', () => {
  const r = buildHealthReport({ meta: {}, projects: [], rawNodes: [{}] } as any)
  expect(r.verdict).toBe('red')
})
```

- [ ] **Step 3: 跑确认失败** — `cd frontend && npx vitest run <治理测试文件> -t "yundocsOk"` → FAIL（旧实现按 rawNodes.length）。

- [ ] **Step 4: 实现** — `governance.ts:58` 改：
```ts
  const yundocsOk = (data.projects?.length ?? 0) > 0
```
（其余不动：卡片 main 仍 `meta.totalPaymentNodes`、metaLine 仍 meta 字段。）

- [ ] **Step 5: 跑确认通过** — `cd frontend && npx vitest run <治理测试文件> && npm run typecheck` → PASS。

- [ ] **Step 6: 提交**
```bash
git add frontend/src/lib/governance.ts <治理测试文件>
git commit -m "feat(3e-2): governance yundocsOk 换 projects.length(脱离 rawNodes)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: paymentBand 换 PayNodeRow + OverviewView

**Files:** Modify `frontend/src/lib/overview.ts`、`frontend/src/views/OverviewView.vue`；Test `frontend/src/lib/overview.test.ts`

**Interfaces:**
- Consumes `PayNodeRow`、`paymentNodeRows`。
- Produces `paymentBand(rows: PayNodeRow[], now: Date): PaymentBand`；`DelayedTopItem` 字段 `nodeName`→`stage`。

- [ ] **Step 1: 改测试** — `overview.test.ts` 的 paymentBand 用例换 PayNodeRow 夹具（pn() 工厂同 calendar.test 风格，含 stage/planDate/expectedPayment/receivedAmount/unpaidAmount/status）：
```ts
it('paymentBand 收款阶段口径', () => {
  const now = new Date('2026-02-15T00:00:00')
  const rows = [
    pn({ planDate: '2026-02-10', expectedPayment: 100000, receivedAmount: 40000, unpaidAmount: 60000, status: '部分回款' }),
    pn({ planDate: '2026-02-18', expectedPayment: 50000, receivedAmount: 0, unpaidAmount: 50000, status: '延期', stage: '验收款', projectId: 'P9', projectName: '丙' }),
    pn({ planDate: '2025-12-01', expectedPayment: 30000, receivedAmount: 30000, unpaidAmount: 0, status: '已回款' }),
  ]
  const b = paymentBand(rows, now)
  expect(b.yearExpected).toBe(150000)   // 2026 两条
  expect(b.yearActual).toBe(40000)
  expect(b.monthPending).toBe(110000)   // 当月 Σ未收 60000+50000
  expect(b.dueSoon7).toBe(1)            // 02-18 距 02-15=3天、未结清
  expect(b.delayedTop[0]).toMatchObject({ projectId: 'P9', stage: '验收款', remaining: 50000 })
})
```

- [ ] **Step 2: 跑确认失败** — `cd frontend && npx vitest run src/lib/overview.test.ts -t "paymentBand"` → FAIL。

- [ ] **Step 3: 实现 overview.ts** —
(a) 顶部 import：删 `RawNode`，保留 `Project, ProjectPmis`；增 `import type { PayNodeRow } from './paymentPmis'`。
(b) `DelayedTopItem` 接口 `nodeName: string` → `stage: string`。
(c) `paymentBand` 重写：
```ts
/** 回款重点带——now 注入便于测试;收款阶段节点级口径(计划=expectedPayment/已收=receivedAmount/未收=unpaidAmount/状态5态)。 */
export function paymentBand(rows: PayNodeRow[], now: Date): PaymentBand {
  const year = String(now.getFullYear())
  const month = isoDate(now).slice(0, 7)
  const today = isoDate(now)
  const until = isoDate(new Date(now.getTime() + 7 * 86400000))

  let yearExpected = 0
  let yearActual = 0
  let monthPending = 0
  let dueSoon7 = 0
  const delayed: DelayedTopItem[] = []
  for (const n of rows) {
    const plan = String(n.planDate ?? '')
    if (plan.startsWith(year)) {
      yearExpected += n.expectedPayment
      yearActual += n.receivedAmount
    }
    if (plan.slice(0, 7) === month) monthPending += n.unpaidAmount
    if (plan >= today && plan <= until && n.status !== '已回款') dueSoon7++
    if (n.status === '延期') {
      delayed.push({ projectId: n.projectId, projectName: n.projectName, stage: n.stage, remaining: n.unpaidAmount })
    }
  }
  delayed.sort((a, b) => b.remaining - a.remaining)
  return { yearExpected, yearActual, monthPending, dueSoon7, delayedTop: delayed.slice(0, 3) }
}
```

- [ ] **Step 4: 实现 OverviewView.vue** —
(a) 增 `import { paymentNodeRows } from '@/lib/paymentPmis'`；若 `RawNode` import 仅 band 用则删之。
(b) 第 20 行 band：
```ts
const band = computed(() => paymentBand(
  paymentNodeRows(data.data?.paymentNodes, data.data?.projects ?? [], data.data?.projectPmis), new Date()))
```
(c) 模板延期 Top3（第 88 行起）：把 `t.nodeName` 全部改 `t.stage`（key `:key="`${t.projectId}-${t.stage}`"` + 显示文本）。grep `t.nodeName` 确保无残留。

- [ ] **Step 5: 跑确认通过** — `cd frontend && npx vitest run src/lib/overview.test.ts && npm run typecheck` → PASS。

- [ ] **Step 6: 提交**
```bash
git add frontend/src/lib/overview.ts frontend/src/views/OverviewView.vue frontend/src/lib/overview.test.ts
git commit -m "feat(3e-2): paymentBand 换收款阶段口径(概览回款带,nodeName→stage)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 详情抽屉换源(对齐 3C 台账)【重点】

**Files:** Modify `frontend/src/lib/projectDetail.ts`、`frontend/src/components/ProjectDetailDrawer.vue`；Test `frontend/src/lib/projectDetail.test.ts`（若无则新建）+ `frontend/src/components/ProjectDetailDrawer.test.ts`（若有）

**Interfaces:**
- Consumes `paymentNodeRows`、`ledgerRows`/`LedgerProjectRow`、`PayNodeRow`。
- Produces `buildProjectDetail(paymentNodes, projects, projectPmis, projectId): { project: LedgerProjectRow | null; nodes: PayNodeRow[] }`。

- [ ] **Step 1: 写失败测试** — `projectDetail.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { buildProjectDetail } from './projectDetail'
describe('buildProjectDetail(收款阶段)', () => {
  const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: 'A组', paymentPmis: { contract: 2000000 } }] as any
  const paymentNodes = { P1: [
    { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.5, actualRatio: 0.3, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
    { stage: '验收款', planDate: '2026-03-01', actualDate: '', payRatio: 0.5, actualRatio: 0, expectedPayment: 1000000, receivedAmount: 0, unpaidAmount: 1000000, status: '延期' },
  ] } as any
  it('摘要取 ledgerRows 口径 + nodes 为 PayNodeRow', () => {
    const d = buildProjectDetail(paymentNodes, projects, {}, 'P1')
    expect(d.project?.expectedPayment).toBe(2000000)
    expect(d.project?.actualPayment).toBe(600000)
    expect(d.project?.remainingAmount).toBe(1400000)
    expect(d.project?.paymentStatus).toBe('部分回款')
    expect(d.project?.delayed).toBe(true)
    expect(d.nodes).toHaveLength(2)
    expect(d.nodes[0].stage).toBe('到货款')
  })
  it('项目不存在返回空', () => {
    expect(buildProjectDetail(paymentNodes, projects, {}, 'X')).toEqual({ project: null, nodes: [] })
  })
})
```

- [ ] **Step 2: 跑确认失败** — `cd frontend && npx vitest run src/lib/projectDetail.test.ts` → FAIL（旧签名吃 rawNodes）。

- [ ] **Step 3: 重写 projectDetail.ts** —
```ts
import type { Project, ProjectPmis } from '@/types/analysis'
import { paymentNodeRows, type PayNodeRow } from './paymentPmis'
import { ledgerRows, type LedgerProjectRow } from './ledger'

export interface ProjectDetail {
  project: LedgerProjectRow | null
  nodes: PayNodeRow[]
}

/** 单项目下钻：复用 3C ledgerRows 聚合(进度3态+延期)取目标项目行 + 其收款阶段节点。不经纳管/年份/视角过滤。 */
export function buildProjectDetail(
  paymentNodes: Parameters<typeof paymentNodeRows>[0],
  projects: Project[],
  projectPmis: Record<string, ProjectPmis> | undefined,
  projectId: string,
): ProjectDetail {
  const rows = paymentNodeRows(paymentNodes, projects, projectPmis)
  const row = ledgerRows(rows, projects).find((r) => r.projectId === projectId) ?? null
  return { project: row, nodes: row?.nodes ?? [] }
}
```
（`Parameters<typeof paymentNodeRows>[0]` 取 paymentNodes 形参类型，避免硬编 paymentNodes 的 schema 类型名出错；若该写法 typecheck 不顺，改用 `Record<string, unknown[]> | undefined` 等 paymentNodeRows 实际接受的类型——以 paymentNodeRows 签名为准。）

- [ ] **Step 4: 跑确认通过(lib)** — `cd frontend && npx vitest run src/lib/projectDetail.test.ts` → PASS。

- [ ] **Step 5: 改 ProjectDetailDrawer.vue** —
(a) import：删 `RawNode`；`buildProjectDetail` import 不变；增 `fmtYuan, fmtRatio`（已 import 则复用）。
(b) `detail` computed：
```ts
const detail = computed(() =>
  pd.openId
    ? buildProjectDetail(data.data?.paymentNodes, (data.data?.projects ?? []) as Project[], data.data?.projectPmis, pd.openId)
    : { project: null, nodes: [] },
)
```
(c) `summary`：去掉「项目类型」(LedgerProjectRow 无)，回款状态用 paymentStatus(3态)、增「延期」：
```ts
const summary = computed(() => {
  const p = detail.value.project
  if (!p) return []
  return [
    { k: '项目编号', v: p.projectId },
    { k: '项目名称', v: p.projectName || '-' },
    { k: '服务组(L4)', v: p.orgL4 || '-' },
    { k: '项目经理', v: p.projectManager || '-' },
    { k: '金额区间', v: p.tier || '-' },
    { k: '项目金额', v: fmtYuan(p.projectAmount) },
    { k: '回款状态', v: p.paymentStatus },
    { k: '延期', v: p.delayed ? '有延期节点' : '无' },
    { k: '完成率', v: fmtRatio(p.paymentRatio) },
    { k: '计划回款', v: fmtYuan(p.expectedPayment) },
    { k: '已回款', v: fmtYuan(p.actualPayment) },
    { k: '待回款', v: fmtYuan(p.remainingAmount) },
  ]
})
```
(d) `NODE_COLS` 换收款阶段列（去 delayDays、nodeName→stage、nodeStatus→status、actualPaymentRatio→actualRatio、actualPayment→receivedAmount、增未收）：
```ts
const NODE_COLS: DataColumn[] = [
  { key: 'stage', label: '阶段' },
  { key: 'planDate', label: '计划日期' },
  { key: 'expectedPayment', label: '计划回款', formatter: (v: unknown) => fmtYuan(v as number) },
  { key: 'receivedAmount', label: '已回款', formatter: (v: unknown) => fmtYuan(v as number) },
  { key: 'unpaidAmount', label: '未回款', formatter: (v: unknown) => fmtYuan(v as number) },
  { key: 'actualRatio', label: '实际比例', formatter: (v: unknown) => fmtRatio(v as number) },
  { key: 'status', label: '状态' },
]
```
（formatter 签名按 `DataColumn` 既有约定；若 fmtRatio 需 fallback 参数按其签名传。`formatCellValue` 不再用于这些列，可删该 import 若无其它使用。模板 `<DataTable :columns="NODE_COLS" :rows="detail.nodes">` 不变。）

- [ ] **Step 6: 跑确认通过(全)** — `cd frontend && npx vitest run src/components/ProjectDetailDrawer.test.ts 2>/dev/null; npm run typecheck` → typecheck 无报错；抽屉测试(若有)绿。

- [ ] **Step 7: 提交**
```bash
git add frontend/src/lib/projectDetail.ts frontend/src/components/ProjectDetailDrawer.vue frontend/src/lib/projectDetail.test.ts
git commit -m "feat(3e-2): 详情抽屉换收款阶段(对齐3C台账,去 projectType/delayDays)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: buildProjectPage 去 rawNodes 参数 + 原项目 tab 去 closedNodes 表

**Files:** Modify `frontend/src/lib/projectPage.ts`、`frontend/src/views/ProjectDetailView.vue`；Test `frontend/src/lib/projectPage.test.ts`（若有）

**Interfaces:** Produces `buildProjectPage(projects, pmisMap, id): ProjectPageData`（去 rawNodes 参数；`ProjectPageData` 删 `nodes`/`closedNodes` 字段）。

- [ ] **Step 1: grep 确认 page.nodes/closedNodes 无其它消费方** — `cd frontend && grep -rn "page.nodes\|\.closedNodes\|page\.value\.nodes" src --include=*.vue --include=*.ts`
预期：`closedNodes` 仅 ProjectDetailView.vue:375-377；`nodes`(page) 无渲染消费方。若有意料外消费，停止汇报 BLOCKED。

- [ ] **Step 2: 改/加测试** — `projectPage.test.ts`（若有）去掉 nodes/closedNodes 断言、调用去 rawNodes 参数；若无测试则跳过（去参为类型层改动，由 typecheck 保障）。

- [ ] **Step 3: 改 projectPage.ts** —
```ts
import type { Project, ProjectPmis } from '@/types/analysis'

export interface ProjectPageData {
  project: Project | null
  pmis: ProjectPmis | null
  closedId: string
  closedPmis: ProjectPmis | null
}

export function buildProjectPage(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  id: string,
): ProjectPageData {
  const project = projects.find((p) => p.projectId === id) ?? null
  if (!project) return { project: null, pmis: null, closedId: '', closedPmis: null }
  const closedId = project.relatedClosedId || ''
  return {
    project,
    pmis: pmisMap[id] ?? null,
    closedId,
    closedPmis: closedId ? (pmisMap[closedId] ?? null) : null,
  }
}
```
（删 `RawNode` import；RISK_COLUMNS/fmtDateCell 保留不动。）

- [ ] **Step 4: 改 ProjectDetailView.vue** —
(a) 更新 buildProjectPage 调用：去掉 rawNodes 实参（grep `buildProjectPage(` 找到调用处，删第 3 个 rawNodes 参数）。
(b) 删原项目 tab 的 closedNodes 表（第 375-378 行 `<template v-if="page.closedNodes.length"> ... </template>` 整块）。
(c) 删 `NODE_COLS`(127-)（仅该表用）；删 `RawNode` import 若现已无用。originInfo/originMilestones/MilestoneTable/PMIS_NODE_COLS 全部保留。

- [ ] **Step 5: 跑确认通过** — `cd frontend && npx vitest run src/lib/projectPage.test.ts 2>/dev/null; npm run typecheck` → typecheck 无报错。

- [ ] **Step 6: 提交**
```bash
git add frontend/src/lib/projectPage.ts frontend/src/views/ProjectDetailView.vue
git commit -m "feat(3e-2): buildProjectPage 去 rawNodes 参数 + 原项目 tab 去恒空 closedNodes 表" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 删 groupByProject/dashboardStats.ts + 版本 V1.6.8 + PROGRESS + 验证

**Files:** Delete `frontend/src/lib/dashboardStats.ts`（+ 残余测试）；Modify `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: grep 证 groupByProject/ProjectAgg 已零活消费** — `cd frontend && grep -rnE "groupByProject|ProjectAgg|from '@/lib/dashboardStats'|from '\\./dashboardStats'" src --include=*.vue --include=*.ts`
预期：仅 `dashboardStats.ts`(定义)与其残余测试。若有别处 import，停止汇报 BLOCKED。

- [ ] **Step 2: 删文件** —
`cd frontend && git rm src/lib/dashboardStats.ts`；若存在 `src/lib/dashboardStats.test.ts`（3E-1 保留的 groupByProject 测试块）则 `git rm src/lib/dashboardStats.test.ts`。

- [ ] **Step 3: 升版本** — `frontend/src/version.ts`：
```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.6.8'
export const RELEASE_DATE = '2026-06-17'
```

- [ ] **Step 4: 更新 PROGRESS.md** — 「全局下线 rawNodes 程序」⑤ 下 3E-1 条目后插入 3E-2 一条、并把 3E-2 待开标记移除（保留 3E-3 待开）：
```markdown
**3E-2 前端活消费换源（spec/plan 2026-06-17-3E-2-rawnodes-live-consumers-migration，V1.6.8，feat/3e-2-live-consumers）**——5 活消费方脱离 rawNodes：l4Options/pmOptions 换 projects、governance yundocsOk 换 projects.length、paymentBand(概览回款带)换 PayNodeRow(nodeName→stage)、详情抽屉 buildProjectDetail 全面对齐 3C 台账(复用 ledgerRows;摘要去 projectType、节点表收款阶段列去 delayDays)、buildProjectPage 去 rawNodes 参数 + 原项目 tab 去恒空 closedNodes 表(Path B,调研证实结构性死功能)。连带删 groupByProject/ProjectAgg/整文件 dashboardStats.ts。**此后前端仅余 `RawNode` 类型本体 + stores/data.ts 的 rawNodes:[] 占位仍绑 rawNodes 键**(随 3E-3 删后端一并清)。verify.sh 全绿。
```

- [ ] **Step 5: 全量 verify.sh** — `bash verify.sh` → python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

- [ ] **Step 6: 手验（建议）** — build 后手开：`/`(首页回款带)、`/project/:id`(详情 + 原项目 tab)、列表下钻抽屉、`/governance`、FilterBar 服务组/经理下拉，确认换源无回归、无 JS 报错。

- [ ] **Step 7: 提交**
```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(3e-2): 删 dashboardStats.ts 死代码 + 版本 V1.6.8 + PROGRESS" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- 6 任务全部提交；`bash verify.sh` 全绿。
- 前端不再有 `data.data.rawNodes` 数据消费点（仅余 `RawNode` 类型本体 + data.ts 占位，绑定 schema 留 3E-3）。
- 5 消费方换收款阶段口径正确：概览回款带/详情抽屉(对齐3C)/筛选下拉/治理信号；buildProjectPage 去参、原项目 tab 无 closedNodes 表(originInfo/originMilestones 照常)。
- `groupByProject`/`ProjectAgg`/`dashboardStats.ts` 删除；后端零触碰。
- 版本 V1.6.8；PROGRESS 记 3E-2 + 保留 3E-3 待开。
- 未触碰：后端任何文件、`RawNode` 类型、data.ts 占位、仓库根未跟踪文件、其它已换源页面。
