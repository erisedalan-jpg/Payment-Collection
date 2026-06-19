# SP1 数据治理：异常项目识别与回款排除 设计

> 大需求「数据治理 + /payment 重做 + 路由拆分 + /payment/board 重做」拆为 5 个子项目，本文是 **SP1（数据基座）**。
> SP2-SP5 各自独立 spec→plan→实现，依赖 SP1 的排除口径。

**日期:** 2026-06-19
**版本:** V1.10.1（Z 级：数据治理子功能 + 跨页排除 + 清单标记，无新增页/整页重设计）
**范围:** 仅"异常项目识别 + 回款看板硬排除 + 治理页告警 + 项目清单标记"。不改后端/数据、不动周期筛选（SP2）、不动 /payment 与 board 布局（SP3/SP5）。

---

## 1. 背景与判定（已与用户敲定）

部分主域项目「在项目中心 ∩ 组织架构通过，但项目基础信息无 L4 数据」，导致 `projects[].orgL4` 为空。实测样例（2026-06-19 快照）：`WSGF-SS-202604169018`、`WSGF-SS-202606159029`、`WSGF-SS-202606169010`——均在主域、`orgL4=""`、0 个回款节点。这类作为异常数据：项目清单仍正常展示并标记，回款相关看板统计时排除。

**判定条件（用户选定）：** 主域 `projects[]` 中 `orgL4` 去空白后为空 → 异常。`isAnomalous(p) = !(p.orgL4 ?? '').trim()`。

**架构（用户选定纯前端）：** `orgL4` 已在 `projects[]` 内、`governance.ts` 本就是读 data 的纯函数，故**不改 `preprocess_data.py`/`schema.py`、不重跑数据**；新增 `frontend/src/lib/anomaly.ts` 承载判定。

**范围边界：** 仅主域在建 `projects[]`（/projects 在建 + 全部回款看板均以 projects[] 为底）。已关闭项目 `closedProjects`（独立 PMIS 三表、独立 orgL4）不在本轮。

---

## 2. 组件与数据流

```
projects[] ──isAnomalous(p)=!orgL4──┐
                                     ├─ filterProjects()  恒去除异常 → /payment 项目数 + /panalysis 五页
                                     ├─ paymentNodeRows()  跳过异常 pid → /payment 节点链 + 节点页
                                     ├─ buildHealthReport() 新增告警组「回款排除：服务组 L4 缺失」
                                     └─ buildProjectRows()  打 isAnomalous → /projects 挂「数据异常」chip(仍展示)
```

### 2.1 新增 `frontend/src/lib/anomaly.ts`

```ts
import type { Project } from '@/types/analysis'

/** 数据异常项目：主域 projects[] 中服务组 L4(orgL4) 为空。
 * 成因：项目中心∩组织架构通过，但项目基础信息无 L4。回款看板恒排除，项目清单仍展示+标记。 */
export function isAnomalous(p: Pick<Project, 'orgL4'>): boolean {
  return !((p.orgL4 ?? '').trim())
}

export interface AnomalyRow { projectId: string; projectName: string; reason: string }

/** 治理页告警明细行。 */
export function anomalyRows(projects: Pick<Project, 'projectId' | 'projectName' | 'orgL4'>[]): AnomalyRow[] {
  return projects.filter(isAnomalous).map((p) => ({
    projectId: p.projectId,
    projectName: p.projectName || p.projectId,
    reason: '服务组 L4 缺失（项目基础信息无数据）',
  }))
}
```

### 2.2 回款看板硬排除（`frontend/src/lib/paymentPmis.ts`）

两处回款域入口恒去除异常项目，**独立于"纳管排除"开关**（不受 `excludeActive` 影响）：

- `filterProjects(projects, opts)`：filter 回调首行加 `if (isAnomalous(p)) return false`（在 excludeActive 判定之前，无条件）。覆盖：`payDashSummary.totalProjects`（/payment 项目数）、BoardView/PlanTab/ProjectsOverviewTab/RiskTab/TierNodesTab（/panalysis 五页）。已核实 `filterProjects` 6 个消费方全为回款域，无非回款消费方。
- `paymentNodeRows(paymentNodes, projects, pmisMap)`：`const p = byId.get(pid); if (!p) continue` 之后加 `if (isAnomalous(p)) continue`。覆盖：/payment 节点链（filteredPayNodes → DashMetrics 金额/延期、TierStrip、OrgRanking、TrendCard）与节点页。异常项目当前 0 节点，此为稳健化（防未来异常项目带节点导致项目数与金额口径不一致）。

`/projects`(buildProjectRows) 与 `/closed`(buildClosedRows) 不调用这两个函数，自然保留展示——符合"清单正常展示不排除"。

### 2.3 治理页告警（`frontend/src/lib/governance.ts`）

`buildHealthReport` 在 `alerts.sort(...)` 之前 push 一个告警组（导入 `anomalyRows`，读 `data.projects ?? []`）：

```ts
const anomalies = anomalyRows(data.projects ?? [])
alerts.push({ key: 'l4Missing', label: '回款排除：服务组 L4 缺失', severity: 'mid', count: anomalies.length,
  columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }, { key: 'reason', label: '原因' }],
  rows: anomalies, exportName: '回款排除-L4缺失.xlsx' })
```

severity `mid`（黄，need-attention）；count=0 时按现有 sort 规则置灰沉底。`DataQualityView.vue` 无需改（按 AlertGroup 通用渲染，可展开看明细 + 导出）。

### 2.4 项目清单标记（`frontend/src/lib/projectList.ts` + `frontend/src/views/ProjectsView.vue`）

- `ProjectRow` 接口加 `isAnomalous: boolean`。
- `buildProjectRows` 每行加 `isAnomalous: isAnomalous(p)`（从 `@/lib/anomaly` 导入，DRY）。
- `ProjectsView.vue` 的 `#cell-projectName` 插槽内、`原项目*` chip 之后，加：
  `<span v-if="row.isAnomalous" class="pv-anomaly" title="服务组 L4 缺失，回款看板不统计">数据异常</span>`
- 新增样式 `.pv-anomaly`（仿 `.pv-origin`，用 warn 三态：`background: var(--warn-bg); color: var(--warn-text);`）。
- 不新增列、不动 ColumnPicker/默认可见集（chip 挂在恒可见的项目名列，零布局副作用）。

---

## 3. 测试（TDD）

| 文件 | 用例 |
|---|---|
| `frontend/src/lib/anomaly.test.ts`（新） | `isAnomalous`：orgL4 为 `''`/`'  '`/`undefined` → true；非空 → false。`anomalyRows`：含样例式 3 行（orgL4 空）→ 3 行带 projectId/projectName/reason；orgL4 非空不入列。 |
| `frontend/src/lib/paymentPmis.test.ts`（扩） | `filterProjects`：含一个 orgL4 空的项目 → 被排除（即使 excludeActive=false）。`paymentNodeRows`：orgL4 空项目即使有节点也不产出节点行。 |
| `frontend/src/lib/payDashboard.test.ts`（扩） | `payDashSummary.totalProjects` 排除 orgL4 空项目（经 filterProjects）。 |
| `frontend/src/lib/governance.test.ts`（扩） | `buildHealthReport`：projects 含 N 个 orgL4 空 → 存在 `l4Missing` 告警组、count=N、rows 含对应 projectId。 |
| `frontend/src/lib/projectList.test.ts`（扩） | `buildProjectRows`：orgL4 空行 `isAnomalous===true`，非空行 false。 |
| `frontend/src/views/ProjectsView.test.ts`（扩） | 含 orgL4 空项目时，项目名单元渲染「数据异常」chip；正常项目不渲染。 |

---

## 4. 验证

1. `bash verify.sh` 全绿（前端 typecheck/vitest/build + 后端 ruff/pytest 不受影响）。
2. 手动：/governance 出现「回款排除：服务组 L4 缺失」告警（含那 3 个样例，可导出）；/projects 这 3 个项目带「数据异常」chip 且仍在列；/payment 与 /panalysis 五页统计不含这 3 个（项目数较改前少 3；金额/延期等因其 0 节点本就不变，项目数口径变化是主要可观测点）。
3. `frontend/src/version.ts` → V1.10.1 / 2026-06-19。

---

## 5. 不在本轮（边界）

- 已关闭项目域的异常识别。
- 周期筛选改日期范围、口径统一（SP2）。
- /payment、/payment/board 布局与新页（SP3/SP5）、路由拆分（SP4）。
- 后端 `projects[].isAnomalous` 标记（本轮纯前端；若后续 SP 需要后端口径再议）。
