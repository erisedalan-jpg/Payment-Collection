# 3C 回款台账 /ledger 换源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/ledger`(LedgerView) 从 rawNodes 旧口径换到收款阶段口径（项目级行 + 收款阶段节点下钻），金额节点级、状态进度 3 态 + 延期。

**Architecture:** 纯前端。`paymentNodeRows`(3B 已建,本期 +actualRatio) 按项目聚合成台账行；`lib/ledger.ts` 新增收款阶段口径函数；LedgerView 换源 + status-row 6→4 卡；LedgerTable 下钻改读行自带 `nodes`。不动后端、`filteredNodes`、`excludeFilter`(3D 共用)、`groupByProject`(3E 清)；旧 ProjectAgg 版 ledger 函数留死待 3E。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + Vitest；复用 `lib/paymentPmis.ts`。

参考 spec：`docs/superpowers/specs/2026-06-17-3C-ledger-collection-source-design.md`

**约定（务必遵守）：**
- 简体中文沟通；不用 emoji（用 → ↓ ❌ ✕ ▾）。
- 提交信息结尾固定加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 严禁 `git add -A`／`git add .`：仓库根有未跟踪文件「看板数据取值条件与计算公式.md」必须始终排除，只用显式路径。
- 前端命令在 `frontend/` 下跑；单测 `npx vitest run <file>`。本期**不涉及后端 schema**，不重生成类型。

**关键背景事实：**
- `PayNodeRow`(paymentPmis.ts:164-) 现有 `projectId/projectName/stage/planDate/actualDate/payRatio/expectedPayment/receivedAmount/unpaidAmount/projectManager/status/dept/projStage/tier/progress`，**缺 `actualRatio`**（Task1 补）。`PaymentNodePmis` 节点已有 `actualRatio`。
- LedgerView 列定义引用 `projectId/projectName/tier/orgL4/projectManager/projectAmount/expectedPayment/actualPayment/paymentStatus`——新 `LedgerProjectRow` 同名字段全有，故**列定义不改**。
- `excludeFilter`(lib/ledger.ts) 与 CalendarView(3D) 共用，**保留不动**。

---

### Task 1: paymentNodeRows += actualRatio

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts`
- Test: `frontend/src/lib/paymentPmis.test.ts`

- [ ] **Step 1: 加失败测试** — 在 `paymentPmis.test.ts` 末尾追加：

```ts
describe('paymentNodeRows actualRatio(3C)', () => {
  it('节点行带 actualRatio', () => {
    const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: 'A', paymentPmis: { contract: 100 } }] as any
    const paymentNodes = { P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.7,
      expectedPayment: 100, receivedAmount: 60, unpaidAmount: 40, actualRatio: 0.6, status: '部分回款' }] } as any
    expect(paymentNodeRows(paymentNodes, projects)[0].actualRatio).toBe(0.6)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts -t "actualRatio"`
Expected: FAIL（actualRatio 为 undefined）

- [ ] **Step 3: 实现** — `paymentPmis.ts`：
(a) `PayNodeRow` 接口在 `payRatio: number | null` 行后插入：
```ts
  actualRatio: number | null
```
(b) `paymentNodeRows` 的 push 对象在 `payRatio: n.payRatio ?? null,` 行后插入：
```ts
        actualRatio: n.actualRatio ?? null,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无报错

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "$(cat <<'EOF'
feat(3c): PayNodeRow 增 actualRatio(台账下钻实际比例用)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: lib/ledger.ts 收款阶段口径函数（5 个）

**Files:**
- Modify: `frontend/src/lib/ledger.ts`（追加，不动 excludeFilter 及旧 ProjectAgg 函数）
- Test: `frontend/src/lib/ledger.test.ts`（追加）

- [ ] **Step 1: 加失败测试** — 在 `ledger.test.ts` 末尾追加：

```ts
import {
  ledgerRows, filterLedgerRows, ledgerSummaryPmis, ledgerTierStatsPmis, ledgerStatusCountsPmis,
} from './ledger'
import type { PayNodeRow } from './paymentPmis'

function pn(p: Partial<PayNodeRow>): PayNodeRow {
  return { projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-01', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0,
    projectManager: '张三', status: '待回款', dept: 'A组', projStage: '', tier: '100万以上', progress: '部分回款', ...p }
}

describe('ledgerRows', () => {
  const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }] as any
  it('按项目聚合金额 + 派生 progress/延期 + join 维度', () => {
    const rows = ledgerRows([
      pn({ expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' }),
      pn({ expectedPayment: 500000, receivedAmount: 0, unpaidAmount: 500000, status: '延期' }),
    ], projects)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.expectedPayment).toBe(1500000)
    expect(r.actualPayment).toBe(600000)
    expect(r.remainingAmount).toBe(900000)
    expect(r.paymentRatio).toBeCloseTo(0.4)
    expect(r.paymentStatus).toBe('部分回款')
    expect(r.delayed).toBe(true)
    expect(r.orgL4).toBe('A组')
    expect(r.tier).toBe('100万以上')
    expect(r.projectAmount).toBe(2000000)
    expect(r.nodes).toHaveLength(2)
  })
  it('全额→已全额回款 / 零→未回款', () => {
    expect(ledgerRows([pn({ expectedPayment: 100, receivedAmount: 100, status: '已回款' })], projects)[0].paymentStatus).toBe('已全额回款')
    expect(ledgerRows([pn({ expectedPayment: 100, receivedAmount: 0, status: '待回款' })], projects)[0].paymentStatus).toBe('未回款')
  })
  it('不在 projects 的项目跳过', () => {
    expect(ledgerRows([pn({ projectId: 'X' })], projects)).toHaveLength(0)
  })
})

describe('filterLedgerRows', () => {
  const rows = [
    { projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '北京', tier: '100万以上', projectAmount: 100, paymentStatus: '部分回款', delayed: true },
    { projectId: 'P2', projectName: '乙', projectManager: '李', orgL4: '上海', tier: '50万以下', projectAmount: 300, paymentStatus: '未回款', delayed: false },
  ] as any
  it('搜索/区间/状态(进度)/状态(延期)/降序', () => {
    expect(filterLedgerRows(rows, { search: '李', tier: '', status: '' }).map((r) => r.projectId)).toEqual(['P2'])
    expect(filterLedgerRows(rows, { search: '', tier: '100万以上', status: '' }).map((r) => r.projectId)).toEqual(['P1'])
    expect(filterLedgerRows(rows, { search: '', tier: '', status: '未回款' }).map((r) => r.projectId)).toEqual(['P2'])
    expect(filterLedgerRows(rows, { search: '', tier: '', status: '延期' }).map((r) => r.projectId)).toEqual(['P1'])
    expect(filterLedgerRows(rows, { search: '', tier: '', status: '' }).map((r) => r.projectId)).toEqual(['P2', 'P1'])
  })
})

describe('ledgerSummaryPmis/TierStatsPmis/StatusCountsPmis', () => {
  const rows = [
    { tier: '100万以上', expectedPayment: 1000000, actualPayment: 400000, paymentStatus: '部分回款', delayed: true },
    { tier: '50万以下', expectedPayment: 200000, actualPayment: 0, paymentStatus: '未回款', delayed: false },
  ] as any
  it('summary', () => {
    const s = ledgerSummaryPmis(rows)
    expect(s).toMatchObject({ projectCount: 2, totalExp: 1200000, totalAct: 400000, totalRem: 800000 })
    expect(s.rate).toBeCloseTo(0.3333)
  })
  it('tier 三档', () => {
    const t = ledgerTierStatsPmis(rows)
    expect(t.map((x) => x.tier)).toEqual(['100万以上', '50-100万', '50万以下'])
    expect(t[0]).toMatchObject({ count: 1, expWan: 100, remWan: 60 })
  })
  it('statusCounts 四计数含 delayed', () => {
    expect(ledgerStatusCountsPmis(rows)).toMatchObject({ fullPaid: 0, partial: 1, unpaid: 1, delayed: 1 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/ledger.test.ts -t "ledgerRows"`
Expected: FAIL（导出不存在）

- [ ] **Step 3: 实现** — 在 `frontend/src/lib/ledger.ts` **末尾追加**（顶部 import 区补 `import type { Project } from '@/types/analysis'` 与 `import type { PayNodeRow } from './paymentPmis'`）：

```ts
export interface LedgerProjectRow {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  tier: string
  projectAmount: number
  expectedPayment: number
  actualPayment: number
  remainingAmount: number
  paymentRatio: number
  paymentStatus: string
  delayed: boolean
  nodes: PayNodeRow[]
}

/** 按 projectId 聚合收款阶段节点 → 项目级台账行(仅纳入在 projects 中的项目)。金额节点级,状态 progress 三态。 */
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
    out.push({
      projectId: pid,
      projectName: p.projectName || pid,
      projectManager: (p.projectManager ?? '').trim() || '未指定',
      orgL4: nodes[0].dept,
      tier: nodes[0].tier,
      projectAmount: p.paymentPmis?.contract ?? 0,
      expectedPayment, actualPayment, remainingAmount,
      paymentRatio: r,
      paymentStatus: r >= 0.999 ? '已全额回款' : r > 0 ? '部分回款' : '未回款',
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
    out = opts.status === '延期' ? out.filter((r) => r.delayed) : out.filter((r) => r.paymentStatus === opts.status)
  }
  if (q) out = out.filter((r) =>
    (String(r.projectId) + r.projectName + r.projectManager + r.orgL4).toLowerCase().includes(q))
  return [...out].sort((a, b) => (b.projectAmount || 0) - (a.projectAmount || 0))
}

export interface LedgerSummaryPmis { projectCount: number; totalExp: number; totalAct: number; totalRem: number; rate: number }
export function ledgerSummaryPmis(rows: LedgerProjectRow[]): LedgerSummaryPmis {
  const totalExp = rows.reduce((s, r) => s + r.expectedPayment, 0)
  const totalAct = rows.reduce((s, r) => s + r.actualPayment, 0)
  return { projectCount: rows.length, totalExp, totalAct, totalRem: totalExp - totalAct, rate: totalExp > 0 ? totalAct / totalExp : 0 }
}

const LEDGER_TIERS_PMIS = ['100万以上', '50-100万', '50万以下']
export interface LedgerTierStatPmis { tier: string; count: number; expWan: number; remWan: number }
export function ledgerTierStatsPmis(rows: LedgerProjectRow[]): LedgerTierStatPmis[] {
  return LEDGER_TIERS_PMIS.map((t) => {
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

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/ledger.test.ts`
Expected: PASS（含旧用例不受影响）

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无报错

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/ledger.ts frontend/src/lib/ledger.test.ts
git commit -m "$(cat <<'EOF'
feat(3c): lib/ledger 增收款阶段口径函数(ledgerRows+filter+summary/tier/status)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: LedgerTable 下钻改读行自带 nodes（删 rawNodes prop）

**Files:**
- Modify: `frontend/src/components/LedgerTable.vue`
- Test: `frontend/src/components/LedgerTable.test.ts`

- [ ] **Step 1: 改测试先失败** — 把 `LedgerTable.test.ts` 的 fixture 与 mount 改为行自带 nodes（删 rawNodes prop）：

```ts
const columns = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
]
const projects = [{ projectId: 'P1', projectName: '甲', nodes: [
  { stage: '到货款', planDate: '2026-06-06', receivedAmount: 50000, unpaidAmount: 150000, actualRatio: 0.25, status: '部分回款' },
] }]

function mountLT() {
  return mount(LedgerTable, {
    props: { tableId: 'ledgerTable', projects, columns, sourceRows: projects },
    global: { plugins: [ElementPlus] },
  })
}
```
第二个用例（展开下钻）断言改为：
```ts
  it('点击行展开收款阶段节点明细，再点收起', async () => {
    const w = mountLT()
    await w.find('tr.lt-row').trigger('click')
    expect(w.text()).toContain('回款节点明细')
    expect(w.text()).toContain('到货款')
    await w.find('tr.lt-row').trigger('click')
    expect(w.text()).not.toContain('回款节点明细')
  })
```
（第一个用例"渲染表头/行/记录数"保持，只是 mount 不再传 rawNodes。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/LedgerTable.test.ts`
Expected: FAIL（旧组件要求 rawNodes prop / projNodes 读 rawNodes 取不到 '到货款'）

- [ ] **Step 3: 换源** — `LedgerTable.vue`：

(a) `<script setup>` 删 `import { getNodeRemaining } from '@/lib/riskGroups'`；`fmtRatio` 保留、`fmtYuan` 保留。

(b) props 删 `rawNodes`：
```ts
const props = defineProps<{
  tableId: string
  projects: Record<string, any>[]
  columns: LedgerCol[]
  sourceRows: Record<string, any>[]
}>()
```

(c) 删 `projNodes` 函数（不再按 rawNodes 过滤）。

(d) 下钻模板段（`<tr v-if="expandedIdx === idx" ...>` 内）改为读 `p.nodes`：
```vue
          <tr v-if="expandedIdx === idx" class="lt-detail-row">
            <td :colspan="columns.length">
              <div class="lt-detail">
                <div class="lt-detail-title">
                  {{ p.projectName || p.projectId }}
                  <span class="lt-detail-id">项目编号: {{ p.projectId }}</span>
                </div>
                <div v-if="(p.nodes || []).length" class="lt-nodes">
                  <div class="lt-nodes-title">回款节点明细 ({{ p.nodes.length }})</div>
                  <table class="lt-node-table">
                    <thead>
                      <tr>
                        <th>阶段</th><th>计划日期</th><th>已收(元)</th><th>未收(元)</th><th>实际比例</th><th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(n, ni) in p.nodes" :key="ni">
                        <td>{{ n.stage || '-' }}</td>
                        <td>{{ n.planDate || '-' }}</td>
                        <td>{{ fmtYuan(n.receivedAmount) }}</td>
                        <td>{{ fmtYuan(n.unpaidAmount) }}</td>
                        <td>{{ fmtRatio(n.actualRatio, '待上报') }}</td>
                        <td>{{ n.status }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-else class="lt-nodes-empty">无回款节点</div>
              </div>
            </td>
          </tr>
```

(e) **同步去掉 LedgerView 对它的传参**（否则 vue-tsc 报多传未知 prop）——`frontend/src/views/LedgerView.vue` 模板里 `<LedgerTable>` 删掉 `:raw-nodes="rawNodes"` 一行（其余 props 不变）：
```vue
    <LedgerTable
      :table-id="TABLE_ID"
      :projects="displayed"
      :columns="columns"
      :source-rows="baseProjs as Record<string, any>[]"
    />
```
（此步只删这一行；LedgerView 的 `rawNodes` computed 仍被旧 baseProjs 使用，留到 Task4 一并换源。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/LedgerTable.test.ts src/views/LedgerView.test.ts`
Expected: PASS（LedgerTable 新；LedgerView 旧 seed 仍过——drill 未在旧用例断言）

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无报错（LedgerView 已不再传 raw-nodes）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/LedgerTable.vue frontend/src/views/LedgerView.vue frontend/src/components/LedgerTable.test.ts
git commit -m "$(cat <<'EOF'
feat(3c): LedgerTable 下钻改读行自带收款阶段 nodes(删 rawNodes prop)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: LedgerView 换源 + status-row 4 卡

**Files:**
- Modify: `frontend/src/views/LedgerView.vue`
- Test: `frontend/src/views/LedgerView.test.ts`

- [ ] **Step 1: 改测试先失败** — 把 `LedgerView.test.ts` 的 `seed()` 换收款阶段，并加 4 状态卡断言。`seed()` body 改为：

```ts
function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    projects: [
      { projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '北京', paymentPmis: { contract: 2000000 } },
      { projectId: 'P2', projectName: '乙', projectManager: '李', orgL4: '上海', paymentPmis: { contract: 300000 } },
    ],
    projectPmis: {},
    paymentNodes: {
      P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.5, expectedPayment: 1000000, receivedAmount: 0, unpaidAmount: 1000000, actualRatio: 0, status: '延期' }],
      P2: [{ stage: '预付款', planDate: '2026-02-01', actualDate: '2026-02-02', payRatio: 1, expectedPayment: 200000, receivedAmount: 200000, unpaidAmount: 0, actualRatio: 1, status: '已回款' }],
    },
  } as any
}
```
并在第一个用例加断言（4 状态卡 + 状态列 progress）：
```ts
  it('渲染汇总条/状态行(4卡)/分层卡/表格(收款阶段口径)', () => {
    seed()
    const w = mount(LedgerView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('计划回款总金额(万)')
    expect(w.text()).toContain('120')          // fmtWan(1000000+200000)=120
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('P2')
    expect(w.text()).toContain('已全额回款')     // 状态卡 + P2 状态列
    expect(w.text()).toContain('未回款')         // P1 状态列(已收0)
    expect(w.text()).toContain('延期')           // 状态卡(P1 有延期节点)
    expect(w.findComponent({ name: 'LedgerTable' }).exists()).toBe(true)
  })
```
（"搜索按经理过滤"用例不改逻辑，新 seed 下 P2 经理='李'，断言仍成立。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/LedgerView.test.ts`
Expected: FAIL（旧 LedgerView 读 rawNodes，新 seed 无 → 表空/无 120/状态卡仍旧 6 态文案）

- [ ] **Step 3: 换源** — 改 `LedgerView.vue` 的 `<script setup>` 与 status-row 模板：

(a) import 段：删 `import { groupByProject } from '@/lib/dashboardStats'`；ledger import 改为新函数 + 保留 excludeFilter；增 paymentNodeRows：
```ts
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { paymentNodeRows } from '@/lib/paymentPmis'
import { ledgerRows, filterLedgerRows, ledgerSummaryPmis, ledgerTierStatsPmis, ledgerStatusCountsPmis } from '@/lib/ledger'
import { applyColumnFilters } from '@/lib/crossFilter'
import { fmtWan, fmtYuan, pct } from '@/lib/format'
import LedgerTable from '@/components/LedgerTable.vue'
```

(b) `STATUS_OPTS` 改：
```ts
const STATUS_OPTS = ['已全额回款', '部分回款', '未回款', '延期']
```

(c) 数据源 computeds 改（替换原 `rawNodes`/`baseProjs`/`searched`）：
```ts
const allRows = computed(() =>
  ledgerRows(
    paymentNodeRows(data.data?.paymentNodes, data.data?.projects ?? [], data.data?.projectPmis),
    data.data?.projects ?? [],
  ),
)
const baseProjs = computed(() =>
  filter.excludeOn ? allRows.value.filter((r) => !filter.excludedIds[r.projectId]) : allRows.value,
)
const searched = computed(() =>
  filterLedgerRows(baseProjs.value, { search: search.value, tier: tierSel.value, status: statusSel.value }),
)
const displayed = computed(
  () => applyColumnFilters(searched.value as any, cf.tableFilters(TABLE_ID)) as any[],
)
const summary = computed(() => ledgerSummaryPmis(displayed.value as any))
const tierStats = computed(() => ledgerTierStatsPmis(displayed.value as any))
const statusCounts = computed(() => ledgerStatusCountsPmis(displayed.value as any))
```
（`columns` 定义**不改**——新行字段名一致。）

(d) 模板 status-row 6 卡改 **4 卡**：
```vue
    <div class="status-row">
      <div class="st-card"><div class="st-label">已全额回款</div><div class="st-val" style="color:var(--c-paid)">{{ statusCounts.fullPaid }}</div></div>
      <div class="st-card"><div class="st-label">部分回款</div><div class="st-val" style="color:var(--c-pending)">{{ statusCounts.partial }}</div></div>
      <div class="st-card"><div class="st-label">未回款</div><div class="st-val" style="color:var(--accent)">{{ statusCounts.unpaid }}</div></div>
      <div class="st-card"><div class="st-label">延期</div><div class="st-val" style="color:var(--danger)">{{ statusCounts.delayed }}</div></div>
    </div>
```

(e) 模板 `<LedgerTable>` 的 `:raw-nodes` 已在 Task3 删除，本任务**不再动该行**；此处 `rawNodes` computed 也随 (c) 数据源替换被删（确认 LedgerView 内不再有 `rawNodes` 引用）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/LedgerView.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无报错（Task3 的 LedgerTable 已删 rawNodes prop，本步 LedgerView 同步去掉 → 全绿）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/LedgerView.vue frontend/src/views/LedgerView.test.ts
git commit -m "$(cat <<'EOF'
feat(3c): LedgerView 换收款阶段口径 + status-row 进度3态+延期(4卡)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 版本 V1.6.5 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 升版本** — `frontend/src/version.ts`：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.6.5'
export const RELEASE_DATE = '2026-06-17'
```

- [ ] **Step 2: 更新 PROGRESS.md** — 在「全局下线 rawNodes 程序」条目里，把 "③-⑤ 3C 台账 / 3D 日历 / 3E 移除后端 rawNodes 待开" 改写为 ③3C 已做、"④-⑤ … 待开"，紧随 ②3B 描述后插入：

```markdown
③**3C 回款台账 /ledger 换源（spec/plan 2026-06-17-3C-ledger-collection-source，V1.6.5，feat/3c-ledger-source）**：纯前端——LedgerView 从 rawNodes(groupByProject 旧6态)换到收款阶段口径(paymentNodes 按项目聚合)。新增 lib/ledger 收款阶段函数(ledgerRows/filterLedgerRows/ledgerSummaryPmis/ledgerTierStatsPmis/ledgerStatusCountsPmis);PayNodeRow 增 actualRatio;状态 6态→进度3态(已全额/部分/未回款)+延期(正交卡+筛选项);金额节点级(Σ已收/计划/未收,完成率=Σ已收÷Σ计划);LedgerTable 下钻改读行自带 nodes(删 rawNodes prop)、列改 阶段/计划日/已收/未收/实际比例/状态(5态);CF 列筛选保留。**不动**后端、filteredNodes、excludeFilter(3D 共用)、groupByProject(旧 ProjectAgg 版 ledger 函数留死待 3E)。④-⑤ 3D 日历 / 3E 移除后端 rawNodes 待开。
```

- [ ] **Step 3: typecheck + 全量 verify.sh**

Run: `cd frontend && npm run typecheck` → 无报错
Run: `bash verify.sh`
Expected: python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

- [ ] **Step 4: 手验（建议）** — build 后手验 `/ledger`：项目行/4 状态卡/分层/搜索/区间/状态筛选(含延期)/列筛选/行下钻收款阶段节点均正常，无 JS 报错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "$(cat <<'EOF'
chore(3c): 版本 V1.6.5 + PROGRESS(回款台账换源)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完成定义

- 5 任务全部提交；`bash verify.sh` 全绿。
- `/ledger` 由收款阶段口径驱动：项目行金额节点级、状态进度3态+延期4卡、下钻收款阶段节点5态、搜索/区间/状态/列筛选生效。
- 版本 V1.6.5；PROGRESS 已记。
- 未触碰：后端、`filteredNodes`、`excludeFilter`、`groupByProject`、旧 ProjectAgg 版 ledger 函数、仓库根未跟踪文件。
