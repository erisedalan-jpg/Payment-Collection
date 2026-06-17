# 3D 回款日历 /calendar 换源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/calendar`(CalendarView) 从 rawNodes 旧口径换到收款阶段口径，金额节点级、状态 5 态(日历排已回款=4 态)，orgL3 由后端从组织架构补。

**Architecture:** 后端给 `Project` 加 `orgL3`(组织架构经理→L3-1)；前端 `PayNodeRow += orgL3`；`lib/calendar.ts` 就地换源（全部函数改吃 PayNodeRow）；CalendarView 删 excludeFilter+filteredNodes 两路；仅 CalNodeTable/CalGrid 需组件改（其余 Cal* 消费 lib 计算结构、自动适配）。

**Tech Stack:** Python 标准库 + 自研 schema(json2ts)；Vue3+TS+Pinia+Element Plus+Vitest；复用 `lib/paymentPmis.ts`。

参考 spec：`docs/superpowers/specs/2026-06-17-3D-calendar-collection-source-design.md`

## Global Constraints
- 简体中文沟通；不用 emoji（用 → ↓ ❌ ✕ ▾）。
- 提交信息结尾固定加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 严禁 `git add -A`／`git add .`：仓库根有未跟踪文件「看板数据取值条件与计算公式.md」必须排除，只用显式路径。
- 改了 `schema.py` 必须 `cd frontend && npm run gen:types` 重生成 `analysis.ts`（不手改）。
- 前端命令在 `frontend/` 下；Python 用 `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python ...`。
- 版本单一来源 `frontend/src/version.ts`。

**关键背景事实：**
- `组织架构.xlsx` 每行含「姓名/新L3组织/新L3-1组织/新L4组织」；`projects.read_org_names` 按"表头含工号"选 sheet、有「新L3组织」列时仅留 `新L3组织==config.DEPT_L3` 行。`config.DEPT_L3 = "交付实施三部"`。
- `build_projects(project_pmis, org_names, org_l4s, mapping, delivery_rows, all_nodes)`；项目 dict 内 `manager = team.项目经理`、`orgL4 = team.L4部门`(PMIS)。
- `load_dept_projects` 里 `names, l4s, org_rows = read_org_names(...)`，随后 `build_projects(project_pmis, names, l4s, mapping, delivery, all_nodes)`。
- `PayNodeRow`(paymentPmis.ts) 现有：projectId/projectName/stage/planDate/actualDate/payRatio/actualRatio/expectedPayment/receivedAmount/unpaidAmount/projectManager/status/dept/projStage/tier/progress。
- `lib/calendar.ts` 全部函数当前吃 RawNode；`CalNodeTable.vue` 直接渲染节点字段；`CalGrid.vue` 用 statusClass+CSS；`CalDayDetail/CalAgenda/CalYearHeat` 消费 lib 的 CalListGroup/CalAgendaGroup/CalYearHeatCell（改 lib 即自动适配）。

---

### Task 1: 后端 Project.orgL3（组织架构经理→L3-1）

**Files:**
- Modify: `projects.py`（新增 `read_org_l3_map`；`build_projects` 加参数+字段；`load_dept_projects` 读取并传入）
- Modify: `schema.py`（`Project += orgL3`）
- Test: `tests/test_projects.py`

**Interfaces:**
- Produces: `read_org_l3_map(path: str) -> Dict[str, str]`（姓名→新L3-1组织）；project dict 新增键 `orgL3`。

- [ ] **Step 1: 写失败测试** — 在 `tests/test_projects.py` 末尾追加（沿用文件已有的 `_make_xlsx` 助手与组织架构表头）：

```python
class TestOrgL3Map:
    def test_read_org_l3_map(self, tmp_path):
        path = _make_xlsx(tmp_path, "组织架构.xlsx", [
            ("工号", "姓名", "员工类别", "新L2组织", "新L3组织", "新L3-1组织", "新L4组织"),
            ("1", "张三", "正式", "L2", "交付实施三部", "三部一组", "北京服务组"),
            ("2", "李四", "正式", "L2", "别的部门", "别组", "别L4"),  # 非交付实施三部 → 不收
        ])
        m = P.read_org_l3_map(path)
        assert m.get("张三") == "三部一组"
        assert "李四" not in m

    def test_build_projects_sets_orgL3(self):
        pmis = {"P1": {"source": "在建", "matched": True,
                       "team": {"项目经理": "张三", "项目名称": "甲", "L4部门": "北京服务组"}}}
        projs = P.build_projects(pmis, {"张三"}, {"北京服务组"}, [], [], [], {"张三": "三部一组"})
        assert projs[0]["orgL3"] == "三部一组"
```

> 注：`build_projects` 末参为新加的 `org_l3_map`（见 Step 3）。`_make_xlsx` 若现有 helper 签名不同，按文件内既有用法对齐（test_projects.py:25-36 已有同款建表）。

- [ ] **Step 2: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py::TestOrgL3Map -q`
Expected: FAIL（`read_org_l3_map` 不存在 / `build_projects` 参数不符）

- [ ] **Step 3: 实现** — `projects.py`：

(a) 在 `read_org_names` 后新增：

```python
def read_org_l3_map(path: str) -> Dict[str, str]:
    """组织架构表 → {姓名: 新L3-1组织}。同 read_org_names:按"表头含工号"选 sheet、有新L3组织列时仅留交付实施三部行。"""
    rows = _read_header_sheet(path, "工号")
    if rows and any(r.get("新L3组织") for r in rows):
        rows = [r for r in rows if str(r.get("新L3组织") or "").strip() == config.DEPT_L3]
    out: Dict[str, str] = {}
    for r in rows:
        name = str(r.get("姓名") or "").strip()
        l3 = str(r.get("新L3-1组织") or "").strip()
        if name and l3:
            out[name] = l3
    return out
```

(b) `build_projects` 签名末尾加参数 `org_l3_map: Dict[str, str] = None`（用可选默认以兼容现有测试调用），函数体起始处 `org_l3_map = org_l3_map or {}`；项目 dict 内 `"orgL4": ...` 行后加：

```python
            "orgL3": org_l3_map.get(manager, ""),
```

(c) `load_dept_projects`：在 `names, l4s, org_rows = read_org_names(...)` 后加一行，并把 map 传入 build_projects：

```python
    l3_map = read_org_l3_map(os.path.join(input_dir, config.ORG_FILE))
    ...
    projects = build_projects(project_pmis, names, l4s, mapping, delivery, all_nodes, l3_map)
```

(d) 确认 `Dict` 已在 `projects.py` 顶部 typing import（若无则补 `from typing import ..., Dict`）。

`schema.py` `Project` 类，在 `orgL4: str = ""` 行后加：

```python
    orgL3: str = ""
```

- [ ] **Step 4: 跑测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py -q`
Expected: PASS（含既有用例；既有 build_projects 调用因新参数有默认值不受影响）

- [ ] **Step 5: ruff**

Run: `python -m ruff check projects.py schema.py`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add projects.py schema.py tests/test_projects.py
git commit -m "$(cat <<'EOF'
feat(3d): Project.orgL3(组织架构经理→新L3-1组织)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 重生成 TS 类型

**Files:** Modify（自动生成，勿手改）: `frontend/src/types/analysis.ts`

- [ ] **Step 1: 重生成**

Run: `cd frontend && npm run gen:types`
Expected: 成功。

- [ ] **Step 2: 确认 orgL3 已生成**

Run: `cd frontend && grep -n "orgL3" src/types/analysis.ts`
Expected: `Project` 接口含 `orgL3`。

- [ ] **Step 3: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无报错。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/types/analysis.ts
git commit -m "$(cat <<'EOF'
chore(3d): 重生成 analysis.ts(Project.orgL3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: PayNodeRow += orgL3

**Files:** Modify: `frontend/src/lib/paymentPmis.ts`；Test: `frontend/src/lib/paymentPmis.test.ts`

**Interfaces:**
- Consumes: `Project.orgL3`（Task1/2）。
- Produces: `PayNodeRow.orgL3: string`。

- [ ] **Step 1: 加失败测试** — `paymentPmis.test.ts` 末尾追加：

```ts
describe('paymentNodeRows orgL3(3D)', () => {
  it('节点行带 orgL3(取自 project)', () => {
    const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: 'A', orgL3: '三部一组', paymentPmis: { contract: 100 } }] as any
    const paymentNodes = { P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.7, actualRatio: 0, expectedPayment: 100, receivedAmount: 0, unpaidAmount: 100, status: '待回款' }] } as any
    expect(paymentNodeRows(paymentNodes, projects)[0].orgL3).toBe('三部一组')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts -t "orgL3"`
Expected: FAIL（orgL3 undefined）

- [ ] **Step 3: 实现** — `paymentPmis.ts`：
(a) `PayNodeRow` 接口在 `dept: string` 行后加 `orgL3: string`。
(b) `paymentNodeRows` push 对象在 `dept,` 行后加：`orgL3: (p.orgL3 ?? '').trim(),`

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "$(cat <<'EOF'
feat(3d): PayNodeRow 增 orgL3(日历 L3-1 部门筛选用)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: lib/calendar.ts 就地换源（收款阶段口径）

**Files:** Modify（整体重写）: `frontend/src/lib/calendar.ts`；Test（重写）: `frontend/src/lib/calendar.test.ts`

**Interfaces:**
- Consumes: `PayNodeRow`（含 status/unpaidAmount/receivedAmount/orgL3/dept/projectManager/planDate/actualRatio）。
- Produces: 同名导出，输入类型改 `PayNodeRow[]`；`CalDayData` 桶改 4 态（delayed/pending/partial/warranty）；`CalFilters` 不变。

- [ ] **Step 1: 重写测试** — 用收款阶段夹具替换 `calendar.test.ts`（保留其余既有用例结构，核心断言如下；`pn()` 工厂同 ledger.test 风格）：

```ts
import { describe, it, expect } from 'vitest'
import {
  calExcludePaid, calFilterOptions, applyCalFilters, calDashboardStats,
  calDateData, calListGroups, calUpcoming, calYearHeat,
} from './calendar'
import type { PayNodeRow } from './paymentPmis'

function pn(p: Partial<PayNodeRow>): PayNodeRow {
  return { projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-10', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0,
    projectManager: '张', status: '待回款', dept: 'A组', orgL3: '三部一组', projStage: '', tier: '100万以上', progress: '未回款', ...p }
}

describe('calExcludePaid', () => {
  it('排除已回款', () => {
    const out = calExcludePaid([pn({ status: '已回款' }), pn({ status: '延期' })])
    expect(out).toHaveLength(1)
    expect(out[0].status).toBe('延期')
  })
})

describe('calFilterOptions', () => {
  it('orgL3/orgL4(dept)/pm 去重升序', () => {
    const o = calFilterOptions([pn({ orgL3: '组A', dept: 'L4A', projectManager: '张' }), pn({ orgL3: '组B', dept: 'L4B', projectManager: '李' })])
    expect(o.orgL3).toEqual(['组A', '组B'])
    expect(o.orgL4).toEqual(['L4A', 'L4B'])
    expect(o.pm).toEqual(['张', '李'])
  })
})

describe('applyCalFilters', () => {
  it('按 orgL3/dept/pm 过滤', () => {
    const rows = [pn({ projectId: 'P1', orgL3: '组A' }), pn({ projectId: 'P2', orgL3: '组B' })]
    expect(applyCalFilters(rows, { orgL3: '组A', orgL4: '', pm: '' }).map((n) => n.projectId)).toEqual(['P1'])
  })
})

describe('calDashboardStats', () => {
  it('当月 Σ未收/已收 + 延期 + 7天到期', () => {
    const now = new Date('2026-02-15T00:00:00')
    const rows = [
      pn({ planDate: '2026-02-10', unpaidAmount: 30000, receivedAmount: 10000, status: '部分回款' }),
      pn({ planDate: '2026-02-18', unpaidAmount: 50000, status: '延期' }),
    ]
    const d = calDashboardStats(rows, { orgL3: '', orgL4: '', pm: '' }, now)
    expect(d.mRemaining).toBe(80000)
    expect(d.mActual).toBe(10000)
    expect(d.mCount).toBe(2)
    expect(d.delayed).toBe(1)
    expect(d.upcoming7).toBe(1) // 02-18 距 02-15 = 3 天
  })
})

describe('calDateData', () => {
  it('按日 4 态桶 + Σ未收', () => {
    const m = calDateData([
      pn({ planDate: '2026-02-10', unpaidAmount: 30000, status: '延期' }),
      pn({ planDate: '2026-02-10', unpaidAmount: 20000, status: '部分回款' }),
    ])
    expect(m['2026-02-10'].total).toBe(2)
    expect(m['2026-02-10'].delayed).toBe(1)
    expect(m['2026-02-10'].partial).toBe(1)
    expect(m['2026-02-10'].remaining).toBe(50000)
  })
})

describe('calListGroups', () => {
  it('按 4 态分组,subRemaining=Σ未收', () => {
    const g = calListGroups([pn({ status: '延期', unpaidAmount: 5000 }), pn({ status: '延期', unpaidAmount: 3000 })])
    expect(g[0].key).toBe('延期')
    expect(g[0].subRemaining).toBe(8000)
  })
})

describe('calUpcoming', () => {
  it('15/30天内、排已回款', () => {
    const now = new Date('2026-02-01T00:00:00')
    const rows = [
      pn({ planDate: '2026-02-10', status: '待回款' }),  // 9天 → up15
      pn({ planDate: '2026-02-25', status: '延期' }),     // 24天 → up30
      pn({ planDate: '2026-02-05', status: '已回款' }),   // 排除
    ]
    const u = calUpcoming(rows, { orgL3: '', orgL4: '', pm: '' }, now)
    expect(u.up15.map((n) => n.planDate)).toEqual(['2026-02-10'])
    expect(u.up30.map((n) => n.planDate)).toEqual(['2026-02-25'])
  })
})

describe('calYearHeat', () => {
  it('按月 Σ未收', () => {
    const h = calYearHeat([pn({ planDate: '2026-02-10', unpaidAmount: 40000 })], 2026)
    expect(h[1].remaining).toBe(40000)
    expect(h[1].count).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/calendar.test.ts`
Expected: FAIL（旧实现读 nodeStatus/isPaymentRelated/getNodeRemaining，新夹具不符）

- [ ] **Step 3: 重写 `frontend/src/lib/calendar.ts`** 为（完整替换）：

```ts
import type { PayNodeRow } from './paymentPmis'

/** 排除已回款节点(日历只关心未结清的)。 */
export function calExcludePaid(nodes: PayNodeRow[]): PayNodeRow[] {
  return nodes.filter((n) => n.status !== '已回款')
}

export interface CalFilters { orgL3: string; orgL4: string; pm: string }

/** 三筛选下拉选项(有 planDate 的节点,升序去重)。orgL4 取 dept。 */
export function calFilterOptions(nodes: PayNodeRow[]): { orgL3: string[]; orgL4: string[]; pm: string[] } {
  const l3 = new Set<string>(), l4 = new Set<string>(), pm = new Set<string>()
  for (const n of nodes) {
    if (!n.planDate) continue
    if (n.orgL3) l3.add(n.orgL3)
    if (n.dept) l4.add(n.dept)
    if (n.projectManager) pm.add(n.projectManager)
  }
  return { orgL3: [...l3].sort(), orgL4: [...l4].sort(), pm: [...pm].sort() }
}

/** 应用 orgL3/orgL4(dept)/PM 三筛选。 */
export function applyCalFilters(nodes: PayNodeRow[], f: CalFilters): PayNodeRow[] {
  let out = nodes
  if (f.orgL3) out = out.filter((n) => n.orgL3 === f.orgL3)
  if (f.orgL4) out = out.filter((n) => n.dept === f.orgL4)
  if (f.pm) out = out.filter((n) => n.projectManager === f.pm)
  return out
}

export interface CalDashboard { mRemaining: number; mActual: number; upcoming7: number; mCount: number; delayed: number }
/** 当月(now 月)待回款=Σ未收/已回款=Σ已收/笔数；延期=count(延期)；upcoming7=planDate 距今 0..7 天且未结清。 */
export function calDashboardStats(nodes: PayNodeRow[], f: CalFilters, now: Date): CalDashboard {
  const ns = applyCalFilters(nodes.filter((n) => n.planDate), f)
  const nowY = now.getFullYear(), nowM = now.getMonth()
  let mRem = 0, mAct = 0, mCnt = 0, up = 0, del = 0
  for (const n of ns) {
    const pd = n.planDate
    if (!pd || pd.length < 10) continue
    const py = parseInt(pd.substring(0, 4)), pmo = parseInt(pd.substring(5, 7)) - 1
    const diff = Math.ceil((new Date(pd.substring(0, 10)).getTime() - now.getTime()) / 86400000)
    if (diff >= 0 && diff <= 7 && n.status !== '已回款') up++
    if (n.status === '延期') del++
    if (py === nowY && pmo === nowM) { mCnt++; mRem += n.unpaidAmount; mAct += n.receivedAmount }
  }
  return { mRemaining: mRem, mActual: mAct, upcoming7: up, mCount: mCnt, delayed: del }
}

export interface CalDayData { total: number; delayed: number; pending: number; partial: number; warranty: number; remaining: number }
/** 按日期统计 4 态计数 + Σ未收(输入应为已排已回款的节点)。 */
export function calDateData(nodes: PayNodeRow[]): Record<string, CalDayData> {
  const map: Record<string, CalDayData> = {}
  for (const n of nodes) {
    if (!n.planDate) continue
    const d = String(n.planDate).slice(0, 10)
    if (!map[d]) map[d] = { total: 0, delayed: 0, pending: 0, partial: 0, warranty: 0, remaining: 0 }
    const dd = map[d]
    dd.total++
    dd.remaining += n.unpaidAmount
    const s = n.status
    if (s === '延期') dd.delayed++
    else if (s === '部分回款') dd.partial++
    else if (s === '质保期') dd.warranty++
    else dd.pending++
  }
  return map
}

export interface CalCell { day: number; dateStr: string; otherMonth: boolean; isToday: boolean; isWeekend: boolean; statusClass: string; count: number; remaining: number }
/** 月份格子(含补位)；statusClass 4 态优先级或 mixed。 */
export function calMonthGrid(year: number, month: number, dateData: Record<string, CalDayData>, today: Date): CalCell[] {
  const cells: CalCell[] = []
  const dow = new Date(year, month, 1).getDay()
  const startOff = dow === 0 ? 6 : dow - 1
  const dim = new Date(year, month + 1, 0).getDate()
  const prevDim = new Date(year, month, 0).getDate()
  for (let i = 0; i < startOff; i++)
    cells.push({ day: prevDim - startOff + i + 1, dateStr: '', otherMonth: true, isToday: false, isWeekend: false, statusClass: '', count: 0, remaining: 0 })
  for (let d = 1; d <= dim; d++) {
    const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const dowD = new Date(year, month, d).getDay()
    const isWeekend = dowD === 0 || dowD === 6
    const dd = dateData[ds]
    const count = dd ? dd.total : 0
    const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate()
    let statusClass = ''
    if (count > 0 && dd) {
      const sc = (dd.delayed > 0 ? 1 : 0) + (dd.pending > 0 ? 1 : 0) + (dd.partial > 0 ? 1 : 0) + (dd.warranty > 0 ? 1 : 0)
      if (sc > 1) statusClass = 'mixed'
      else if (dd.delayed > 0) statusClass = 'delayed'
      else if (dd.pending > 0) statusClass = 'pending'
      else if (dd.partial > 0) statusClass = 'partial'
      else statusClass = 'warranty'
    }
    cells.push({ day: d, dateStr: ds, otherMonth: false, isToday, isWeekend, statusClass, count, remaining: dd ? dd.remaining : 0 })
  }
  const total = startOff + dim
  const rem = total % 7 === 0 ? 0 : 7 - (total % 7)
  for (let i = 1; i <= rem; i++)
    cells.push({ day: i, dateStr: '', otherMonth: true, isToday: false, isWeekend: false, statusClass: '', count: 0, remaining: 0 })
  return cells
}

/** 列表节点：selectedDate 优先,否则当前双月。输入纳管节点(PayNodeRow)。 */
export function calListNodes(naguanNodes: PayNodeRow[], f: CalFilters, view: { year: number; month: number; selectedDate: string }): PayNodeRow[] {
  let nodes = applyCalFilters(calExcludePaid(naguanNodes.filter((n) => n.planDate)), f)
  const { year, month, selectedDate } = view
  let y2 = year, m2 = month + 1
  if (m2 > 11) { m2 = 0; y2 = year + 1 }
  const p1 = year + '-' + String(month + 1).padStart(2, '0')
  const p2 = y2 + '-' + String(m2 + 1).padStart(2, '0')
  if (selectedDate) nodes = nodes.filter((n) => String(n.planDate).startsWith(selectedDate))
  else nodes = nodes.filter((n) => String(n.planDate).startsWith(p1) || String(n.planDate).startsWith(p2))
  return [...nodes].sort((a, b) => String(a.planDate || '').localeCompare(String(b.planDate || '')))
}

export interface CalListGroup { key: string; color: string; nodes: PayNodeRow[]; subRemaining: number }
const LIST_STATUS_ORDER = [
  { key: '延期', color: '#EF4444' },
  { key: '待回款', color: '#94A3B8' },
  { key: '部分回款', color: '#3B82F6' },
  { key: '质保期', color: '#F59E0B' },
]
/** 按 4 态分组(顺序固定,空组略,subRemaining=Σ未收)。 */
export function calListGroups(nodes: PayNodeRow[]): CalListGroup[] {
  const groups: CalListGroup[] = []
  for (const sg of LIST_STATUS_ORDER) {
    const g = nodes.filter((n) => n.status === sg.key)
    if (!g.length) continue
    groups.push({ key: sg.key, color: sg.color, nodes: g, subRemaining: g.reduce((s, n) => s + n.unpaidAmount, 0) })
  }
  return groups
}

export interface CalUpcoming { up15: PayNodeRow[]; up30: PayNodeRow[] }
/** up15=[now,now+15] 未结清；up30=(now,now+30] 未结清(已排已回款)。 */
export function calUpcoming(naguanNodes: PayNodeRow[], f: CalFilters, now: Date): CalUpcoming {
  const all = applyCalFilters(calExcludePaid(naguanNodes.filter((n) => n.planDate)), f)
  const d15 = new Date(now.getTime() + 15 * 864e5)
  const d30 = new Date(now.getTime() + 30 * 864e5)
  const byDate = (a: PayNodeRow, b: PayNodeRow) => String(a.planDate || '').localeCompare(String(b.planDate || ''))
  const up15 = all.filter((n) => { const d = new Date(n.planDate); return d >= now && d <= d15 }).sort(byDate)
  const up30 = all.filter((n) => { const d = new Date(n.planDate); return d > now && d <= d30 }).sort(byDate)
  return { up15, up30 }
}

const TOOLTIP_LABELS: [keyof CalDayData, string][] = [
  ['delayed', '延期'], ['pending', '待回款'], ['partial', '部分回款'], ['warranty', '质保期'],
]
/** 网格格子悬浮文本。 */
export function calDayTooltipText(dd: CalDayData): string {
  const parts = TOOLTIP_LABELS.filter(([k]) => (dd[k] as number) > 0).map(([k, label]) => `${label} ${dd[k]}`)
  return parts.join('，') + `，合计 ${dd.total}`
}

export interface CalAgendaGroup { date: string; nodes: PayNodeRow[]; subRemaining: number }
/** 议程按 planDate(到日)分组、升序,每组 Σ未收。 */
export function calAgendaGroups(nodes: PayNodeRow[]): CalAgendaGroup[] {
  const map: Record<string, PayNodeRow[]> = {}
  for (const n of nodes) {
    const d = String(n.planDate || '').slice(0, 10)
    if (!d) continue
    ;(map[d] ||= []).push(n)
  }
  return Object.keys(map).sort().map((d) => ({ date: d, nodes: map[d], subRemaining: map[d].reduce((s, n) => s + n.unpaidAmount, 0) }))
}

export interface CalYearHeatCell { month: number; remaining: number; count: number }
/** 指定年 12 月各自 Σ未收 与节点数。 */
export function calYearHeat(nodes: PayNodeRow[], year: number): CalYearHeatCell[] {
  const out: CalYearHeatCell[] = Array.from({ length: 12 }, (_, m) => ({ month: m, remaining: 0, count: 0 }))
  for (const n of nodes) {
    const pd = String(n.planDate || '')
    if (pd.length < 7) continue
    if (parseInt(pd.slice(0, 4)) !== year) continue
    const m = parseInt(pd.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    out[m].remaining += n.unpaidAmount
    out[m].count++
  }
  return out
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/calendar.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck**（此步 CalGrid/CalNodeTable/CalendarView 尚未改,可能因 CalDayData 桶变更报错——若仅这些下游报错属预期,Task5/6 修；本步只要 calendar.ts 本身与 calendar.test 通过即可，typecheck 全绿留 Task6 末）

Run: `cd frontend && npx vitest run src/lib/calendar.test.ts`（已在 Step4）
说明：不在此步强求 `npm run typecheck` 全绿（CalDayData 改 4 态会让 CalGrid 暂时类型不符，Task5 修）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/calendar.ts frontend/src/lib/calendar.test.ts
git commit -m "$(cat <<'EOF'
feat(3d): lib/calendar 就地换收款阶段口径(状态4态/金额节点级/orgL3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: CalNodeTable + CalGrid 组件适配

**Files:**
- Modify: `frontend/src/components/CalNodeTable.vue`、`frontend/src/components/CalGrid.vue`
- Test: `frontend/src/components/CalNodeTable.test.ts`（若存在；否则在本任务建最小用例）

**Interfaces:**
- Consumes: PayNodeRow 字段（status/stage/dept/unpaidAmount/receivedAmount/actualRatio）；`CalDayData` 4 态。
- 其余 CalDayDetail/CalAgenda/CalYearHeat 消费 lib 计算结构(CalListGroup/CalAgendaGroup/CalYearHeatCell)，本任务**先 grep 确认它们不直接读旧字段**；若 CalAgenda 直接渲染节点字段则同样套用下方字段映射。

字段映射（CalNodeTable 用）：
| 旧 | 新 |
|---|---|
| `getNodeRemaining(n)`(待回款) | `n.unpaidAmount` |
| `n.orgL4` | `n.dept` |
| `n.nodeStatus` | `n.status` |
| `n.milestone || n.stageName` | `n.stage` |
| `n.actualPaymentRatio` | `n.actualRatio` |
| `n.actualPayment`(已回款) | `n.receivedAmount` |
| `n.projectAmount` 项目金额列 | **删该列** |

- [ ] **Step 1: 改/建测试** — 若有 `CalNodeTable.test.ts` 则改夹具为收款阶段并断言；若无则新建：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalNodeTable from './CalNodeTable.vue'

beforeEach(() => setActivePinia(createPinia()))

describe('CalNodeTable(收款阶段口径)', () => {
  it('渲染阶段/状态/未收/已收', () => {
    const nodes = [{ projectId: 'P1', projectName: '甲', tier: '100万以上', dept: 'A组', projectManager: '张',
      status: '部分回款', stage: '到货款', planDate: '2026-02-10', actualRatio: 0.3,
      expectedPayment: 100000, receivedAmount: 30000, unpaidAmount: 70000 }]
    const w = mount(CalNodeTable, { props: { nodes } })
    const t = w.text()
    expect(t).toContain('到货款')
    expect(t).toContain('部分回款')
    expect(t).toContain('A组')
    expect(t).toContain('共 1 条记录')
  })
})
```

- [ ] **Step 2: 跑确认失败**

Run: `cd frontend && npx vitest run src/components/CalNodeTable.test.ts`
Expected: FAIL（旧组件读 nodeStatus/getNodeRemaining，新夹具无）

- [ ] **Step 3: 改 `CalNodeTable.vue`**：
(a) 删 `import { getNodeRemaining } from '@/lib/riskGroups'`（保留 `fmtYuan, fmtRatio`）。
(b) thead 删「项目金额(元)」`<th>`；将其余表头保持。
(c) tbody 改对应单元格：删 `项目金额` 那 `<td>`；`待回款金额` 改 `{{ fmtYuan(n.unpaidAmount) }}`；`服务组` 改 `{{ n.dept || '-' }}`；`节点状态` 改 `{{ n.status }}`；`里程碑/阶段名称` 改 `{{ n.stage || '-' }}`；`实际回款比例` 改 `{{ fmtRatio(n.actualRatio, '待上报') }}`；`已回款金额` 改 `{{ fmtYuan(n.receivedAmount) }}`；`计划回款金额` 保持 `{{ fmtYuan(n.expectedPayment) }}`；projectId/projectName/tier/projectManager/planDate 不变。

- [ ] **Step 4: 改 `CalGrid.vue` 的 statusClass CSS**：把 `<style>` 里 7 个旧 `.st-*` 替换为 4 态（保留 mixed）：
```css
.st-delayed { --sc: var(--danger); }
.st-pending { --sc: var(--mut); }
.st-partial { --sc: var(--accent); }
.st-warranty { --sc: var(--warn); }
.st-mixed { --sc: var(--accent); }
```
（删 `.st-ontime/.st-advance/.st-canadvance/.st-reached/.st-fullpaid`。CalGrid 模板 `st-` + c.statusClass 不变。）

- [ ] **Step 5: 确认 CalAgenda/CalYearHeat 无旧字段直读**

Run: `cd frontend && grep -nE "nodeStatus|getNodeRemaining|actualPayment\b|milestone|stageName|orgL4" src/components/CalAgenda.vue src/components/CalYearHeat.vue src/components/CalDayDetail.vue`
Expected: 无输出（它们只消费 lib 结构）。若有命中，按字段映射表改同款。

- [ ] **Step 6: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/CalNodeTable.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/CalNodeTable.vue frontend/src/components/CalGrid.vue frontend/src/components/CalNodeTable.test.ts
git commit -m "$(cat <<'EOF'
feat(3d): CalNodeTable/CalGrid 适配收款阶段(状态4态/未收/已收)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: CalendarView 换数据源（删 rawNodes 两路）

**Files:** Modify: `frontend/src/views/CalendarView.vue`；Test: `frontend/src/views/CalendarView.test.ts`

**Interfaces:**
- Consumes: `paymentNodeRows`(paymentPmis)、`calXxx`(calendar，PayNodeRow 版)。

- [ ] **Step 1: 改测试** — `CalendarView.test.ts` 的数据 seed 换收款阶段（projects+paymentNodes+projectPmis，rawNodes:[]），断言 DASH 5 卡 + 渲染。最小：

```ts
function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: 'A组', orgL3: '三部一组', paymentPmis: { contract: 1000000 } }],
    projectPmis: {},
    paymentNodes: { P1: [{ stage: '到货款', planDate: '2026-02-10', actualDate: '', payRatio: 0.5, actualRatio: 0, expectedPayment: 500000, receivedAmount: 0, unpaidAmount: 500000, status: '待回款' }] },
  } as any
}
```
断言：`expect(w.text()).toContain('当月待回款(万)')`、`toContain('回款日历')`、不报错；若原有断言依赖具体节点文本，按新夹具调整。

- [ ] **Step 2: 跑确认失败**

Run: `cd frontend && npx vitest run src/views/CalendarView.test.ts`
Expected: FAIL（旧 CalendarView 读 rawNodes，新 seed 无）

- [ ] **Step 3: 改 `CalendarView.vue` `<script setup>`**：
(a) import：删 `import { excludeFilter } from '@/lib/ledger'`；增 `import { paymentNodeRows } from '@/lib/paymentPmis'`。calendar import 不变（同名函数）。
(b) 数据源（替换 `rawNodes`/`excludedNodes` 两 computed 及 `dashboard` 那一路）：
```ts
const allNodes = computed(() =>
  paymentNodeRows(data.data?.paymentNodes, data.data?.projects ?? [], data.data?.projectPmis))
const baseNodes = computed(() =>
  filter.excludeOn ? allNodes.value.filter((n) => !filter.excludedIds[n.projectId]) : allNodes.value)
```
(c) 把原来用 `excludedNodes.value` 的各 computed（options/gridNodes/listNodes/upcoming/agendaNodes）改用 `baseNodes.value`；`dashboard` 改：
```ts
const dashboard = computed(() => calDashboardStats(baseNodes.value, calFilters.value, new Date()))
```
（即所有 cal* 调用的数据源统一为 `baseNodes`；删除对 `filter.filteredNodes` 与 `excludeFilter` 的全部引用。`gridNodes`/`listNodes`/`upcoming` 内部已各自 calExcludePaid/applyCalFilters，照原结构仅换底层源为 baseNodes。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/CalendarView.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck 全绿**

Run: `cd frontend && npm run typecheck`
Expected: 无报错（至此 calendar 链路全部换源完成）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/CalendarView.vue frontend/src/views/CalendarView.test.ts
git commit -m "$(cat <<'EOF'
feat(3d): CalendarView 换收款阶段数据源(删 excludeFilter+filteredNodes 两路)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 版本 V1.6.6 + PROGRESS + 全量验证

**Files:** Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 升版本** — `frontend/src/version.ts`：
```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.6.6'
export const RELEASE_DATE = '2026-06-17'
```

- [ ] **Step 2: 更新 PROGRESS.md** — 「全局下线 rawNodes 程序」条目里把「④-⑤ 3D 日历 / 3E 移除后端 rawNodes 待开」改写为 ④3D 已做、「⑤ 3E … 待开」，紧随 ③3C 描述后插入：

```markdown
④**3D 回款日历 /calendar 换源（spec/plan 2026-06-17-3D-calendar-collection-source，V1.6.6，feat/3d-calendar-source）**：后端 `Project.orgL3`(组织架构经理→新L3-1组织,`projects.read_org_l3_map`) + 前端 `PayNodeRow.orgL3`；`lib/calendar.ts` 整体就地换源到 PayNodeRow——状态 5 态(日历排已回款=待回款/部分回款/质保期/延期 4 态着色+分组)、金额节点级(待回款=Σ未收/已回款=Σ已收)、orgL3/orgL4(dept)/pm 三筛保留；CalNodeTable(字段改名+去项目金额列)/CalGrid(statusClass 4 态)适配,CalDayDetail/CalAgenda/CalYearHeat 消费 lib 结构自动适配；CalendarView 删 `excludeFilter`+`filter.filteredNodes` 两路。**此后 `filter.filteredNodes` 全站无消费方**(连同 filterNodes/旧 dashboardStats·dashboardCharts/ledger ProjectAgg 函数/excludeFilter) 留 ⑤3E 随后端 rawNodes 统一清。⑤ 3E 移除后端 rawNodes 待开。
```

- [ ] **Step 3: 实跑预处理确认 orgL3 入产物**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python preprocess_data.py 2>&1 | tail -5`
Expected: `数据已通过 schema 校验` + 正常完成。

- [ ] **Step 4: 全量 verify.sh 全绿**

Run: `bash verify.sh`
Expected: python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

- [ ] **Step 5: 手验（建议）** — build 后手验 `/calendar`：5 卡/年热力/网格+议程/日详情/即将到期/三筛(含 orgL3)/无 JS 报错。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "$(cat <<'EOF'
chore(3d): 版本 V1.6.6 + PROGRESS(回款日历换源)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完成定义

- 7 任务全部提交；`bash verify.sh` 全绿；`preprocess_data.py` 产物含 `orgL3`、schema 通过。
- `/calendar` 由收款阶段口径驱动：5 卡/网格 4 态着色/日详情 4 态分组/即将到期/三筛(含 orgL3) 正常；CalendarView 无 rawNodes/excludeFilter/filteredNodes 引用。
- 版本 V1.6.6；PROGRESS 已记。
- 未触碰：其它页面；`filteredNodes`/`filterNodes`/`excludeFilter`/旧 dashboardStats·dashboardCharts·ledger ProjectAgg 函数(留 3E)；仓库根未跟踪文件。
