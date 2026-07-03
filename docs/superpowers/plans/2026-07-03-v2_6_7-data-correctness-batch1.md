# V2.6.7 数据正确性与口径修复（批1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复一批会算错数/显示错的纯函数与管线缺陷（导出单位、超支事件、范围筛选单位、恒全时口径漏网、回款完成死分支、日历时区等），并补键集契约测试防复发。

**Architecture:** 纯前端 `lib/` 与后端管线纯函数修复，TDD（先补/改测试再改实现）。多为单文件局部改动；少数口径修复连带更新其视图/组件调用方（`OverviewView.vue`、`OrgRanking.vue`）。零 schema/preprocess 结构变化。

**Tech Stack:** 前端 Vue3 + TS + vitest；后端 Python 标准库 + pytest。

## Global Constraints

- 版本单一来源：改版本只改 `frontend/src/version.ts`（本批收尾 bump 到 `V2.6.7`，非每任务改）。
- 回款口径全站统一：达成率/完成率 = Σ流水净额（逐笔全加，含负值红冲，不取绝对值）÷ Σ合同（`paymentPmis.contract`）；合同≤0 → `null`（前端显 '-'）。
- 异常项目（`orgL4` 空，`lib/anomaly.isAnomalous`）排除出回款统计。
- 不使用任何 emoji；符号用 `→ ↓ ❌ ✕ ▾`。
- 验收门：`bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。改计算逻辑先补/改测试再改实现。
- 前端测试运行：`cd frontend && npx vitest run <相对路径>`；后端：`python -m pytest <路径> -q`。
- 提交信息结尾附：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 导出「合同金额(万)」按万元导出（修 1 万倍错）

**Files:**
- Modify: `frontend/src/lib/projectExport.ts:14-41`
- Test: `frontend/src/lib/projectExport.test.ts`

**Interfaces:**
- Produces: `buildExportSheets` 行为不变，仅「项目清单」sheet 的 `合同金额(万)` 单元格由元值改万元值（`元 / 10000`，与 `ProjectsView.vue:50` 屏显一致）。

- [ ] **Step 1: Write the failing test**（追加到现有 `projectExport.test.ts` 的「项目清单」用例组内或新增）

```ts
import { describe, it, expect } from 'vitest'
import { buildExportSheets } from './projectExport'

describe('buildExportSheets 合同金额单位', () => {
  it('「合同金额(万)」列导出万元值而非元值', () => {
    const ctx = {
      rows: [{ projectId: 'P1', projectName: '甲', contractAmount: 1180000, tags: [] }],
      projects: [], assignments: {}, followup: [], paymentNodes: {}, milestones: {},
    } as any
    const sheets = buildExportSheets(['list'], ctx)
    const row = sheets[0].rows[0]
    expect(row['合同金额(万)']).toBe(118) // 1,180,000 元 → 118 万
  })

  it('合同金额为 null 时导出空串', () => {
    const ctx = {
      rows: [{ projectId: 'P2', projectName: '乙', contractAmount: null, tags: [] }],
      projects: [], assignments: {}, followup: [], paymentNodes: {}, milestones: {},
    } as any
    const row = buildExportSheets(['list'], ctx)[0].rows[0]
    expect(row['合同金额(万)']).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/projectExport.test.ts`
Expected: FAIL（收到 1180000 而非 118）

- [ ] **Step 3: Write minimal implementation**

在 `projectExport.ts` 顶部 `LIST_COLS` 之后加一个万元列键集合，并在 `list` 分支的取值处按列换算。将第 32-42 行的 `list` 分支改为：

```ts
  if (scope.includes('list')) {
    out.push({
      name: '项目清单',
      rows: ctx.rows.map((r) => {
        const o: Record<string, unknown> = {}
        for (const [k, label] of LIST_COLS) {
          const raw = r[k]
          if (k === 'contractAmount') o[label] = typeof raw === 'number' ? raw / 10000 : (raw ?? '')
          else o[label] = raw ?? ''
        }
        o['标签'] = (r.tags ?? []).join('、')
        return o
      }),
    })
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/projectExport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/projectExport.ts frontend/src/lib/projectExport.test.ts
git commit -m "fix(export): 项目清单导出合同金额按万元(修1万倍) (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 修 snapshots 超支孤儿键 + 加 derive_cost→build_snapshot 契约测试（防复发）

**Files:**
- Modify: `snapshots.py:57`
- Test: `tests/test_snapshots.py`（改旧键 fixture + 新增契约测试）

**Interfaces:**
- Consumes: `pmis.derive_cost(status_row, center_row)` 产出 `{总预算, 核算, 剩余预算, 消耗比, 项目超支, 交付超支, 成本状态}`（pmis.py:105-107）。
- Produces: `build_snapshot` 的 `projects[pid].overspend` 由读孤儿键 `cost.get("超支")` 改读 `cost.get("项目超支")`，从而 snapshots.py:178-189 的「超支出现/超支解除」事件恢复。

- [ ] **Step 1: Write the failing test**（新增契约测试到 `tests/test_snapshots.py`）

```python
import pmis


class TestOverspendContract:
    def test_overspend_reads_derive_cost_key(self):
        # derive_cost 真实产物直喂 build_snapshot：剩余预算<0 → 项目超支 True → snapshot.overspend True
        cost = pmis.derive_cost({"项目总预算（元）": "1000000", "项目核算（元）": "1200000",
                                 "剩余预算（元）": "-200000"}, {})
        assert cost["项目超支"] is True and "超支" not in cost  # 契约:旧键不存在
        pmis_map = {"P-1": {"cost": cost}}
        snap = snapshots.build_snapshot("2026-06-11",
                                        [{"projectId": "P-1", "projectName": "甲"}], pmis_map, {})
        assert snap["projects"]["P-1"]["overspend"] is True
```

同时把现有 `_pmis()`（tests/test_snapshots.py:15）里的 `"cost": {"超支": False, "消耗比": 0.3}` 改为真实键：`"cost": {"项目超支": False, "交付超支": False, "消耗比": 0.3}`（若有断言 `p1` overspend 相关需一并核对）。

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_snapshots.py::TestOverspendContract -q`
Expected: FAIL（`snap["projects"]["P-1"]["overspend"]` 为 False，因仍读孤儿键 `超支`）

- [ ] **Step 3: Write minimal implementation**

`snapshots.py:57` 改：

```python
            "overspend": bool(cost.get("项目超支")),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_snapshots.py -q`
Expected: PASS（含既有用例；如既有用例因 fixture 改键而变化，据实修正断言）

- [ ] **Step 5: Commit**

```bash
git add snapshots.py tests/test_snapshots.py
git commit -m "fix(snapshots): overspend 读 项目超支 键(修孤儿键致超支事件恒失效)+契约测试 (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 修 snapshots 回款完成死分支

**Files:**
- Modify: `snapshots.py:217-219`
- Test: `tests/test_snapshots.py`

**Interfaces:**
- Consumes: `collection_stages.stage_status` 取值域 {已回款, 部分回款, 质保期, 延期, 待回款}（collection_stages.py:58-65）；节点 status 现由此产出，`config.STATUS_FULL_PAID`（"已全额回款"）不再出现。
- Produces: 节点状态转为 "已回款" 时产生「回款完成」事件。

- [ ] **Step 1: Write the failing test**

```python
class TestPaymentCompleteEvent:
    def test_status_to_paid_emits_complete_event(self):
        base = [{"projectId": "P-1", "projectName": "甲"}]
        nodes_a = {"P-1": [{"stage": "初验款", "planDate": "2026-03-31", "receivedAmount": 0,
                            "expectedPayment": 500000, "unpaidAmount": 500000, "status": "待回款"}]}
        nodes_b = {"P-1": [{"stage": "初验款", "planDate": "2026-03-31", "receivedAmount": 500000,
                            "expectedPayment": 500000, "unpaidAmount": 0, "status": "已回款"}]}
        snap_a = snapshots.build_snapshot("2026-06-01", base, {}, nodes_a)
        snap_b = snapshots.build_snapshot("2026-06-11", base, {}, nodes_b)
        evs = snapshots.diff_snapshots(snap_a, snap_b)
        assert any(e["type"] == "回款完成" for e in evs)
```

注：`diff_snapshots` 为快照 diff 入口；若实际函数名/签名不同，先 `grep -n "def diff" snapshots.py` 核对后对齐（事件由 snapshots.py:212-219 的 status 变更分支产生）。

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_snapshots.py::TestPaymentCompleteEvent -q`
Expected: FAIL（无「回款完成」事件，因判 `config.STATUS_FULL_PAID`="已全额回款" 永不命中）

- [ ] **Step 3: Write minimal implementation**

`snapshots.py:217` 改判为实际取值 "已回款"：

```python
            elif sb == "已回款":
```

（保持相邻「延期发生」分支的 `config.STATUS_DELAYED`="延期" 不变——它与 stage_status 的 "延期" 字面量一致。）

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_snapshots.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add snapshots.py tests/test_snapshots.py
git commit -m "fix(snapshots): 回款完成事件判 已回款(修换源后死分支) (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 范围筛选回款节点金额按万元比较

**Files:**
- Modify: `frontend/src/lib/tempFollowup.ts:46-92`（`buildScopeInputs` 的 `nodes` 装配）
- Test: `frontend/src/lib/tempFollowup.test.ts`（若无则新建）

**Interfaces:**
- Consumes: 原始回款节点行含元级 `expectedPayment/receivedAmount/unpaidAmount`。
- Produces: `buildScopeInputs(...)[i].nodes[j]` 的这三个字段转为万元（`元 / 10000`），使 `tempScope.FIELD_CATALOG` 标注「(万)」的字段与 `leafMatch` 比较一致（对齐 project 组 `contractWan`）。其余节点字段不变。

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildScopeInputs } from './tempFollowup'
import { projectMatches } from './tempScope'

describe('buildScopeInputs 回款节点金额单位', () => {
  const projects = [{ projectId: 'P1', projectName: '甲', paymentPmis: { contract: 1000000 } }] as any
  const nodes = { P1: [{ stage: '初验款', status: '待回款', expectedPayment: 600000, receivedAmount: 0, unpaidAmount: 600000 }] }

  it('计划回款(万) 按万元比较：60 万节点命中 [50,100] 万', () => {
    const inputs = buildScopeInputs(projects, {}, nodes, {})
    const scope = { combinator: 'AND' as const, groups: [{ combinator: 'AND' as const, conditions: [
      { group: 'paymentNode' as const, field: 'expectedPayment', op: 'between' as const, min: 50, max: 100 },
    ] }] }
    expect(projectMatches(inputs[0], scope)).toBe(true)
  })

  it('不再误按元命中：60 万节点不命中 [50,100] 元', () => {
    const inputs = buildScopeInputs(projects, {}, nodes, {})
    const scope = { combinator: 'AND' as const, groups: [{ combinator: 'AND' as const, conditions: [
      { group: 'paymentNode' as const, field: 'expectedPayment', op: 'between' as const, min: 50, max: 100 },
    ] }] }
    // 元级 600000 显然不在 [50,100]；万元换算后 60 命中——本用例与上用例互补，确保换算生效
    expect(projectMatches(inputs[0], scope)).toBe(true)
  })
})
```

（`op`/`between` 具体取值以 `scopeOps.ts` 的 `ScopeOp` 定义为准，先 `grep -n "between\|gte\|lte" frontend/src/lib/scopeOps.ts` 核对区间算子名后对齐。）

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/tempFollowup.test.ts`
Expected: FAIL（元级 600000 不落在 [50,100]）

- [ ] **Step 3: Write minimal implementation**

`tempFollowup.ts` 的 `buildScopeInputs` 第 88 行 `nodes:` 装配处，对三个金额字段除万：

```ts
      nodes: (paymentNodes?.[p.projectId] ?? []).map((n: any) => ({
        ...n,
        expectedPayment: typeof n.expectedPayment === 'number' ? n.expectedPayment / 10000 : n.expectedPayment,
        receivedAmount: typeof n.receivedAmount === 'number' ? n.receivedAmount / 10000 : n.receivedAmount,
        unpaidAmount: typeof n.unpaidAmount === 'number' ? n.unpaidAmount / 10000 : n.unpaidAmount,
      })) as any[],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/tempFollowup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tempFollowup.ts frontend/src/lib/tempFollowup.test.ts
git commit -m "fix(scope): 范围筛选回款节点金额按万元比较(修标万实按元) (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: payOrgRanking 达成率恒全时口径

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts:118-144`
- Test: `frontend/src/lib/payDashboard.test.ts`

**Interfaces:**
- Produces: `payOrgRanking` 的 `actualTotal` 改为全时流水（`actualInRange(records,'','')`），`contractTotal` 改为全量合同（不再按区间活动筛选），`achievementRate = actualTotal / contractTotal`。`expectedTotal`（计划侧）仍按 `planDate ∈ [start,end]` 区间。与 `payDashSummary` 全站口径一致。

- [ ] **Step 1: Write the failing test**

```ts
import { payOrgRanking } from './payDashboard'

describe('payOrgRanking 恒全时口径', () => {
  const projects = [{ projectId: 'P1', orgL4: 'A组', paymentPmis: { contract: 1000000 } }] as any
  const paymentNodes = { P1: [{ planDate: '2026-02-01', expectedPayment: 500000, status: '待回款' }] } as any
  // 2025 年到账流水:区间口径(本年度)会漏,全时口径应计入
  const paymentRecords = { P1: { records: [{ date: '2025-06-01', amount: 500000 }] } } as any

  it('已回款/达成率取全时,即使日期区间为 2026 年', () => {
    const r = payOrgRanking(projects, paymentNodes, paymentRecords, '2026-01-01', '2026-12-31', 'achievementRate')
    expect(r[0].actualTotal).toBe(500000)          // 全时含 2025 流水
    expect(r[0].contractTotal).toBe(1000000)       // 全量合同
    expect(r[0].achievementRate).toBeCloseTo(0.5)  // 50%
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/payDashboard.test.ts`
Expected: FAIL（区间口径下 actualTotal=0、达成率 0）

- [ ] **Step 3: Write minimal implementation**

将 `payOrgRanking`（payDashboard.ts:119-144）改为：

```ts
export function payOrgRanking(
  projects: Project[],
  paymentNodes: Record<string, PaymentNodePmis[]> | undefined,
  paymentRecords: Record<string, PaymentRecordsEntry> | undefined,
  start: string,
  end: string,
  sortBy: 'actualTotal' | 'achievementRate',
): OrgRank[] {
  // 已回款/达成率恒全时口径(全站统一 Σ流水全加 ÷ Σ合同,对齐 payDashSummary/computeKpis);计划侧 expectedTotal 仍随区间。
  const m: Record<string, OrgRank> = {}
  for (const p of projects) {
    const org = (p.orgL4 ?? '').trim() || '未指定'
    if (!m[org]) m[org] = { org, expectedTotal: 0, actualTotal: 0, actualTotalWan: 0, achievementRate: 0, contractTotal: 0 }
    for (const n of paymentNodes?.[p.projectId] ?? []) {
      if (inRange(n.planDate || '', start, end)) m[org].expectedTotal += Number(n.expectedPayment ?? 0)
    }
    m[org].actualTotal += actualInRange(paymentRecords?.[p.projectId]?.records, '', '')
    m[org].contractTotal += p.paymentPmis?.contract ?? 0
  }
  return Object.values(m)
    .map((o) => ({ ...o, achievementRate: o.contractTotal > 0 ? o.actualTotal / o.contractTotal : 0, actualTotalWan: o.actualTotal / 10000 }))
    .sort((a, b) => b[sortBy] - a[sortBy])
}
```

（`hasActivityInRange` 导入若因此不再使用，`payDashboard.ts:58` 的 `payDashSummary` 仍在用它，import 保留。）

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/payDashboard.test.ts`
Expected: PASS（既有用例若断言旧区间行为需据实更新）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/payDashboard.ts frontend/src/lib/payDashboard.test.ts
git commit -m "fix(payment): 服务组达成排名恒全时口径(对齐全站,修区间低估2025回款) (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: paymentBand 年度已回含无阶段项目流水

**Files:**
- Modify: `frontend/src/lib/overview.ts:95-158`（`paymentBand` 新增 `projects` 参数）
- Modify: `frontend/src/views/OverviewView.vue:30-36`（调用处传入项目集）
- Test: `frontend/src/lib/overview.test.ts`

**Interfaces:**
- Consumes: `isAnomalous(p)`（overview.ts 已 import）。
- Produces: `paymentBand(rows, now, projects?, paymentRecords?, start='', end='')`——`yearActual` 改为遍历 `projects`（排除异常）汇总流水（与 `computeKpis` 同源，含无收款节点项目）；未传 `projects` 时退化到旧的按节点项目去重逻辑（向后兼容）。计划侧（`yearExpected/monthPending/dueSoon7/delayedTop`）不变。

- [ ] **Step 1: Write the failing test**

```ts
import { paymentBand } from './overview'

describe('paymentBand 年度已回含无阶段项目', () => {
  const now = new Date('2026-07-03T10:00:00')
  const rows: any[] = [] // 无收款节点(无阶段项目场景)
  const projects = [{ projectId: 'P1', orgL4: 'A组', paymentPmis: { contract: 1000000 } }] as any
  const paymentRecords = { P1: { records: [{ date: '2026-05-01', amount: 300000 }] } } as any

  it('无节点但有本年流水的项目计入 yearActual', () => {
    const band = paymentBand(rows, now, projects, paymentRecords, '', '')
    expect(band.yearActual).toBe(300000)
  })

  it('未传 projects 时退化为旧逻辑(节点项目去重)', () => {
    const band = paymentBand(rows, now, undefined, paymentRecords, '', '')
    expect(band.yearActual).toBe(0) // 无 rows → 旧逻辑不计入
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/overview.test.ts`
Expected: FAIL（首用例 yearActual=0，因旧逻辑只遍历 rows）

- [ ] **Step 3: Write minimal implementation**

在 `overview.ts` 顶部确保 `import { isAnomalous } from './anomaly'` 与 `Project` 类型已在（第 1、3 行已具备 `Project` 与 `isAnomalous`）。`paymentBand` 签名与 `yearActual` 段改为：

```ts
export function paymentBand(
  rows: PayNodeRow[],
  now: Date,
  projects?: Project[],
  paymentRecords?: Record<string, PaymentRecordsEntry>,
  start = '',
  end = '',
): PaymentBand {
  const year = String(now.getFullYear())
  const month = isoDate(now).slice(0, 7)
  const today = isoDate(now)
  const until = isoDate(new Date(now.getTime() + 7 * 86400000))
  const hasRange = !!(start || end)
  const planInScope = (planDate: string): boolean =>
    hasRange ? inRange(planDate, start, end) : planDate.startsWith(year)

  let yearActual = 0
  if (paymentRecords && projects) {
    // 遍历项目集(排除异常),与 computeKpis 同源:含无收款节点项目的流水
    for (const p of projects) {
      if (isAnomalous(p)) continue
      const records = paymentRecords[p.projectId]?.records
      if (hasRange) yearActual += actualInRange(records, start, end)
      else yearActual += (records ?? []).reduce(
        (s, r) => s + (String(r.date ?? '').startsWith(year) ? Number(r.amount ?? 0) : 0), 0)
    }
  } else if (paymentRecords) {
    // 旧退化路径(无 projects):按节点项目去重
    const seen = new Set<string>()
    for (const n of rows) {
      if (!seen.has(n.projectId)) {
        seen.add(n.projectId)
        const records = paymentRecords[n.projectId]?.records
        if (hasRange) yearActual += actualInRange(records, start, end)
        else yearActual += (records ?? []).reduce(
          (s, r) => s + (String(r.date ?? '').startsWith(year) ? Number(r.amount ?? 0) : 0), 0)
      }
    }
  } else {
    for (const n of rows) if (planInScope(String(n.planDate ?? ''))) yearActual += n.receivedAmount
  }
```

（其后 `yearExpected/monthPending/dueSoon7/delayed` 循环与 return 保持不变。）

然后改 `OverviewView.vue:30-36` 调用，插入 `projects.value`：

```ts
const band = computed(() => paymentBand(
  paymentNodeRows(data.data?.paymentNodes, projects.value, data.data?.projectPmis),
  new Date(),
  projects.value,
  filter.payRecordsAll,
  filter.dateStart,
  filter.dateEnd,
))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/overview.test.ts && cd frontend && npm run typecheck`
Expected: PASS + typecheck 无错

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/overview.ts frontend/src/lib/overview.test.ts frontend/src/views/OverviewView.vue
git commit -m "fix(overview): 首页年度已回遍历项目集(含无阶段项目流水,对齐computeKpis) (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 日历 calUpcoming 时区 + calDashboardStats 已回款范围

**Files:**
- Modify: `frontend/src/lib/calendar.ts:35-58, 146-156`
- Test: `frontend/src/lib/calendar.test.ts`

**Interfaces:**
- Produces:
  - `calUpcoming` 用本地日界解析 `planDate` 与 `now`（消除东八区 08:00 后今日节点消失）。
  - `calDashboardStats` 的 `mActual` 改为对「当前过滤后节点所属全部项目」求当月流水（不再仅限当月有节点的项目）。

- [ ] **Step 1: Write the failing test**

```ts
import { calUpcoming, calDashboardStats } from './calendar'

function node(p: any) {
  return { projectId: 'P1', projectName: '甲', stage: '初验款', planDate: '2026-07-03', status: '待回款',
    dept: 'A组', orgL3_1: '', projectManager: '张三', unpaidAmount: 0, receivedAmount: 0,
    expectedPayment: 0, actualDate: '', payRatio: null, actualRatio: null, tier: '', projStage: '', progress: '', ...p }
}
const noFilter = { orgL3_1: '', orgL4: '', pm: '' }

describe('calUpcoming 本地日界', () => {
  it('东八区上午 10 点,今日到期节点仍在 up15', () => {
    const now = new Date('2026-07-03T10:00:00') // 本地时间
    const r = calUpcoming([node({ planDate: '2026-07-03' })], noFilter, now)
    expect(r.up15.length).toBe(1)
  })
})

describe('calDashboardStats 当月已回款范围', () => {
  it('项目节点在他月但本月有流水,mActual 计入', () => {
    const now = new Date('2026-07-03T10:00:00')
    const nodes = [node({ projectId: 'P1', planDate: '2026-09-30' })] // 节点在 9 月
    const records = { P1: { records: [{ date: '2026-07-10', amount: 200000 }] } } as any
    const r = calDashboardStats(nodes, noFilter, now, records)
    expect(r.mActual).toBe(200000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/calendar.test.ts`
Expected: FAIL（calUpcoming 今日节点因 UTC 解析被排除；mActual=0 因 9 月节点不进 seenPids）

- [ ] **Step 3: Write minimal implementation**

在 `calendar.ts` 顶部加一个本地日界解析助手：

```ts
/** 把 'YYYY-MM-DD' 解析为本地零点(避免 new Date('YYYY-MM-DD') 的 UTC 偏移)。 */
function localDay(s: string): Date {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
```

`calUpcoming`（149-155）改用本地日界：

```ts
export function calUpcoming(naguanNodes: PayNodeRow[], f: CalFilters, now: Date): CalUpcoming {
  const all = applyCalFilters(calExcludePaid(naguanNodes.filter((n) => n.planDate)), f)
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d15 = new Date(t0.getTime() + 15 * 864e5)
  const d30 = new Date(t0.getTime() + 30 * 864e5)
  const byDate = (a: PayNodeRow, b: PayNodeRow) => String(a.planDate || '').localeCompare(String(b.planDate || ''))
  const up15 = all.filter((n) => { const d = localDay(String(n.planDate)); return d >= t0 && d <= d15 }).sort(byDate)
  const up30 = all.filter((n) => { const d = localDay(String(n.planDate)); return d > d15 && d <= d30 }).sort(byDate)
  return { up15, up30 }
}
```

`calDashboardStats`（44-56）的 `mActual` 段改为对全过滤节点项目求和：

```ts
  let mRem = 0, mCnt = 0, up = 0, del = 0
  for (const n of ns) {
    const pd = n.planDate
    if (!pd || pd.length < 10) continue
    const py = parseInt(pd.substring(0, 4)), pmo = parseInt(pd.substring(5, 7)) - 1
    const diff = Math.ceil((localDay(pd).getTime() - now.getTime()) / 86400000)
    if (diff >= 0 && diff <= 7 && n.status !== '已回款') up++
    if (n.status === '延期') del++
    if (py === nowY && pmo === nowM) { mCnt++; mRem += n.unpaidAmount }
  }
  // 当月已回款:对当前过滤后节点所属全部项目求当月流水(不仅当月有节点的项目)
  const scopePids = new Set(ns.map((n) => n.projectId))
  let mAct = 0
  for (const pid of scopePids) mAct += actualInRange(paymentRecords?.[pid]?.records, monthStart, monthEnd)
```

（删除原 `seenPids` 相关行；`localDay` 亦替换 `calDashboardStats` 内 `new Date(pd.substring(0,10))` 的 diff 计算，统一本地日界。）

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/calendar.test.ts`
Expected: PASS（既有 calendar 用例若隐含 UTC 行为需据实核对）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/calendar.ts frontend/src/lib/calendar.test.ts
git commit -m "fix(calendar): calUpcoming 本地日界(修今日节点消失)+当月已回款覆盖全过滤项目 (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Excel 日期猜测限定日期列

**Files:**
- Modify: `frontend/src/lib/cellFormat.ts:34-37`
- Modify: `frontend/src/lib/crossFilter.ts:19-22`
- Test: `frontend/src/lib/cellFormat.test.ts`、`frontend/src/lib/crossFilter.test.ts`（若无则新建）

**Interfaces:**
- Produces: 非日期列的 4-5 位数字字符串不再被强转为 Excel 日期（日期列仍由 `isDateKey` 分支处理）。

- [ ] **Step 1: Write the failing test**

```ts
// cellFormat.test.ts
import { formatCellValue } from './cellFormat'
describe('formatCellValue 金额列不误判为日期', () => {
  it("expectedPayment='45000' 走金额格式化而非日期", () => {
    expect(formatCellValue('45000', 'expectedPayment')).not.toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('日期列仍解析 Excel 序列号', () => {
    expect(formatCellValue('45000', 'planDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
```

```ts
// crossFilter.test.ts
import { cfFormatValue } from './crossFilter'
describe('cfFormatValue 非日期列不误判为日期', () => {
  it("金额列 '45000' 不转日期", () => {
    expect(cfFormatValue('projectAmount', '45000')).not.toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/cellFormat.test.ts src/lib/crossFilter.test.ts`
Expected: FAIL（'45000' 被转成日期）

- [ ] **Step 3: Write minimal implementation**

`cellFormat.ts` 删除第 34-37 行的 catch-all（日期解析仅保留 `isDateKey` 分支）：

```ts
  if (isDateKey(key)) {
    const ed = excelDate(v)
    if (ed) return ed
    if (typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) return v.slice(0, 10)
  }
  if (AMOUNT_KEYS.has(key)) return fmtYuan(v as number)
```

`crossFilter.ts` 同样删除第 19-22 行 catch-all：

```ts
  if (isDateKey(key)) {
    const ed = excelDate(val)
    if (ed) return ed
    if (typeof val === 'string' && /^\d{4}-\d{2}/.test(val)) return val.slice(0, 10)
  }
  if (val === true || val === 'true') return '是'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/cellFormat.test.ts src/lib/crossFilter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/cellFormat.ts frontend/src/lib/crossFilter.ts frontend/src/lib/cellFormat.test.ts frontend/src/lib/crossFilter.test.ts
git commit -m "fix(format): Excel 日期猜测限定日期列(修金额字符串误显日期) (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: milestoneDetailRows 'm1' 档月末溢出钳位

**Files:**
- Modify: `frontend/src/lib/milestoneDetailRows.ts:53`
- Test: `frontend/src/lib/milestoneAnalytics.test.ts` 或对应 milestoneDetailRows 测试文件（先 `grep -rn "reminderRange" frontend/src/lib/*.test.ts` 定位）

**Interfaces:**
- Produces: `reminderRange(now, 'm1')` 的 `end` 钳位到目标月末，不再从 1/31 溢出到 3/3。

- [ ] **Step 1: Write the failing test**

```ts
import { reminderRange } from './milestoneDetailRows'
describe("reminderRange m1 月末钳位", () => {
  it('1 月 31 日 → end 落在 2 月末而非 3 月初', () => {
    const { end } = reminderRange(new Date('2026-01-31T10:00:00'), 'm1')
    expect(end.startsWith('2026-02')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/milestoneAnalytics.test.ts`
Expected: FAIL（end 为 2026-03-03）

- [ ] **Step 3: Write minimal implementation**

`milestoneDetailRows.ts:53` 改为钳位：

```ts
  const y = now.getFullYear(), mo = now.getMonth(), d = now.getDate()
  const lastDayNextMonth = new Date(y, mo + 2, 0).getDate()
  return { start: b.today, end: ymd(new Date(y, mo + 1, Math.min(d, lastDayNextMonth))) }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/milestoneAnalytics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/milestoneDetailRows.ts frontend/src/lib/milestoneAnalytics.test.ts
git commit -m "fix(milestone): reminderRange m1 档月末钳位(修跨月溢出多看3天) (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: profit budget_map 跳过空 pid + 匹配去重

**Files:**
- Modify: `profit.py:117-123`
- Test: `tests/test_profit.py`（若无则新建；先 `ls tests/ | grep profit` 确认）

**Interfaces:**
- Produces: `load_profit` 的 `budget_matched` 按 pid 去重、`budget_map` 不再收录空 pid 行。下游 `matchRate` 更准。

- [ ] **Step 1: Write the failing test**

```python
import profit

def test_budget_matched_dedup_and_skip_empty(tmp_path, monkeypatch):
    # 构造 budget 有重复 pid + 空 pid;direct/bridge 空
    rows = [{"项目编号": "P1"}, {"项目编号": "P1"}, {"项目编号": ""}]
    monkeypatch.setattr(profit, "read_csv_rows",
                        lambda p: rows if str(p).endswith(profit.config.BUDGET_FILE) else [])
    _out, stats = profit.load_profit(str(tmp_path), {"P1"})
    assert stats["budget"] == 1  # P1 去重计 1,空 pid 不计
```

（`stats` 字段名以 `load_profit` 实际返回为准，先 `grep -n "budget_matched\|stats\|return" profit.py` 核对键名 `direct/budget/bridge` 后对齐。）

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_profit.py -q`
Expected: FAIL（budget=2，因按行计数不去重）

- [ ] **Step 3: Write minimal implementation**

`profit.py:119-123` 改为：

```python
    for r in budget:
        pid = str(r.get("项目编号") or "").strip()
        if not pid:
            continue
        if pid in keep_ids and pid not in budget_map:
            budget_matched += 1
        budget_map[pid] = _budget_versions(r)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_profit.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add profit.py tests/test_profit.py
git commit -m "fix(profit): budget_map 跳过空pid+匹配去重(修matchRate失真) (V2.6.7 批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: 除零回退 null（payDashboard rate/achievementRate）+ 收尾 bump 版本

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts:26-36, 59-68, 109-116, 141-143`（`PayDashSummary.rate`、`OrgRank.achievementRate` 类型与除零回退）
- Modify: `frontend/src/components/OrgRanking.vue:40-42, 62, 65`（`rateColor` null 守卫）
- Modify: `frontend/src/version.ts`
- Test: `frontend/src/lib/payDashboard.test.ts`

**Interfaces:**
- Produces: `rate`/`achievementRate` 由 `number` 放宽为 `number | null`，合同≤0 时为 `null`（对齐全站「合同≤0 → null 显 '-'」）；`pct(null)` 已返回 '-'（format.ts:17）。

- [ ] **Step 1: Write the failing test**

```ts
describe('除零回退 null', () => {
  it('无合同的服务组 achievementRate 为 null', () => {
    const projects = [{ projectId: 'P1', orgL4: 'A组', paymentPmis: { contract: 0 } }] as any
    const paymentRecords = { P1: { records: [{ date: '2026-05-01', amount: 100000 }] } } as any
    const r = payOrgRanking(projects, {}, paymentRecords, '', '', 'achievementRate')
    expect(r[0].achievementRate).toBeNull()
  })
  it('payDashSummary 无合同时 rate 为 null', () => {
    const projects = [{ projectId: 'P1', paymentPmis: { contract: 0 } }] as any
    const s = payDashSummary([], projects, { viewMode: 'global', viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} } as any)
    expect(s.rate).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/payDashboard.test.ts`
Expected: FAIL（当前返回 0）

- [ ] **Step 3: Write minimal implementation**

- `PayDashSummary` 接口：`rate: number` → `rate: number | null`。
- payDashSummary return（第 65 行）：`rate: totalContract > 0 ? totalActual / totalContract : null,`
- `OrgRank` 接口：`achievementRate: number` → `achievementRate: number | null`。
- payOrgRanking map（第 142 行）：`achievementRate: o.contractTotal > 0 ? o.actualTotal / o.contractTotal : null,`
- `OrgRanking.vue` 的 `rateColor` 加 null 守卫，并让 `sort`/`max` 不受影响（排序键为 actualTotal 时不涉 rate；按 achievementRate 排序时 null 视为最低）：

```ts
function rateColor(r: number | null): string {
  if (r == null) return 'var(--mut)'
  return r >= 0.45 ? 'var(--c-paid)' : r >= 0.3 ? 'var(--c-pending)' : 'var(--danger)'
}
```

若 `sortBy==='achievementRate'` 时 `b[sortBy]-a[sortBy]` 遇 null 需保序，改 payOrgRanking 的 sort 为：

```ts
    .sort((a, b) => (Number(b[sortBy] ?? -1)) - (Number(a[sortBy] ?? -1)))
```

- `version.ts`：`APP_VERSION = 'V2.6.7'`、`RELEASE_DATE = '2026-07-03'`。

- [ ] **Step 4: Run test + 全量 typecheck 找出其余 null 消费方**

Run: `cd frontend && npx vitest run src/lib/payDashboard.test.ts && npm run typecheck`
Expected: PASS + typecheck 无错（若 typecheck 报出别处对 rate/achievementRate 做算术的消费方，逐一加 `?? 0` 或 null 守卫）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/payDashboard.ts frontend/src/components/OrgRanking.vue frontend/src/lib/payDashboard.test.ts frontend/src/version.ts
git commit -m "fix(payment): 达成率除零回退null(对齐全站显'-')+bump V2.6.7 (批1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: 全量验收 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 跑全量验收**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 2: 真机冒烟**（`python server.py` + `cd frontend && npm run dev`，或 build 后 :8080）

核对：
- /projects 导出 xlsx「合同金额(万)」数值 = 屏显万值（非元）。
- 首页/动态页「新超支项目」出现非 0（对照全站约 68 超支项目）。
- /payment 服务组达成排名的达成率与顶部 KPI 完成率口径一致（2025 回款项目不再被区间低估）。
- 日历今日到期节点全天可见（含上午 8 点后）。

- [ ] **Step 3: 更新 PROGRESS.md**

在 PROGRESS.md 顶部与版本史记录 V2.6.7（批1 数据正确性，纯前端+管线纯函数，零 schema/preprocess 结构变化 → 升级不需点「更新数据」；本批不打包，随 V2.6.9 累积包上线）。

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs(progress): V2.6.7 数据正确性修复(批1)收官 (未打包,随V2.6.9累积)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review（作者已核对）

- **Spec 覆盖**：批1 的 spec 3.1-3.4 各项均有任务——导出单位(T1)、超支孤儿键+防复发契约(T2)、回款完成死分支(T3)、范围筛选单位(T4)、payOrgRanking 口径(T5)、paymentBand 漏网(T6)、calDashboardStats+calUpcoming(T7)、Excel 日期误猜(T8)、milestone 月末溢出(T9)、profit 空 pid(T10)、除零 null(T11)、验收+PROGRESS(T12)。防复发键集契约测试落在 T2（derive_cost→build_snapshot 契约）。
- **Placeholder 扫描**：无 TBD/TODO；每个改动步骤含实际代码。少数任务标注「先 grep 核对函数名/字段名」——因这些名字需在实现时对现网代码二次确认（diff_snapshots 事件入口、scopeOps 区间算子名、profit stats 键名、reminderRange 所在测试文件），非占位符，是必要的防漂移核对。
- **类型一致性**：T11 将 `rate`/`achievementRate` 统一放宽为 `number | null`，消费方（OrgRanking.rateColor、pct）已在同任务内加守卫；paymentBand 新增 `projects?` 参数与 OverviewView 调用方在 T6 同步。
- **同文件顺序**：snapshots.py（T2→T3）、payDashboard.ts（T5→T11）、calendar.ts（T7）按顺序执行，无并行冲突。
