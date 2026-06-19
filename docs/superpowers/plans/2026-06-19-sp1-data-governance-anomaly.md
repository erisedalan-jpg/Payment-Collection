# SP1 数据治理：异常项目识别与回款排除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 识别 `orgL4` 为空的主域异常项目，在所有回款看板硬排除、治理页告警、项目清单标记，纯前端实现。

**Architecture:** 新增 `lib/anomaly.ts` 提供判定谓词；在回款域两个入口 `filterProjects`/`paymentNodeRows`(paymentPmis.ts) 恒去除异常项目；`governance.ts` 加告警组；`projectList.ts`+`ProjectsView.vue` 给清单挂「数据异常」chip。`/projects`·`/closed` 不走回款域入口，保留展示。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus；vitest。

**Spec:** `docs/superpowers/specs/2026-06-19-sp1-data-governance-anomaly-design.md`（取值与判定权威）。

## Global Constraints

- 全程简体中文；**禁用任何 emoji**，需要符号只用 `→ ↓ ❌ ✕ ▾`。
- **禁止 `git add -A` / `git add .`**；只逐路径 `git add`。
- 每次提交信息结尾恒为一行：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 判定：`isAnomalous(p) = !(p.orgL4 ?? '').trim()`。排除**独立于"纳管排除"开关**（不受 `excludeActive` 影响），始终生效。
- 纯前端：**不改** `preprocess_data.py`/`schema.py`/`data/*.json`，不重跑数据。
- 令牌：样式只引用 `theme.css` 令牌（如 `var(--warn-bg)`/`var(--warn-text)`/`var(--r-full)`/`var(--fs-1)`/`var(--sp-2)`），不手写散值。
- 版本单一来源 `frontend/src/version.ts`，本轮 `V1.10.1` / `2026-06-19`（Z 级）。
- 跑测试：`cd frontend && npx vitest run <文件>`；提交前 `npm run typecheck`；末任务跑 `bash verify.sh` 全绿。

---

### Task 1: anomaly.ts 判定核心

**Files:**
- Create: `frontend/src/lib/anomaly.ts`
- Test: `frontend/src/lib/anomaly.test.ts`

**Interfaces:**
- Produces: `isAnomalous(p: Pick<Project,'orgL4'>): boolean`、`anomalyRows(projects: Pick<Project,'projectId'|'projectName'|'orgL4'>[]): AnomalyRow[]`、`interface AnomalyRow { projectId: string; projectName: string; reason: string }`。后续 Task 2/3/4 导入。

- [ ] **Step 1: 写失败测试 `anomaly.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { isAnomalous, anomalyRows } from './anomaly'

describe('isAnomalous（orgL4 空判定）', () => {
  it('orgL4 为空串/纯空白/undefined 判异常', () => {
    expect(isAnomalous({ orgL4: '' })).toBe(true)
    expect(isAnomalous({ orgL4: '   ' })).toBe(true)
    expect(isAnomalous({ orgL4: undefined as unknown as string })).toBe(true)
  })
  it('orgL4 非空不判异常', () => {
    expect(isAnomalous({ orgL4: '交付一组' })).toBe(false)
  })
})

describe('anomalyRows（治理明细行）', () => {
  it('仅列 orgL4 空项目，带 projectId/projectName/reason', () => {
    const ps = [
      { projectId: 'WSGF-SS-202604169018', projectName: '甲', orgL4: '' },
      { projectId: 'P2', projectName: '乙', orgL4: '交付一组' },
      { projectId: 'P3', projectName: '', orgL4: '  ' },
    ]
    const rows = anomalyRows(ps)
    expect(rows.map((r) => r.projectId)).toEqual(['WSGF-SS-202604169018', 'P3'])
    expect(rows[0].reason).toContain('L4')
    expect(rows[1].projectName).toBe('P3') // projectName 空回退 projectId
  })
})
```

- [ ] **Step 2: 跑测试确认变红**

Run: `cd frontend && npx vitest run src/lib/anomaly.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `anomaly.ts`**

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

- [ ] **Step 4: 跑测试确认变绿 + typecheck**

Run: `cd frontend && npx vitest run src/lib/anomaly.test.ts && npm run typecheck`
Expected: PASS，无类型错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/anomaly.ts frontend/src/lib/anomaly.test.ts
git commit -m "feat(governance): anomaly.ts 异常项目判定(orgL4 空)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 回款看板硬排除

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts`（`filterProjects` line 63-70、`paymentNodeRows` line 183-221）
- Test: `frontend/src/lib/paymentPmis.test.ts`（扩）、`frontend/src/lib/payDashboard.test.ts`（扩）

**Interfaces:**
- Consumes: Task 1 的 `isAnomalous`。
- Produces: `filterProjects`/`paymentNodeRows` 恒排除 orgL4 空项目（签名不变）。

- [ ] **Step 1: 扩 `paymentPmis.test.ts`（先红）**

在 `filterProjects` 的 describe 内、沿用其既有 `ps`/`base` fixture 风格，新增（fixture 里加一个 `orgL4: ''` 的项目，如 `{ projectId: 'X', projectName: '空L4', orgL4: '' }`）：

```ts
  it('orgL4 空项目恒排除（独立于 excludeActive）', () => {
    const withEmpty = [...ps, { projectId: 'X', projectName: '空', orgL4: '' } as any]
    expect(filterProjects(withEmpty, base).map((p) => p.projectId)).not.toContain('X')
    expect(filterProjects(withEmpty, { ...base, excludeActive: false }).map((p) => p.projectId)).not.toContain('X')
  })
```

在 `paymentNodeRows` 相关 describe（若无则新增一个 describe），构造一个 orgL4 空且带 1 个节点的项目，断言其不产出节点行：

```ts
  it('paymentNodeRows 跳过 orgL4 空项目', () => {
    const projects = [{ projectId: 'X', projectName: '空', orgL4: '' } as any]
    const nodes = { X: [{ stage: '阶段1', planDate: '2026-01-01', expectedPayment: 100, receivedAmount: 0, unpaidAmount: 100, status: '待回款' } as any] }
    expect(paymentNodeRows(nodes, projects).length).toBe(0)
  })
```

（若 `paymentNodeRows` 未在该测试文件 import，于顶部 import 行补入。）

- [ ] **Step 2: 扩 `payDashboard.test.ts`（先红）**

沿用其既有 fixture，断言 `payDashSummary` 的 `totalProjects` 排除 orgL4 空项目：

```ts
  it('totalProjects 排除 orgL4 空项目', () => {
    const projects = [
      { projectId: 'A', projectName: 'a', orgL4: '组1' } as any,
      { projectId: 'X', projectName: 'x', orgL4: '' } as any,
    ]
    const opts = { viewMode: 'global', viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} } as any
    expect(payDashSummary([], projects, opts).totalProjects).toBe(1)
  })
```

- [ ] **Step 3: 跑两测试确认变红**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts src/lib/payDashboard.test.ts`
Expected: 新增用例 FAIL（当前未排除）。

- [ ] **Step 4: 改 `paymentPmis.ts` 加排除**

文件顶部 import 加：`import { isAnomalous } from './anomaly'`

`filterProjects`（line 63-70）filter 回调首行无条件加排除：
```ts
export function filterProjects(projects: Project[], opts: FilterOpts): Project[] {
  return projects.filter((p) => {
    if (isAnomalous(p)) return false
    if (opts.excludeActive && opts.excludedIds && opts.excludedIds[p.projectId]) return false
    if (opts.viewMode === 'l4' && opts.viewL4) return (p.orgL4 ?? '') === opts.viewL4
    if (opts.viewMode === 'pm' && opts.viewPM) return (p.projectManager ?? '') === opts.viewPM
    return true
  })
}
```

`paymentNodeRows`（line 191-193 循环内）`const p = byId.get(pid); if (!p) continue` 之后加一行：
```ts
    const p = byId.get(pid)
    if (!p) continue
    if (isAnomalous(p)) continue
```

- [ ] **Step 5: 跑两测试确认变绿 + typecheck**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts src/lib/payDashboard.test.ts && npm run typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentPmis.test.ts frontend/src/lib/payDashboard.test.ts
git commit -m "feat(governance): 回款看板硬排除 orgL4 空项目(filterProjects/paymentNodeRows)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 治理页告警组

**Files:**
- Modify: `frontend/src/lib/governance.ts`
- Test: `frontend/src/lib/governance.test.ts`（扩）

**Interfaces:**
- Consumes: Task 1 的 `anomalyRows`。

- [ ] **Step 1: 扩 `governance.test.ts`（先红）**

沿用其既有 `buildHealthReport` fixture（构造 `data.projects` 含 N 个 orgL4 空项目）：

```ts
  it('orgL4 空项目进 l4Missing 告警组', () => {
    const data = { projects: [
      { projectId: 'WSGF-SS-202604169018', projectName: '甲', orgL4: '' },
      { projectId: 'P2', projectName: '乙', orgL4: '交付一组' },
    ] } as any
    const r = buildHealthReport(data)
    const g = r.alerts.find((a) => a.key === 'l4Missing')
    expect(g).toBeTruthy()
    expect(g!.count).toBe(1)
    expect((g!.rows[0] as any).projectId).toBe('WSGF-SS-202604169018')
  })
```

- [ ] **Step 2: 跑测试确认变红**

Run: `cd frontend && npx vitest run src/lib/governance.test.ts`
Expected: FAIL（无 l4Missing 组）。

- [ ] **Step 3: 改 `governance.ts` 加告警组**

顶部 import 加：`import { anomalyRows } from './anomaly'`

在 `alerts.sort(` 那一行**之前**插入：
```ts
  const anomalies = anomalyRows(data.projects ?? [])
  alerts.push({ key: 'l4Missing', label: '回款排除：服务组 L4 缺失', severity: 'mid', count: anomalies.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }, { key: 'reason', label: '原因' }],
    rows: anomalies, exportName: '回款排除-L4缺失.xlsx' })
```

- [ ] **Step 4: 跑测试确认变绿 + typecheck**

Run: `cd frontend && npx vitest run src/lib/governance.test.ts && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/governance.ts frontend/src/lib/governance.test.ts
git commit -m "feat(governance): 治理页新增 服务组 L4 缺失 告警组

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 项目清单「数据异常」标记

**Files:**
- Modify: `frontend/src/lib/projectList.ts`（`ProjectRow` 接口 + `buildProjectRows`）
- Modify: `frontend/src/views/ProjectsView.vue`（`#cell-projectName` 插槽 + 样式）
- Test: `frontend/src/lib/projectList.test.ts`（扩）、`frontend/src/views/ProjectsView.test.ts`（扩）

**Interfaces:**
- Consumes: Task 1 的 `isAnomalous`。

- [ ] **Step 1: 扩 `projectList.test.ts`（先红）**

沿用既有 `buildProjectRows` fixture，断言 isAnomalous 字段：

```ts
  it('orgL4 空行标 isAnomalous=true', () => {
    const rows = buildProjectRows([
      { projectId: 'A', projectName: 'a', orgL4: '组1' } as any,
      { projectId: 'X', projectName: 'x', orgL4: '' } as any,
    ], {})
    expect(rows.find((r) => r.projectId === 'A')!.isAnomalous).toBe(false)
    expect(rows.find((r) => r.projectId === 'X')!.isAnomalous).toBe(true)
  })
```

- [ ] **Step 2: 跑测试确认变红**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts`
Expected: FAIL（无 isAnomalous）。

- [ ] **Step 3: 改 `projectList.ts`**

顶部 import 加：`import { isAnomalous } from './anomaly'`

`ProjectRow` 接口加字段（在 `tags?: string[]` 之后）：`isAnomalous: boolean`

`buildProjectRows` 返回对象加字段（在 `tags: ...` 之后）：`isAnomalous: isAnomalous(p),`

- [ ] **Step 4: 跑 projectList 测试确认变绿**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts`
Expected: PASS。

- [ ] **Step 5: 扩 `ProjectsView.test.ts`（先红）**

沿用本文件 `mountView()`/`useDataStore` 既有方式，新增自含用例（注入一正常一异常项目，断言仅异常行渲染 chip）：

```ts
  it('orgL4 空项目渲染「数据异常」标记，正常项目不渲染', async () => {
    const ds = useDataStore()
    ds.data = {
      meta: {}, dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
      projects: [
        { projectId: 'NORMAL', projectName: '正常项目', projectManager: '甲', orgL4: 'A组', isPresale: false, relatedClosedId: '',
          payment: { relatedNodeCount: 1, expectedTotal: 100, actualTotal: 50, remainingTotal: 50, paymentRatio: 0.5, delayedCount: 0 }, health: { overall: '健康' } },
        { projectId: 'WSGF-SS-202604169018', projectName: '异常项目', projectManager: '乙', orgL4: '', isPresale: false, relatedClosedId: '',
          payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }, health: { overall: '关注' } },
      ],
      projectPmis: {},
    } as any
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('数据异常')
    expect(w.findAll('.pv-anomaly').length).toBe(1)
  })
```

- [ ] **Step 6: 跑测试确认变红**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts`
Expected: FAIL（尚未渲染 chip）。

- [ ] **Step 7: 改 `ProjectsView.vue`**

`#cell-projectName` 插槽（line 167-169）改为在 `原项目*` chip 之后追加异常 chip：
```html
        <template #cell-projectName="{ row }">
          {{ row.projectName }}<span v-if="row.hasClosed" class="pv-origin">原项目*</span><span v-if="row.isAnomalous" class="pv-anomaly" title="服务组 L4 缺失，回款看板不统计">数据异常</span>
        </template>
```

`<style scoped>` 内、`.pv-origin` 规则之后加：
```css
.pv-anomaly { margin-left: var(--sp-2); padding: 0 var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); background: var(--warn-bg); color: var(--warn-text); }
```

- [ ] **Step 8: 跑 ProjectsView 测试确认变绿 + typecheck**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts && npm run typecheck`
Expected: PASS。

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/projectList.ts frontend/src/lib/projectList.test.ts frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts
git commit -m "feat(governance): 项目清单异常项目挂「数据异常」标记

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 版本 V1.10.1 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改 `version.ts`**

```ts
export const APP_VERSION = 'V1.10.1'
export const RELEASE_DATE = '2026-06-19'
```

- [ ] **Step 2: PROGRESS.md 加记录**

头部「当前版本」改 `V1.10.1`、「最近更新」补一句；版本区新增一条（合并 SHA 留 `<finishing 回填>` 占位，勿自填）：
```
- V1.10.1 SP1 数据治理：识别 orgL4 空异常项目，回款看板(/payment + /panalysis 五页)硬排除、治理页新增告警、项目清单挂「数据异常」标记。合并 SHA: <finishing 回填>
```
（V1.10.0 条降为「上一版本」，原「上一版本 V1.9.0」降为「上上版本」，原 V1.8.0 推出显示区——沿用本文件既有两档历史摘要惯例。）

- [ ] **Step 3: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（前端 typecheck/vitest/build + 后端 ruff/pytest）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: 版本 V1.10.1 + PROGRESS(SP1 数据治理异常排除)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 验证总览（finishing 前）

- `bash verify.sh` 全绿。
- 手动：/governance 出现「回款排除：服务组 L4 缺失」告警（含 3 样例、可导出）；/projects 该 3 项带「数据异常」chip 且仍在列、可正常点进详情；/payment 与 /panalysis 五页项目数较改前少 3（金额/延期因其 0 节点本就不变）。
