# 3C 回款台账 /ledger 换源（节点级收款阶段口径）设计

> 2026-06-17 立项。隶属「全局下线 rawNodes 旧口径程序」第③步（3A 详情页、3B 回款总览已合并 master）。
> 把回款台账 `/ledger`（LedgerView）从 rawNodes 旧口径换到 3A 的收款阶段口径，**纯前端**。
> 与 3B 的区别：台账状态维度旧用 6 态（PMIS 里程碑反推产物），收款阶段口径无对应，**必须换词表**——
> 故 3C 非纯忠实换源，状态 6 态→项目级进度 3 态 + 延期。

## 背景与现状（已测绘证实）

- `/ledger`（`LedgerView.vue`）是**项目级**台账（一行一项目）：
  `rawNodes` → `excludeFilter`（仅纳管排除，**无年份/视角**）→ `groupByProject`（dashboardStats，旧 6 态）
  → `filterLedgerProjects`（搜索/区间/状态）→ `applyColumnFilters`（CrossFilter 列筛选）→ displayed。
- summary-bar（项目数/计划/已回款/待回款/完成率）、status-row（**旧 6 态** 加资源可提前/达到回款条件/已提前回款/已全额回款/延期/正常实施中 计数）、tier-cards（3 档）、LedgerTable（项目行 + 行内下钻 **rawNodes 节点明细**）。
- `lib/ledger.ts`：`excludeFilter` / `filterLedgerProjects` / `ledgerSummary` / `ledgerTierStats` / `ledgerStatusCounts`（均消费 `ProjectAgg`）。
- **`excludeFilter` 与 CalendarView(3D) 共用**（3D 仍需），本期保留不动；其余 ProjectAgg 版函数为台账专用。
- 3B 已扩展 `paymentNodeRows`/`PayNodeRow`（含 `receivedAmount/unpaidAmount/projectManager/status/tier/dept` 等），可复用。

## 目标

- LedgerView 改由收款阶段口径驱动（3A 的 `paymentNodes` + `projects`），金额节点级、状态项目级进度 3 态 + 延期。
- 保持台账项目级一行一项目 + 行内收款阶段节点下钻、CrossFilter 列筛选、搜索/区间/状态筛选、summary/tier 卡。
- 不碰后端、不碰 rawNodes 共享路径（`filteredNodes`/`excludeFilter` 留 3D；`groupByProject` 留 3E）。

## 口径（用户 2026-06-17 钦定）

- **金额节点级收款阶段**（对齐 3B）：每项目 `计划=Σ节点 expectedPayment`、`已回款=Σ节点 receivedAmount`、`待回款=Σ节点 unpaidAmount`、`完成率=Σ已收÷Σ计划`。
- **状态项目级进度 3 态 + 延期**：
  - 状态列 `paymentStatus` = progress 三态，由节点级比例 `r=Σ已收÷Σ计划` 派生：`r≥0.999`→已全额回款 / `r>0`→部分回款 / 否则→未回款。
  - 「延期」**不是状态列的值**，而是 status-row 的一张卡 + 一个筛选项，按「项目有任一 status==延期 的节点」判定（cross-cutting，与 progress 正交）。
- 台账**仅纳管排除**，无年份/视角过滤（沿用现状）。

## 范围

**做**：`lib/ledger.ts` 增收款阶段口径函数（5 个）；`LedgerView.vue` 换源 + status-row 4 卡 + STATUS_OPTS 4；`LedgerTable.vue` 下钻改收款阶段节点；配套测试；版本 V1.6.5。

**不做**：
- 不动后端（preprocess/dashboard）。
- 不动 `filter.filteredNodes`、`lib/filterNodes.ts`、`lib/dashboardStats.ts`（`groupByProject` 等留 3E）、`lib/dashboardCharts.ts`、`lib/payDashboard.ts`。
- 不动 `lib/ledger.excludeFilter`（CalendarView 3D 共用）；旧 `filterLedgerProjects/ledgerSummary/ledgerTierStats/ledgerStatusCounts`（ProjectAgg 版）保留作死代码，待 3E 随 rawNodes 统一清。
- 不改台账行粒度（保持项目级）、不新增列。

## 文件结构与职责

| 文件 | 改动 |
|---|---|
| `frontend/src/lib/ledger.ts` | 增 `LedgerProjectRow` 类型 + `ledgerRows` + `filterLedgerRows` + `ledgerSummaryPmis` + `ledgerTierStatsPmis` + `ledgerStatusCountsPmis` |
| `frontend/src/views/LedgerView.vue` | 数据源换收款阶段；status-row 4 卡；STATUS_OPTS 4；状态列=progress；下钻传收款阶段节点 |
| `frontend/src/components/LedgerTable.vue` | 下钻明细改收款阶段节点（`node-rows` prop 替 `raw-nodes`）；下钻表列改 |
| 对应 `.test.ts` | 见"测试" |

## 接口设计

### `lib/ledger.ts` 新增

```ts
import type { Project } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'

export interface LedgerProjectRow {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  tier: string
  projectAmount: number      // 合同总额(元)
  expectedPayment: number    // Σ节点计划(元)
  actualPayment: number      // Σ节点已收(元)
  remainingAmount: number    // Σ节点未收(元)
  paymentRatio: number       // Σ已收÷Σ计划
  paymentStatus: string      // progress 三态：已全额回款/部分回款/未回款
  delayed: boolean           // 有任一 status==延期 的节点
  nodes: PayNodeRow[]        // 该项目的收款阶段节点(供下钻)
}

/** 按 projectId 聚合收款阶段节点 → 项目级台账行。仅纳入在 projects 中的项目(join 取维度)。 */
export function ledgerRows(nodeRows: PayNodeRow[], projects: Project[]): LedgerProjectRow[] {
  const byId = new Map(projects.map((p) => [p.projectId, p]))
  const grp: Record<string, PayNodeRow[]> = {}
  for (const n of nodeRows) (grp[n.projectId] ||= []).push(n)
  const out: LedgerProjectRow[] = []
  for (const [pid, nodes] of Object.entries(grp)) {
    const p = byId.get(pid)
    if (!p) continue
    const expectedPayment = nodes.reduce((s, n) => s + n.expectedPayment, 0)
    const actualPayment = nodes.reduce((s, n) => s + n.receivedAmount, 0)
    const remainingAmount = nodes.reduce((s, n) => s + n.unpaidAmount, 0)
    const r = expectedPayment > 0 ? actualPayment / expectedPayment : 0
    const paymentStatus = r >= 0.999 ? '已全额回款' : r > 0 ? '部分回款' : '未回款'
    out.push({
      projectId: pid,
      projectName: p.projectName || pid,
      projectManager: (p.projectManager ?? '').trim() || '未指定',
      orgL4: nodes[0].dept,            // dept=deriveDept(project)
      tier: nodes[0].tier,
      projectAmount: p.paymentPmis?.contract ?? 0,
      expectedPayment, actualPayment, remainingAmount,
      paymentRatio: r,
      paymentStatus,
      delayed: nodes.some((n) => n.status === '延期'),
      nodes,
    })
  }
  return out
}

export interface LedgerRowFilterOpts { search: string; tier: string; status: string }

/** 搜索/区间/状态筛选 + 按 projectAmount 降序。状态:三进度态按 paymentStatus,'延期' 按 delayed。 */
export function filterLedgerRows(rows: LedgerProjectRow[], opts: LedgerRowFilterOpts): LedgerProjectRow[] {
  const q = (opts.search || '').toLowerCase()
  let out = rows
  if (opts.tier) out = out.filter((r) => r.tier === opts.tier)
  if (opts.status) {
    out = opts.status === '延期'
      ? out.filter((r) => r.delayed)
      : out.filter((r) => r.paymentStatus === opts.status)
  }
  if (q) out = out.filter((r) =>
    (String(r.projectId) + r.projectName + r.projectManager + r.orgL4).toLowerCase().includes(q))
  return [...out].sort((a, b) => (b.projectAmount || 0) - (a.projectAmount || 0))
}

export interface LedgerSummaryPmis {
  projectCount: number; totalExp: number; totalAct: number; totalRem: number; rate: number
}
export function ledgerSummaryPmis(rows: LedgerProjectRow[]): LedgerSummaryPmis {
  const totalExp = rows.reduce((s, r) => s + r.expectedPayment, 0)
  const totalAct = rows.reduce((s, r) => s + r.actualPayment, 0)
  return { projectCount: rows.length, totalExp, totalAct, totalRem: totalExp - totalAct,
    rate: totalExp > 0 ? totalAct / totalExp : 0 }
}

const LEDGER_TIERS = ['100万以上', '50-100万', '50万以下']
export interface LedgerTierStatPmis { tier: string; count: number; expWan: number; remWan: number }
export function ledgerTierStatsPmis(rows: LedgerProjectRow[]): LedgerTierStatPmis[] {
  return LEDGER_TIERS.map((t) => {
    const tp = rows.filter((r) => r.tier === t)
    const exp = tp.reduce((s, r) => s + r.expectedPayment, 0)
    const act = tp.reduce((s, r) => s + r.actualPayment, 0)
    return { tier: t, count: tp.length, expWan: exp / 10000, remWan: (exp - act) / 10000 }
  })
}

export interface LedgerStatusCountsPmis { fullPaid: number; partial: number; unpaid: number; delayed: number }
export function ledgerStatusCountsPmis(rows: LedgerProjectRow[]): LedgerStatusCountsPmis {
  return {
    fullPaid: rows.filter((r) => r.paymentStatus === '已全额回款').length,
    partial: rows.filter((r) => r.paymentStatus === '部分回款').length,
    unpaid: rows.filter((r) => r.paymentStatus === '未回款').length,
    delayed: rows.filter((r) => r.delayed).length,
  }
}
```

### `LedgerView.vue`

- import 增 `paymentNodeRows`（paymentPmis）+ 新 ledger 函数；保留 `excludeFilter`（仍排除项目）。
- 数据源：
  ```ts
  const allRows = computed(() => ledgerRows(
    paymentNodeRows(data.data?.paymentNodes, data.data?.projects ?? [], data.data?.projectPmis),
    data.data?.projects ?? [],
  ))
  const baseProjs = computed(() => filter.excludeOn
    ? allRows.value.filter((r) => !filter.excludedIds[r.projectId]) : allRows.value)
  ```
- `searched = filterLedgerRows(baseProjs, {search,tier,status})`；`displayed = applyColumnFilters(searched, cf...)`。
- `summary = ledgerSummaryPmis(displayed)`、`tierStats = ledgerTierStatsPmis(displayed)`、`statusCounts = ledgerStatusCountsPmis(displayed)`。
- `STATUS_OPTS = ['已全额回款', '部分回款', '未回款', '延期']`。
- status-row 改 **4 卡**：已全额回款 `statusCounts.fullPaid` / 部分回款 `partial` / 未回款 `unpaid` / 延期 `delayed`。
- 表格列：金额列取 `expectedPayment/actualPayment/remainingAmount/paymentRatio`（行已带，不再行内现算 remaining），状态列 `paymentStatus`。其余列（projectId/projectName/tier/orgL4/projectManager/projectAmount）不变。
- LedgerTable **不再传 `:raw-nodes`**：每个 `LedgerProjectRow` 已带 `nodes`（该项目收款阶段节点），下钻直接读 `row.nodes`。

### `LedgerTable.vue`

- **删 `rawNodes` prop**（及对 `getNodeRemaining`/riskGroups 的 import）；下钻节点来源改为行自带的 `p.nodes`（`LedgerProjectRow.nodes`）。
- `projNodes(projectId)` 函数删除，模板 `v-if="p.nodes.length"` / `v-for="n in p.nodes"`。
- 下钻表 thead/tbody 列改：`阶段 / 计划日期 / 已收(元) / 未收(元) / 实际比例 / 状态`，取 `n.stage / n.planDate / fmtYuan(n.receivedAmount) / fmtYuan(n.unpaidAmount) / fmtRatio(n.actualRatio) / n.status`。删 `nodeStatus`/`milestone||stageName||nodeName`/`actualPaymentRatio` 旧字段依赖。
- CrossFilter（`ColumnFilter` + `source-rows`）不变，source-rows 改为新项目行（`baseProjs`）。

> 注：下钻"实际比例"取节点的实际回款比例。`PayNodeRow` 当前有 `payRatio`(计划比例) 但**无 actualRatio**；下钻"实际比例"列需要节点实际比例。实现时若 `PayNodeRow` 无 actualRatio，用 `receivedAmount/expectedPayment` 现算行内比例，或在 paymentNodeRows 追加 `actualRatio`（PaymentNodePmis 已有 actualRatio）。**本 spec 选择：paymentNodeRows 追加 `actualRatio` 字段**（与 3B 同类追加，向后兼容），下钻直接取 `n.actualRatio`。

## 测试

- `frontend/src/lib/ledger.test.ts`（扩展）：新 5 函数——`ledgerRows`(聚合金额/progress 派生/delayed/join 维度)、`filterLedgerRows`(搜索/区间/状态含延期分支)、`ledgerSummaryPmis`、`ledgerTierStatsPmis`、`ledgerStatusCountsPmis`(四计数)。
- `frontend/src/lib/paymentPmis.test.ts`（扩展）：`paymentNodeRows` 输出含 `actualRatio`。
- `frontend/src/views/LedgerView.test.ts`（改夹具收款阶段）：4 状态卡、状态列 progress、summary/tier 按收款阶段口径、状态筛选(含延期)。
- `frontend/src/components/LedgerTable.test.ts`（改夹具）：下钻渲染收款阶段节点（阶段/已收/未收/状态 5 态）。

## 版本与进度

- `frontend/src/version.ts` → **V1.6.5**（Z 级：既有页换源 + 状态卡 6→4 局部变），RELEASE_DATE `2026-06-17`。
- `PROGRESS.md`：「全局下线 rawNodes 程序」③3C 记一条。

## 验证（声称完成前必跑）

```bash
bash verify.sh   # python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿
```

附加：build 后手验 `/ledger`：项目行/4 状态卡/分层/搜索/区间/状态筛选/列筛选/行下钻收款阶段节点均正常，无 JS 报错。

## 取舍记录

- **状态 6 态→进度 3 态 + 延期**（用户钦定）：旧 6 态是 PMIS 里程碑反推产物，收款阶段口径无对应，必须换；延期作正交卡+筛选项而非状态列值，因一个项目可「部分回款」且含延期节点。
- **金额节点级收款阶段**（对齐 3B、用户钦定）：与 /payment 看板同口径；与详情页头部「流水÷合同」并存（平台双口径）。
- **新建收款阶段 ledger 函数、旧 ProjectAgg 版留死**：`excludeFilter` 与 3D 共用必须留；其余旧函数台账专用、3C 后即死，统一待 3E 随 rawNodes 清，避免本期触碰共享 `groupByProject`。
- **paymentNodeRows 追加 `actualRatio`**：下钻"实际比例"列需要，PaymentNodePmis 已有该字段，追加兼容。
