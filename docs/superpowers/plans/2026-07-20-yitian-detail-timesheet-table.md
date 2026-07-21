# 倚天工时明细表 `/yitian/detail` 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在倚天工时域新增一张逐条工时明细表 `/yitian/detail`（形如 /projects），并给各统计页加"→ 明细"下钻入口。

**Architecture:** 纯前端。数据层两个纯函数模块（`lib/yitian/detail.ts` 还原+过滤+汇总+导出、`lib/yitian/detailDrill.ts` 下钻 query 编解码），视图层一个页面 `YitianDetailView.vue`（复刻 ProjectsView 的选列/表头筛选/横滚/持久化 + 复刻 analytics 的下钻落地范式），四个统计页各加一个"明细"操作列。不改后端/累积库/schema。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + Vitest。复用既有件：DataTable / ColumnFilter / ColumnPicker / crossFilter store / useColumnPrefs / usePersistentSort / useViewScrollMemory / YitianToolbar / exportXlsx / metrics / compliance(ISSUE_LABELS)。

## Global Constraints

- 交流/文案：简体中文。**不使用任何 emoji**。
- 设计令牌：颜色/间距/圆角/阴影只引用 `theme.css` 令牌，**不手写散值**；数字列必须挂 `.u-num`；状态三态用「淡底+深字」。
- 版本单一来源 `frontend/src/version.ts`；本功能为 Y 级：`V4.0.5 → V4.1.0`，`RELEASE_DATE = '2026-07-20'`。
- 数据契约：`issues[].i` 是**全量 `data.entries` 的原始下标**，还原明细必须带原始下标遍历全量 entries，**绝不先过滤再还原**。
- 下钻契约键只用 `dL4 / dEmp / dStart / dEnd / dOnly`（不设 `dCustomer/dIssue/dType` 等无入口死键）。
- 新页面 `pageKey: 'yitian-detail'` 必须在 `lib/pageAccess.ts` 的 `PageKey` 注册，否则 typecheck 红 + 权限门禁不认。
- 验证：每个任务末尾 `cd frontend && npm run test:run`（或指定文件）；全部完成后根目录 `bash verify.sh` 全绿。
- 提交信息结尾加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

## 文件结构

**新建：**
- `frontend/src/lib/yitian/detailDrill.ts` — 下钻 query 编解码（`DetailDrill` + `buildDetailDrill` + `parseDetailDrill`）
- `frontend/src/lib/yitian/detailDrill.test.ts`
- `frontend/src/lib/yitian/detail.ts` — `DetailRow` + 列常量 + `buildDetailRows`/`filterDetailRows`/`detailSummary`/`buildDetailSheetRows`
- `frontend/src/lib/yitian/detail.test.ts`
- `frontend/src/views/YitianDetailView.vue` — 明细页
- `frontend/src/views/YitianDetailView.test.ts`

**修改：**
- `frontend/src/lib/pageAccess.ts` — `PageKey` 加 `'yitian-detail'`
- `frontend/src/nav.ts` — `YITIAN_LINKS` 加 link
- `frontend/src/router/index.ts` — import + 路由
- `frontend/src/router/index.test.ts` — 断言
- `frontend/src/version.ts` — V4.1.0
- `frontend/src/views/YitianOverviewView.vue` (+`.test.ts`) — 组织表明细列 → `dL4`
- `frontend/src/views/YitianAnalyticsView.vue` (+`.test.ts`) — 员工表明细列 → `dEmp`
- `frontend/src/views/YitianComplianceView.vue` (+`.test.ts`) — 问题表明细列 → `dEmp`+`dOnly`
- `frontend/src/views/YitianCustomerView.vue` (+`.test.ts`) — TOP1000 表明细列 → `dL4`

---

### Task 1: 下钻 query 编解码 `detailDrill.ts`

**Files:**
- Create: `frontend/src/lib/yitian/detailDrill.ts`
- Test: `frontend/src/lib/yitian/detailDrill.test.ts`

**Interfaces:**
- Consumes: 无（最底层纯函数）
- Produces:
  - `interface DetailDrill { l4?: string; emp?: string; start?: string; end?: string; only?: boolean }`
  - `buildDetailDrill(d: DetailDrill): Record<string, string>`
  - `parseDetailDrill(q: Record<string, any>): DetailDrill`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/yitian/detailDrill.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildDetailDrill, parseDetailDrill } from './detailDrill'

describe('detailDrill', () => {
  it('buildDetailDrill 空字段不输出', () => {
    expect(buildDetailDrill({})).toEqual({})
    expect(buildDetailDrill({ l4: '银行服务组' })).toEqual({ dL4: '银行服务组' })
  })

  it('buildDetailDrill 全字段 + only 输出 "1"', () => {
    expect(buildDetailDrill({ emp: 'A1', start: '2026-06-01', end: '2026-06-02', only: true }))
      .toEqual({ dEmp: 'A1', dStart: '2026-06-01', dEnd: '2026-06-02', dOnly: '1' })
  })

  it('parseDetailDrill 往返一致', () => {
    const d = { l4: '浙江服务组', emp: 'A2', only: true }
    expect(parseDetailDrill(buildDetailDrill(d))).toEqual(d)
  })

  it('parseDetailDrill 数组 query 取首项、未知键忽略、dOnly 非 "1" 不置真', () => {
    expect(parseDetailDrill({ dL4: ['x', 'y'], zzz: '1', dOnly: '0' })).toEqual({ l4: 'x' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/detailDrill.test.ts`
Expected: FAIL（`Cannot find module './detailDrill'`）

- [ ] **Step 3: 写实现**

`frontend/src/lib/yitian/detailDrill.ts`:
```ts
// 倚天工时明细页下钻 query 编解码。独立于 drill.ts(其 scroll 是 analytics 专属),
// 但沿用同一"d 前缀键 + 空字段不输出 + 数组取首项"风格。
// 只设有干净入口的维度键(dL4/dEmp/dOnly)+ 预留周期(dStart/dEnd);不设 dCustomer/dIssue/dType 死键。

export interface DetailDrill {
  l4?: string
  emp?: string      // 员工工号(精确,避同名)
  start?: string
  end?: string
  only?: boolean    // 仅看异常
}

function firstStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v) return v
  if (Array.isArray(v)) return firstStr(v[0])
  return undefined
}

export function buildDetailDrill(d: DetailDrill): Record<string, string> {
  const q: Record<string, string> = {}
  if (d.l4) q.dL4 = d.l4
  if (d.emp) q.dEmp = d.emp
  if (d.start) q.dStart = d.start
  if (d.end) q.dEnd = d.end
  if (d.only) q.dOnly = '1'
  return q
}

export function parseDetailDrill(q: Record<string, any>): DetailDrill {
  const out: DetailDrill = {}
  const l4 = firstStr(q.dL4); if (l4) out.l4 = l4
  const emp = firstStr(q.dEmp); if (emp) out.emp = emp
  const start = firstStr(q.dStart); if (start) out.start = start
  const end = firstStr(q.dEnd); if (end) out.end = end
  if (firstStr(q.dOnly) === '1') out.only = true
  return out
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/yitian/detailDrill.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/detailDrill.ts frontend/src/lib/yitian/detailDrill.test.ts
git commit -m "feat(yitian): 明细页下钻 query 编解码 detailDrill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 明细数据层 `detail.ts`

**Files:**
- Create: `frontend/src/lib/yitian/detail.ts`
- Test: `frontend/src/lib/yitian/detail.test.ts`

**Interfaces:**
- Consumes: `YitianData`（`@/types/yitian`）、`ISSUE_LABELS`（`./compliance`）、`NO_L3/NO_L31/NO_L4`（`./metrics`）、`DataColumn`（`@/components/DataTable.vue`）
- Produces:
  - `interface DetailRow { date; empId; empName; l2; l3; l31; l4; category; type; hours; workType3; customer; productLine; productName; projectType; serviceMode; salesL2; workOrder; top; ok; okText; issueReason; snippet }`
  - `interface DetailFilter { start?: string; end?: string; l4s?: string[]; onlyIssues?: boolean }`
  - `interface DetailSummary { count; totalHours; ok; warn; issue }`
  - `buildDetailRows(data: YitianData): DetailRow[]`
  - `filterDetailRows(rows: DetailRow[], f: DetailFilter): DetailRow[]`
  - `detailSummary(rows: DetailRow[]): DetailSummary`
  - `buildDetailSheetRows(rows: DetailRow[], cols: DataColumn[]): Record<string, unknown>[]`
  - `ALL_COLUMNS: DataColumn[]`, `ALL_KEYS: string[]`, `DEFAULT_VISIBLE: string[]`, `FILTERABLE: Set<string>`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/yitian/detail.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  buildDetailRows, filterDetailRows, detailSummary, buildDetailSheetRows,
  ALL_COLUMNS, DEFAULT_VISIBLE, FILTERABLE,
} from './detail'
import type { YitianData } from '@/types/yitian'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 3,
          employees: 2, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: 'BG1', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '交付' },
    { id: 'A2', name: '李四', l2: 'BG1', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '交付' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: ['某客户'], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO1', top: true, ok: 2, iss: ['MISS_SUMMARY'] },
    { d: '2026-06-02', e: 'A2', t: 0, h: 6, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO2', top: false, ok: 1, iss: ['HINT_PRESALE_PRODUCT'] },
    { d: '2026-06-02', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
  ],
  issues: [
    { i: 0, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '张三的正文' },
    { i: 1, codes: ['HINT_PRESALE_PRODUCT'], msgs: [], snippet: '' },
  ],
} as unknown as YitianData

describe('buildDetailRows', () => {
  it('逐条还原:码表 + roster join,行数 = 全量 entries', () => {
    const rows = buildDetailRows(DATA)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ empName: '张三', l4: '银行服务组', type: '项目类', customer: '某客户', workOrder: 'WO1', top: true, ok: 2, okText: '问题' })
    expect(rows[1]).toMatchObject({ empName: '李四', ok: 1, okText: '提示', customer: '' })
    expect(rows[2]).toMatchObject({ empName: '张三', ok: 0, okText: '合规', issueReason: '' })
  })

  it('issueReason:有 msgs 用 msgs、msgs 空用 codes→ISSUE_LABELS 兜底;snippet 仅问题行(ok=2)', () => {
    const rows = buildDetailRows(DATA)
    expect(rows[0].issueReason).toBe('缺少工作概述')
    expect(rows[0].snippet).toBe('张三的正文')
    expect(rows[1].issueReason).toBe('售前服务类产品类别不应为「其他」') // codes 兜底(msgs 空)
    expect(rows[1].snippet).toBe('') // ok=1 不带 snippet
  })
})

describe('filterDetailRows', () => {
  it('日期区间闭边界', () => {
    const rows = buildDetailRows(DATA)
    expect(filterDetailRows(rows, { start: '2026-06-02', end: '2026-06-02' })).toHaveLength(2)
  })
  it('L4 粗筛(l4s 空=不筛)', () => {
    const rows = buildDetailRows(DATA)
    expect(filterDetailRows(rows, { l4s: [] })).toHaveLength(3)
    expect(filterDetailRows(rows, { l4s: ['浙江服务组'] }).map((r) => r.empName)).toEqual(['李四'])
  })
  it('onlyIssues 只留 ok!=0', () => {
    const rows = buildDetailRows(DATA)
    expect(filterDetailRows(rows, { onlyIssues: true })).toHaveLength(2)
  })
})

describe('detailSummary', () => {
  it('总条数/总工时/三态计数', () => {
    const s = detailSummary(buildDetailRows(DATA))
    expect(s).toEqual({ count: 3, totalHours: 22, ok: 1, warn: 1, issue: 1 })
  })
})

describe('列常量 + 导出', () => {
  it('DEFAULT_VISIBLE ⊂ ALL_COLUMNS 的 key;okText 可筛、date 不可筛', () => {
    const keys = new Set(ALL_COLUMNS.map((c) => c.key))
    expect(DEFAULT_VISIBLE.every((k) => keys.has(k))).toBe(true)
    expect(FILTERABLE.has('okText')).toBe(true)
    expect(FILTERABLE.has('date')).toBe(false)
  })
  it('buildDetailSheetRows 按可见列用中文列名作键、不含 snippet', () => {
    const rows = buildDetailRows(DATA)
    const cols = ALL_COLUMNS.filter((c) => ['empName', 'okText'].includes(c.key))
    const out = buildDetailSheetRows(rows, cols)
    expect(out[0]).toEqual({ 员工: '张三', 合规状态: '问题' })
    expect(JSON.stringify(out)).not.toContain('正文')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/detail.test.ts`
Expected: FAIL（`Cannot find module './detail'`）

- [ ] **Step 3: 写实现**

`frontend/src/lib/yitian/detail.ts`:
```ts
import type { DataColumn } from '@/components/DataTable.vue'
import type { YitianData } from '@/types/yitian'
import { ISSUE_LABELS } from './compliance'
import { NO_L3, NO_L31, NO_L4 } from './metrics'

export interface DetailRow {
  date: string
  empId: string
  empName: string
  l2: string
  l3: string
  l31: string
  l4: string
  category: string
  type: string
  hours: number
  workType3: string
  customer: string
  productLine: string
  productName: string
  projectType: string
  serviceMode: string
  salesL2: string
  workOrder: string
  top: boolean
  ok: number
  okText: string
  issueReason: string
  snippet: string
}

const OK_TEXT = ['合规', '提示', '问题'] // 下标 = ok(0/1/2)

/** 逐条还原全量 entries → 明细行。
 *  issues[].i 是全量 entries 的原始下标,必须带 index 遍历全量数组(不可先过滤,否则下标失配)。 */
export function buildDetailRows(data: YitianData): DetailRow[] {
  const byId = new Map(data.roster.map((p) => [p.id, p]))
  const d = data.dims
  const dv = (arr: string[], i: number | null | undefined): string =>
    i === null || i === undefined ? '' : (arr[i] ?? '')
  const issueAt = new Map<number, { msgs: string[]; codes: string[]; snippet: string }>()
  for (const it of data.issues) {
    issueAt.set(it.i, { msgs: it.msgs ?? [], codes: it.codes ?? [], snippet: it.snippet ?? '' })
  }
  return data.entries.map((e, i) => {
    const p = byId.get(e.e)
    const iss = issueAt.get(i)
    const codes = iss?.codes ?? e.iss ?? []
    const msgs = iss?.msgs ?? []
    const issueReason = msgs.length
      ? msgs.join('；')
      : codes.map((c) => ISSUE_LABELS[c] ?? c).join('；')
    return {
      date: e.d,
      empId: e.e,
      empName: p?.name ?? '',
      l2: p?.l2 || '',
      l3: p?.l3 || NO_L3,
      l31: p?.l31 || NO_L31,
      l4: p?.l4 || NO_L4,
      category: p?.category || '',
      type: dv(d.types, e.t),
      hours: e.h,
      workType3: dv(d.workTypes, e.wt),
      customer: dv(d.customers, e.cu),
      productLine: dv(d.products, e.pl),
      productName: dv(d.productNames, e.pn),
      projectType: dv(d.projectTypes, e.pt),
      serviceMode: dv(d.serviceModes, e.sm),
      salesL2: dv(d.salesL2, e.bg),
      workOrder: e.wo ?? '',
      top: !!e.top,
      ok: e.ok,
      okText: OK_TEXT[e.ok] ?? '合规',
      issueReason,
      snippet: e.ok === 2 ? (iss?.snippet ?? '') : '', // 正文摘要仅问题行下发
    }
  })
}

export interface DetailFilter {
  start?: string
  end?: string
  l4s?: string[]
  onlyIssues?: boolean
}

/** 日期区间 + L4 粗筛(对应 YitianToolbar view.l4s) + 仅看异常。全在还原之后做。 */
export function filterDetailRows(rows: DetailRow[], f: DetailFilter): DetailRow[] {
  const { start, end, l4s = [], onlyIssues } = f
  const allow = new Set(l4s)
  return rows.filter((r) => {
    if (start && r.date < start) return false
    if (end && r.date > end) return false
    if (allow.size && !allow.has(r.l4)) return false
    if (onlyIssues && r.ok === 0) return false
    return true
  })
}

export interface DetailSummary {
  count: number
  totalHours: number
  ok: number
  warn: number
  issue: number
}

export function detailSummary(rows: DetailRow[]): DetailSummary {
  let totalHours = 0, ok = 0, warn = 0, issue = 0
  for (const r of rows) {
    totalHours += r.hours
    if (r.ok === 2) issue++
    else if (r.ok === 1) warn++
    else ok++
  }
  return { count: rows.length, totalHours: Math.round(totalHours * 10) / 10, ok, warn, issue }
}

export const ALL_COLUMNS: DataColumn[] = [
  { key: 'date', label: '日期', width: 110, sortable: true },
  { key: 'empName', label: '员工', width: 90 },
  { key: 'l4', label: 'L4组织', width: 120 },
  { key: 'l3', label: 'L3组织', width: 120 },
  { key: 'l31', label: 'L3-1组织', width: 120 },
  { key: 'l2', label: 'L2组织', width: 120 },
  { key: 'category', label: '序列', width: 90 },
  { key: 'type', label: '工时类型', width: 110 },
  { key: 'hours', label: '工时', width: 80, sortable: true, num: true },
  { key: 'workType3', label: '工作类型三', width: 120 },
  { key: 'customer', label: '客户', width: 140 },
  { key: 'productLine', label: '产品线', width: 120 },
  { key: 'productName', label: '产品名', width: 140 },
  { key: 'projectType', label: '项目类型', width: 110 },
  { key: 'serviceMode', label: '服务方式', width: 110 },
  { key: 'salesL2', label: '销售L2', width: 120 },
  { key: 'workOrder', label: '工单号', width: 130 },
  { key: 'top', label: 'TOP客户', width: 90, formatter: (v) => (v ? '是' : '') },
  { key: 'okText', label: '合规状态', width: 100 },
  { key: 'issueReason', label: '问题原因', width: 240, wrap: true },
]
export const ALL_KEYS: string[] = ALL_COLUMNS.map((c) => c.key)
export const DEFAULT_VISIBLE: string[] = ['date', 'empName', 'l4', 'type', 'hours', 'customer', 'workOrder', 'okText', 'issueReason']
export const FILTERABLE = new Set(['l4', 'l2', 'l3', 'l31', 'category', 'type', 'workType3', 'projectType', 'serviceMode', 'salesL2', 'top', 'okText', 'customer', 'empName'])

/** 导出行:按传入的可见列,用中文列名作键;走 formatter(如 top→是/空);不含 snippet 正文。 */
export function buildDetailSheetRows(rows: DetailRow[], cols: DataColumn[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {}
    for (const c of cols) {
      const raw = (r as Record<string, unknown>)[c.key]
      o[c.label] = c.formatter ? c.formatter(raw, r as Record<string, any>) : raw
    }
    return o
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/yitian/detail.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/detail.ts frontend/src/lib/yitian/detail.test.ts
git commit -m "feat(yitian): 工时明细数据层 detail(还原/过滤/汇总/导出+列常量)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 明细页视图本体 `YitianDetailView.vue`（不含下钻落地）

**Files:**
- Create: `frontend/src/views/YitianDetailView.vue`
- Test: `frontend/src/views/YitianDetailView.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `detail.ts` 全部导出；`YitianToolbar`、`DataTable`/`ColumnFilter`/`ColumnPicker`、`useYitianStore`、`useYitianViewStore`、`useCrossFilterStore`、`applyColumnFilters`/`cfUniqueValues`、`useColumnPrefs`、`usePersistentSort`、`useViewScrollMemory`、`userScopedKey`、`exportSheets`
- Produces: 默认导出组件；`defineExpose` 暴露 `{ rows, scoped, filtered, paged, summary, onlyIssues, visibleColumns, onExport }` 供测试与 Task 5

- [ ] **Step 1: 写失败测试**

`frontend/src/views/YitianDetailView.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianDetailView from './YitianDetailView.vue'
import { useCrossFilterStore } from '@/stores/crossFilter'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 3,
          employees: 2, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: 'BG1', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '交付' },
    { id: 'A2', name: '李四', l2: 'BG1', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '交付' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: ['某客户'], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO1', top: true, ok: 2, iss: ['MISS_SUMMARY'] },
    { d: '2026-06-02', e: 'A2', t: 0, h: 6, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO2', top: false, ok: 1, iss: ['HINT_PRESALE_PRODUCT'] },
    { d: '2026-06-02', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
  ],
  issues: [
    { i: 0, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '正文' },
    { i: 1, codes: ['HINT_PRESALE_PRODUCT'], msgs: [], snippet: '' },
  ],
} as unknown as YitianData

let router: Router
function mountView() {
  return mount(YitianDetailView, { global: { plugins: [ElementPlus, router] } })
}

describe('YitianDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/yitian/detail', component: YitianDetailView },
      ],
    })
  })

  it('渲染逐条明细(全量 3 条)', async () => {
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).filtered).toHaveLength(3)
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('缺少工作概述')
  })

  it('汇总:总条数/三态计数随「仅看异常」变化', async () => {
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).summary).toMatchObject({ count: 3, ok: 1, warn: 1, issue: 1 })
    ;(w.vm as any).onlyIssues = true
    await flushPromises()
    expect((w.vm as any).filtered).toHaveLength(2)
  })

  it('表头 ColumnFilter 经 crossFilter 生效(按 okText 筛)', async () => {
    const w = mountView()
    await flushPromises()
    useCrossFilterStore().setColumnFilter('yitian-detail', 'okText', ['问题'], 3)
    await flushPromises()
    expect((w.vm as any).filtered.map((r: any) => r.empName)).toEqual(['张三'])
  })

  it('分页:每页 50,filtered 保留全量', async () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      d: i % 2 === 0 ? '2026-06-01' : '2026-06-02', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: `W${i}`, top: false, ok: 0, iss: [],
    }))
    getSpy.mockResolvedValue({ ...DATA, entries, issues: [] } as unknown as YitianData)
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).filtered.length).toBe(60)
    expect((w.vm as any).paged.length).toBe(50)
  })

  it('页面有内边距容器', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.yd-view').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/YitianDetailView.test.ts`
Expected: FAIL（`Failed to resolve import './YitianDetailView.vue'`）

- [ ] **Step 3: 写实现**

`frontend/src/views/YitianDetailView.vue`:
```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { usePersistentSort } from '@/lib/usePersistentSort'
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'
import { userScopedKey } from '@/lib/userScopedKey'
import { exportSheets } from '@/lib/exportXlsx'
import {
  buildDetailRows, filterDetailRows, detailSummary, buildDetailSheetRows,
  ALL_COLUMNS, ALL_KEYS, DEFAULT_VISIBLE, FILTERABLE,
} from '@/lib/yitian/detail'

const TABLE_ID = 'yitian-detail'
const store = useYitianStore()
const view = useYitianViewStore()
const cf = useCrossFilterStore()

const onlyIssues = ref(false)
const prefs = useColumnPrefs(userScopedKey(TABLE_ID), ALL_KEYS, DEFAULT_VISIBLE)
const psort = usePersistentSort(userScopedKey(TABLE_ID))
useViewScrollMemory()

const ready = computed(() => !!store.data)
const rows = computed(() => (store.data ? buildDetailRows(store.data) : []))
const scoped = computed(() => filterDetailRows(rows.value, {
  start: view.start, end: view.end, l4s: view.l4s, onlyIssues: onlyIssues.value,
}))
const filtered = computed(() => applyColumnFilters(scoped.value, cf.tableFilters(TABLE_ID)) as typeof scoped.value)
const summary = computed(() => detailSummary(filtered.value))

const pickerColumns = computed(() => ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label })))
const onToggle = prefs.makeToggle(cf, TABLE_ID)
const visibleColumns = computed<DataColumn[]>(() =>
  prefs.visibleKeys.value
    .map((k) => ALL_COLUMNS.find((c) => c.key === k))
    .filter((c): c is DataColumn => !!c))

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

function onExport() {
  if (!filtered.value.length) { ElMessage.warning('无可导出数据'); return }
  exportSheets('工时明细.xlsx', [{ name: '工时明细', rows: buildDetailSheetRows(filtered.value, visibleColumns.value) }])
}

onMounted(() => { store.load() })

defineExpose({ rows, scoped, filtered, paged, summary, onlyIssues, visibleColumns, onExport })
</script>

<template>
  <div class="yd-view">
    <h2 class="yd-title">工时明细</h2>
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />
    <div v-else-if="ready && !rows.length" class="yd-empty">暂无工时数据——请在「数据管理」导入工时并点「更新数据」。</div>

    <template v-else-if="ready">
      <div class="yd-bar">
        <div class="yd-summary u-num">
          <span>共 {{ summary.count }} 条</span>
          <span>总工时 {{ summary.totalHours }}h</span>
          <span class="yd-tag yd-tag--ok">合规 {{ summary.ok }}</span>
          <span class="yd-tag yd-tag--warn">提示 {{ summary.warn }}</span>
          <span class="yd-tag yd-tag--danger">问题 {{ summary.issue }}</span>
        </div>
        <el-switch v-model="onlyIssues" active-text="仅看异常" size="small" />
        <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
          @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
        <el-button size="small" @click="onExport">导出</el-button>
        <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left:auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
      </div>

      <div class="yd-scroll">
        <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable sticky-header
          :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange">
          <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
            <span class="yd-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="scoped" /></span>
          </template>
          <template #cell-okText="{ row }">
            <span class="yd-badge" :class="`yd-badge--${row.ok}`">{{ row.okText }}</span>
          </template>
          <template #cell-issueReason="{ row }">
            <el-tooltip v-if="row.snippet" :content="row.snippet" placement="top">
              <span>{{ row.issueReason }}</span>
            </el-tooltip>
            <span v-else>{{ row.issueReason }}</span>
          </template>
        </DataTable>
      </div>

      <div class="yd-pager">
        <span class="yd-total u-num">共 {{ filtered.length }} 条</span>
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
          :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
          layout="sizes, prev, pager, next" size="small" background />
      </div>
    </template>
  </div>
</template>

<style scoped>
.yd-view { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
.yd-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.yd-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
.yd-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-stack); }
.yd-summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gap-stack); font-size: var(--fs-2); color: var(--sub); }
.yd-tag { padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.yd-tag--ok { background: var(--ok-bg); color: var(--ok-text); }
.yd-tag--warn { background: var(--warn-bg); color: var(--warn-text); }
.yd-tag--danger { background: var(--danger-bg); color: var(--danger-text); }
.yd-scroll { overflow-x: auto; }
.yd-th { display: inline-flex; align-items: center; gap: 4px; }
.yd-badge { padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.yd-badge--0 { background: var(--mut-bg, transparent); color: var(--sub); }
.yd-badge--1 { background: var(--warn-bg); color: var(--warn-text); }
.yd-badge--2 { background: var(--danger-bg); color: var(--danger-text); }
.yd-pager { display: flex; align-items: center; gap: var(--gap-stack); }
.yd-total { font-size: var(--fs-1); color: var(--mut); }
</style>
```

> 注：排序沿用 ProjectsView 模式（`usePersistentSort` + `:rows="paged"` 内置排序，持久化排序状态；不强制全局默认排序）。若 `--mut-bg` 令牌不存在，合规态徽章 `.yd-badge--0` 用 `transparent` 兜底（已写死 fallback）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/YitianDetailView.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无错误（若报 `--mut-bg` 无关的类型错，按报错修）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/YitianDetailView.vue frontend/src/views/YitianDetailView.test.ts
git commit -m "feat(yitian): 工时明细页视图本体(表格/选列/表头筛选/汇总/仅看异常/导出)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 接线（路由 + 导航 + 权限注册 + 版本）

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts:6`
- Modify: `frontend/src/nav.ts:50-51`
- Modify: `frontend/src/router/index.ts:33`（import）、`:109`（路由）
- Modify: `frontend/src/router/index.test.ts`
- Modify: `frontend/src/version.ts`

**Interfaces:**
- Consumes: Task 3 的 `YitianDetailView.vue`
- Produces: 可访问路由 `/yitian/detail`（name `yitian-detail`），导航项，`PageKey` 含 `'yitian-detail'`

- [ ] **Step 1: 改路由测试（失败）**

在 `frontend/src/router/index.test.ts` 的可解析路径清单里加 `/yitian/detail`，并加一条解析断言。找到形如 `for (const path of [... '/yitian' ...])` 的数组，加入 `'/yitian/detail'`；并在文件末尾（`})` 前）加：
```ts
  it('/yitian/detail 解析到 YitianDetailView', () => {
    expect((router.resolve('/yitian/detail').matched[0].components?.default as any).__name).toBe('YitianDetailView')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: FAIL（`/yitian/detail` 解析到占位或 undefined）

- [ ] **Step 3: 实现接线（四处）**

3a. `frontend/src/lib/pageAccess.ts` 第 6 行末尾加 `'yitian-detail'`：
```ts
  | 'yitian' | 'yitian-detail' | 'yitian-compliance' | 'yitian-analytics' | 'yitian-trend' | 'yitian-customer'
```

3b. `frontend/src/nav.ts` `YITIAN_LINKS`，在「倚天工时总览」与「工时合规检查」之间插一行：
```ts
export const YITIAN_LINKS: NavLink[] = [
  { label: '倚天工时总览', to: '/yitian', key: 'yitian' },
  { label: '工时明细', to: '/yitian/detail', key: 'yitian-detail' },
  { label: '工时合规检查', to: '/yitian/compliance', key: 'yitian-compliance' },
  { label: '工时统计分析', to: '/yitian/analytics', key: 'yitian-analytics' },
  { label: '工时趋势分析', to: '/yitian/trend', key: 'yitian-trend' },
  { label: '客户支持分析', to: '/yitian/customer', key: 'yitian-customer' },
]
```

3c. `frontend/src/router/index.ts` 第 33 行后加 import：
```ts
import YitianDetailView from '@/views/YitianDetailView.vue'
```
并在 `/yitian` 路由（约第 109 行）后、`/yitian/compliance` 前插一条：
```ts
    { path: '/yitian/detail', name: 'yitian-detail', component: YitianDetailView, meta: { title: '工时明细', hideFilter: true, pageKey: 'yitian-detail' } },
```

3d. `frontend/src/version.ts`：
```ts
export const APP_VERSION = 'V4.1.0'
export const RELEASE_DATE = '2026-07-20'
```

- [ ] **Step 4: 跑路由测试 + typecheck 确认通过**

Run: `cd frontend && npx vitest run src/router/index.test.ts && npm run typecheck`
Expected: PASS + 无类型错误（`pageKey: 'yitian-detail'` 现已在 `PageKey` 里）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/pageAccess.ts frontend/src/nav.ts frontend/src/router/index.ts frontend/src/router/index.test.ts frontend/src/version.ts
git commit -m "feat(yitian): 接线 /yitian/detail 路由/导航/权限注册 + 升 V4.1.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 下钻落地 `applyDrillLanding`（改 `YitianDetailView.vue`）

**Files:**
- Modify: `frontend/src/views/YitianDetailView.vue`
- Modify: `frontend/src/views/YitianDetailView.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `parseDetailDrill`；`cfUniqueValues`；`useRoute/useRouter`
- Produces: 页面挂载时消费 `route.query` 的下钻键 → 设 cf 筛选 + 日期区间 + onlyIssues，落地后 `router.replace` 清下钻键

- [ ] **Step 1: 加失败测试**

在 `frontend/src/views/YitianDetailView.test.ts` 末尾（最后一个 `})` 前）加：
```ts
  it('下钻落地:dL4+dOnly → 设 cf.l4 + onlyIssues,并清下钻键(保留其它)', async () => {
    await router.push('/yitian/detail?dL4=浙江服务组&dOnly=1&keep=1')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).onlyIssues).toBe(true)
    // 浙江服务组只有 A2(李四) 的一条 ok=1 行,dOnly=1 也保留它
    expect((w.vm as any).filtered.map((r: any) => r.empName)).toEqual(['李四'])
    expect(router.currentRoute.value.query).toEqual({ keep: '1' })
    w.unmount()
  })

  it('下钻落地:dEmp 按工号精确筛(避同名)', async () => {
    await router.push('/yitian/detail?dEmp=A1')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).filtered.every((r: any) => r.empId === 'A1')).toBe(true)
    expect((w.vm as any).filtered.length).toBe(2)
    w.unmount()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/YitianDetailView.test.ts`
Expected: FAIL（query 未被清、onlyIssues 未设）

- [ ] **Step 3: 实现下钻落地**

在 `YitianDetailView.vue` 的 `<script setup>` 中：

3a. import 增补：`nextTick`（加到 vue 的 import）、`useRoute`/`useRouter`、`cfUniqueValues`、`parseDetailDrill`。改这三行 import：
```ts
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { applyColumnFilters, cfUniqueValues } from '@/lib/crossFilter'
```
并在 detail 的 import 组后加：
```ts
import { parseDetailDrill } from '@/lib/yitian/detailDrill'
```

3b. 在 `onMounted(() => { store.load() })` 之前加 route/router 与落地逻辑：
```ts
const route = useRoute()
const router = useRouter()

// 下钻落地:复刻 analytics/compliance 范式——ready 门控 + flush:'post' + nextTick 一次性 watcher,
// 避免 YitianToolbar 的 view.hydrate() 用 localStorage 历史区间覆盖掉刚设的下钻日期(见 analytics 注释)。
let drillApplied = false
function applyDrillLanding() {
  if (drillApplied) return
  const q = route.query
  if (!Object.keys(q).length) { drillApplied = true; return }
  drillApplied = true
  const d = parseDetailDrill(q)
  const setters: [string, string][] = []
  if (d.l4) setters.push(['l4', d.l4])
  if (d.emp) setters.push(['empId', d.emp]) // 隐藏键:按工号精确,避同名
  if (setters.length) {
    cf.clearAll(TABLE_ID)
    for (const [col, val] of setters) {
      cf.setColumnFilter(TABLE_ID, col, [val], cfUniqueValues(rows.value, col).length)
    }
  }
  if (d.start && d.end) { view.start = d.start; view.end = d.end }
  if (d.only) onlyIssues.value = true
  const rest: Record<string, any> = { ...route.query }
  delete rest.dL4; delete rest.dEmp; delete rest.dStart; delete rest.dEnd; delete rest.dOnly
  router.replace({ query: rest })
}
watch(ready, (r) => { if (r) nextTick(applyDrillLanding) }, { immediate: true, flush: 'post' })
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/YitianDetailView.test.ts`
Expected: PASS（含新增 2 个下钻用例，原有用例不回归）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/YitianDetailView.vue frontend/src/views/YitianDetailView.test.ts
git commit -m "feat(yitian): 明细页下钻落地(dL4/dEmp/dOnly→cf+区间+仅异常,清键防重放)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 总览页组织表「明细」入口 → `dL4`

**Files:**
- Modify: `frontend/src/views/YitianOverviewView.vue`
- Modify: `frontend/src/views/YitianOverviewView.test.ts`

**Interfaces:**
- Consumes: Task 1 `buildDetailDrill`
- Produces: 组织表新增「明细」操作列，点击 `router.push('/yitian/detail', { query: buildDetailDrill({ l4: row.name }) })`

- [ ] **Step 1: 加失败测试**

在 `frontend/src/views/YitianOverviewView.test.ts` 末尾加（若无 router，参照 compliance 测试建 memory router 并把 `/yitian/detail` 加进 routes）：
```ts
  it('组织表「明细」入口跳 /yitian/detail 带 dL4', async () => {
    const w = mountView()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    ;(w.vm as any).goDetailL4({ name: '银行服务组' })
    expect(push).toHaveBeenCalledWith({ path: '/yitian/detail', query: { dL4: '银行服务组' } })
  })
```
> 若该测试文件当前未持有 `router` 变量/未 spy push，按 compliance 测试的 `beforeEach` 建 `router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', ... }, { path: '/yitian', component: YitianOverviewView }, { path: '/yitian/detail', component: { template: '<div/>' } }] })`，并在 `mountView` 的 plugins 里加 `router`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/YitianOverviewView.test.ts`
Expected: FAIL（`goDetailL4` 未定义）

- [ ] **Step 3: 实现**

3a. 顶部 import 增补：
```ts
import { buildDrillQuery } from '@/lib/yitian/drill'
import { buildDetailDrill } from '@/lib/yitian/detailDrill'
```
（若已 import `buildDrillQuery` 则只加第二行）

3b. 在 `goCompliance` 附近加：
```ts
function goDetailL4(row: { name: string }) {
  if (row?.name) router.push({ path: '/yitian/detail', query: buildDetailDrill({ l4: row.name }) })
}
```
并把 `goDetailL4` 加进 `defineExpose({...})`。

3c. `orgCols` 数组末尾加操作列：
```ts
  { key: 'satText', label: '饱和度', width: 110, num: true, sortable: true },
  { key: 'detailAction', label: '明细', width: 70, fixed: 'right' },
]
```

3d. 组织表的 `<DataTable ...>` 内加 cell slot（`@click.stop` 防触发行现有 `@row-click="onOrgRow"`）：
```vue
          <DataTable :columns="orgCols" :rows="orgRows" :show-count="false" clickable
            :show-summary="true" :summary-method="orgSummaryMethod" @row-click="onOrgRow">
            <template #cell-detailAction="{ row }">
              <el-link type="primary" :underline="false" @click.stop="goDetailL4(row)">明细</el-link>
            </template>
          </DataTable>
```

> `orgSummaryMethod` 的 `disp` 无 `detailAction` 键，已有 `?? ''` 兜底，合计行该列自动空——无需改。

- [ ] **Step 4: 跑测试确认通过（含回归）**

Run: `cd frontend && npx vitest run src/views/YitianOverviewView.test.ts`
Expected: PASS（新增用例 + 原有 `onOrgRow` 去 analytics 的用例不变）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/YitianOverviewView.vue frontend/src/views/YitianOverviewView.test.ts
git commit -m "feat(yitian): 总览组织表新增「明细」入口→/yitian/detail?dL4

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 统计分析页员工表「明细」入口 → `dEmp`

**Files:**
- Modify: `frontend/src/views/YitianAnalyticsView.vue`
- Modify: `frontend/src/views/YitianAnalyticsView.test.ts`

**Interfaces:**
- Consumes: Task 1 `buildDetailDrill`；员工行 `EmpStat.id`（工号）
- Produces: 员工明细表新增「明细」列 → `buildDetailDrill({ emp: row.id })`

- [ ] **Step 1: 加失败测试**

在 `frontend/src/views/YitianAnalyticsView.test.ts` 末尾加（沿用该文件既有 router/mount 范式；analytics 测试已有 router）：
```ts
  it('员工表「明细」入口跳 /yitian/detail 带 dEmp(工号)', async () => {
    const w = mountView()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    ;(w.vm as any).goDetailEmp({ id: 'A1' })
    expect(push).toHaveBeenCalledWith({ path: '/yitian/detail', query: { dEmp: 'A1' } })
  })
```
> 确保测试的 memory router routes 含 `{ path: '/yitian/detail', component: { template: '<div/>' } }`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/YitianAnalyticsView.test.ts`
Expected: FAIL（`goDetailEmp` 未定义）

- [ ] **Step 3: 实现**

3a. 顶部 import 加：
```ts
import { buildDetailDrill } from '@/lib/yitian/detailDrill'
```

3b. 加函数（放在 `drillEmpById` 附近）并加进 `defineExpose`：
```ts
function goDetailEmp(row: { id: string }) {
  if (row?.id) router.push({ path: '/yitian/detail', query: buildDetailDrill({ emp: row.id }) })
}
```

3c. 找到员工明细表的列定义数组（员工表 `DataColumn[]`，含 `id/name/l4/hoursText/...`），在末尾加：
```ts
  { key: 'detailAction', label: '明细', width: 70, fixed: 'right' },
```

3d. 员工明细表 `<DataTable>`（`id="yt-emp"` 区域那张）内加 cell slot：
```vue
            <template #cell-detailAction="{ row }">
              <el-link type="primary" :underline="false" @click.stop="goDetailEmp(row)">明细</el-link>
            </template>
```
> 若该表已有 header slot（ColumnFilter）循环，保留不动；只新增 `#cell-detailAction`。`detailAction` 不在 `FILTERABLE`，表头不会挂 ColumnFilter。

- [ ] **Step 4: 跑测试确认通过（含回归）**

Run: `cd frontend && npx vitest run src/views/YitianAnalyticsView.test.ts`
Expected: PASS（新增用例 + 原有 drill 落地/员工筛选用例不变）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/YitianAnalyticsView.vue frontend/src/views/YitianAnalyticsView.test.ts
git commit -m "feat(yitian): 统计分析员工表新增「明细」入口→/yitian/detail?dEmp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 合规检查页问题表「明细」入口 → `dEmp` + `dOnly`

**Files:**
- Modify: `frontend/src/views/YitianComplianceView.vue`
- Modify: `frontend/src/views/YitianComplianceView.test.ts`

**Interfaces:**
- Consumes: Task 1 `buildDetailDrill`；问题行 `IssueRow.empId`（`issueRows` 已含，无需改 compliance.ts）
- Produces: 问题明细表新增「明细」列 → `buildDetailDrill({ emp: row.empId, only: true })`

- [ ] **Step 1: 加失败测试**

在 `frontend/src/views/YitianComplianceView.test.ts` 末尾（最后 `})` 前）加：
```ts
  it('问题表「明细」入口跳 /yitian/detail 带 dEmp+dOnly', async () => {
    await router.push('/')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    ;(w.vm as any).goDetailIssue({ empId: 'A1' })
    expect(push).toHaveBeenCalledWith({ path: '/yitian/detail', query: { dEmp: 'A1', dOnly: '1' } })
  })
```
> 在 `beforeEach` 的 router routes 里补 `{ path: '/yitian/detail', component: { template: '<div/>' } }`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/YitianComplianceView.test.ts`
Expected: FAIL（`goDetailIssue` 未定义）

- [ ] **Step 3: 实现**

3a. 顶部 import 加：
```ts
import { buildDetailDrill } from '@/lib/yitian/detailDrill'
```

3b. 加函数（放在 `drillTable` 附近）并加进任何 `defineExpose`（compliance 测试通过 `w.vm` 访问，若无 defineExpose 则新增 `defineExpose({ goDetailIssue })`；若已有则并入）：
```ts
function goDetailIssue(row: { empId: string }) {
  if (row?.empId) router.push({ path: '/yitian/detail', query: buildDetailDrill({ emp: row.empId, only: true }) })
}
```

3c. 找到问题明细表的列定义（含 `date/empName/l4/type/hours/customer/workOrder/okText/issueText`），末尾加：
```ts
  { key: 'detailAction', label: '明细', width: 70, fixed: 'right' },
```

3d. 问题明细表 `<DataTable>` 内加 cell slot：
```vue
            <template #cell-detailAction="{ row }">
              <el-link type="primary" :underline="false" @click.stop="goDetailIssue(row)">明细</el-link>
            </template>
```
> 现有图表下钻 `onCodeBarClick`/`onL4BarClick`/`onHeatmapClick`（页内 drillTable）**保持不变**，不接 detail。

- [ ] **Step 4: 跑测试确认通过（含回归）**

Run: `cd frontend && npx vitest run src/views/YitianComplianceView.test.ts`
Expected: PASS（新增用例 + 原有筛选/落地/分页用例不变）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/YitianComplianceView.vue frontend/src/views/YitianComplianceView.test.ts
git commit -m "feat(yitian): 合规问题表新增「明细」入口→/yitian/detail?dEmp&dOnly

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 客户支持页 TOP1000 表「明细」入口 → `dL4`

**Files:**
- Modify: `frontend/src/views/YitianCustomerView.vue`
- Modify: `frontend/src/views/YitianCustomerView.test.ts`

**Interfaces:**
- Consumes: Task 1 `buildDetailDrill`；TOP1000 行 `topRows[].l4`
- Produces: TOP1000 表新增「明细」列 → `buildDetailDrill({ l4: row.l4 })`

- [ ] **Step 1: 加失败测试**

在 `frontend/src/views/YitianCustomerView.test.ts` 末尾加（沿用既有 router/mount；补 `/yitian/detail` 到 routes）：
```ts
  it('TOP1000 表「明细」入口跳 /yitian/detail 带 dL4', async () => {
    const w = mountView()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    ;(w.vm as any).goDetailL4({ l4: '银行服务组' })
    expect(push).toHaveBeenCalledWith({ path: '/yitian/detail', query: { dL4: '银行服务组' } })
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/YitianCustomerView.test.ts`
Expected: FAIL（`goDetailL4` 未定义）

- [ ] **Step 3: 实现**

3a. 顶部 import 加：
```ts
import { buildDetailDrill } from '@/lib/yitian/detailDrill'
```

3b. 加函数（放在 `goAnalyticsL4` 附近）并加进 `defineExpose`：
```ts
function goDetailL4(row: { l4: string }) {
  if (row?.l4) router.push({ path: '/yitian/detail', query: buildDetailDrill({ l4: row.l4 }) })
}
```

3c. `topCols` 数组末尾加：
```ts
  { key: 'topCustomers', label: 'TOP1000 客户数', width: 140, num: true, sortable: true },
  { key: 'detailAction', label: '明细', width: 70, fixed: 'right' },
]
```

3d. TOP1000 表 `<DataTable>`（`:columns="topCols"` 那张）内加 cell slot：
```vue
        <DataTable :columns="topCols" :rows="topRows" :show-count="false" clickable
          :show-summary="true" :summary-method="topSummaryMethod" @row-click="onTop1000Row">
          <template #cell-detailAction="{ row }">
            <el-link type="primary" :underline="false" @click.stop="goDetailL4(row)">明细</el-link>
          </template>
        </DataTable>
```
> `topSummaryMethod` 的 `disp` 无 `detailAction`，已有 `?? ''` 兜底——合计行该列自动空。现有 `onTop1000Row`（去 analytics）不变。

- [ ] **Step 4: 跑测试确认通过（含回归）**

Run: `cd frontend && npx vitest run src/views/YitianCustomerView.test.ts`
Expected: PASS（新增用例 + 原有 `onTop1000Row` 去 analytics 用例不变）

- [ ] **Step 5: 全量验证 + 提交**

```bash
git add frontend/src/views/YitianCustomerView.vue frontend/src/views/YitianCustomerView.test.ts
git commit -m "feat(yitian): 客户支持 TOP1000 表新增「明细」入口→/yitian/detail?dL4

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Run（全量闸门）: `bash verify.sh`
Expected: 全绿（Python pytest + 前端 typecheck/vitest/build）

- [ ] **Step 6: 手动冒烟（真实数据）**

启动 `python server.py`（:8080）+ `cd frontend && npm run dev`，登录后：
1. 侧栏「工时明细」在「倚天工时总览」与「工时合规检查」之间；进入页面明细行数 ≈ meta.rows（约 1129），合规/提示/问题三态计数与合规检查页一致。
2. 选列/表头筛选/横滚/导出可用；「仅看异常」切换行数变化。
3. 从 总览组织表 / 统计分析员工表 / 合规问题表 / 客户 TOP1000 表 点「明细」→ 跳到明细页且按维度筛选正确（合规来源自动开「仅看异常」）；「清除所有筛选」恢复全量；地址栏无残留 `d*` 参数。
4. 非超管账号（限定某 L4）只见其范围行。

---

## Self-Review

**1. Spec coverage：**
- §2 数据模型 / §4 数据层 → Task 2 ✓
- §5 列设计（ALL_KEYS/DEFAULT_VISIBLE/FILTERABLE/okText 徽章） → Task 2 + Task 3 ✓
- §6 顶部辅助区（YitianToolbar + 汇总 + 仅看异常 + 导出 + 清除） → Task 3 ✓
- §7 导出 → Task 2（buildDetailSheetRows）+ Task 3（onExport）✓
- §8 L4 隔离（后端切分，前端直接消费）→ 无需专门任务，Task 3 数据流天然满足；Task 9 手动冒烟第 4 条验证 ✓
- §9 store/三态 → Task 3 ✓
- §10 视图结构 + 分页 → Task 3 ✓
- §11 路由/导航/pageAccess → Task 4 ✓
- §16 下钻集成（契约/落地/四入口）→ Task 1 + Task 5 + Task 6-9 ✓
- §13 版本 V4.1.0 → Task 4 ✓
- §12 测试计划 → 各任务 Step 1 覆盖（detailDrill/detail/view/router/各入口回归）✓

**2. Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码；入口页因既有代码结构未知处（列数组精确位置、是否已有 router）给了"找到 X 数组末尾加""若无 router 则按 compliance 范式建"的可执行指引，非占位。

**3. Type consistency：**
- `DetailDrill`/`buildDetailDrill`/`parseDetailDrill`（Task 1）↔ Task 5 消费一致 ✓
- `DetailRow` 字段（Task 2）↔ Task 3 模板 `row.ok`/`row.okText`/`row.snippet`/`row.issueReason` 一致 ✓
- `okText`/`FILTERABLE` 含 `okText`（Task 2）↔ Task 3 `#cell-okText` slot 一致 ✓
- 下钻键 `dL4/dEmp/dOnly`（Task 1）↔ Task 6/7/8/9 入口传参一致（overview→l4、analytics→emp、compliance→emp+only、customer→l4）✓
- 落地 col 名 `l4`/`empId`（Task 5）↔ `DetailRow` 有 `l4`/`empId` 字段 ✓
- `pageKey: 'yitian-detail'`（Task 4 router）↔ `PageKey` 注册（Task 4 pageAccess）一致 ✓
