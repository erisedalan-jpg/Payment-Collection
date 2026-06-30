# /insight/costdetail 改造 + 全站筛选 UX 修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 /insight/costdetail 取数与展示（四卡换总/交付超支口径、售前预算回退原项目、新增交付成本状态列、图与汇总表打磨），并修共享 ColumnFilter 的级联选项与点击误排序缺陷（覆盖 9 页）。

**Architecture:** 纯前端。Part 1 集中在 `lib/costAnalysis.ts`（纯计算，TDD 全覆盖）+ `views/CostDetailView.vue`（装配）。Part 2 改 `components/ColumnFilter.vue` 一处，全 9 页生效。超支判定复用 `lib/riskReasons.ts`（与 /projects 单一来源）。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + ECharts + vitest。

## Global Constraints

- 设计令牌唯一来源，页面只准引用 `theme.css` 令牌，不手写散值（仅图形尺寸像素例外）。
- 状态色固定语义；带文字状态用 `StatusBadge`（淡底深字）。
- 数字列挂 `.u-num`。
- 纯前端：不改 `schema.py`/`preprocess_data.py`/后端 → 升级不需点「更新数据」、无新页/无新 pageKey/无新依赖。
- 不使用 emoji；需要符号用 `→ ↓ ❌ ✕ ▾`。
- 口径单一来源：成本超支判定沿用 `riskReasons`（同 /projects）。
- 完成定义：`bash verify.sh` 全绿 + `PROGRESS.md` 更新 + 真机冒烟。
- 版本：本轮目标 V2.5.4（改 `frontend/src/version.ts` 一处）。

---

## Part 1 —— /insight/costdetail

### Task 1: `deliveryStatusOf` 纯函数

**Files:**
- Modify: `frontend/src/lib/costAnalysis.ts`
- Test: `frontend/src/lib/costAnalysis.test.ts`

**Interfaces:**
- Produces: `export type DeliveryStatus = '未超支' | '交付预算超支' | '交付外包超支' | '原厂外包均超支'`；`export function deliveryStatusOf(deptRemain: number, outsourceRemain: number): DeliveryStatus`

- [ ] **Step 1: 写失败测试**（追加到 `costAnalysis.test.ts` 末尾，先确保已 `import { deliveryStatusOf } from './costAnalysis'`）

```ts
describe('deliveryStatusOf', () => {
  it('部门≥0 且 外包≥0 → 未超支(含 =0 边界)', () => {
    expect(deliveryStatusOf(100, 50)).toBe('未超支')
    expect(deliveryStatusOf(0, 0)).toBe('未超支')
    expect(deliveryStatusOf(0, 10)).toBe('未超支')
  })
  it('部门<0 且 外包≥0 → 交付预算超支', () => {
    expect(deliveryStatusOf(-1, 50)).toBe('交付预算超支')
    expect(deliveryStatusOf(-1, 0)).toBe('交付预算超支')
  })
  it('部门≥0 且 外包<0 → 交付外包超支', () => {
    expect(deliveryStatusOf(50, -1)).toBe('交付外包超支')
    expect(deliveryStatusOf(0, -1)).toBe('交付外包超支')
  })
  it('部门<0 且 外包<0 → 原厂外包均超支', () => {
    expect(deliveryStatusOf(-1, -1)).toBe('原厂外包均超支')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts -t deliveryStatusOf`
Expected: FAIL（`deliveryStatusOf is not a function`）

- [ ] **Step 3: 实现**（追加到 `costAnalysis.ts`，紧跟 `costStatusOf` 之后）

```ts
export type DeliveryStatus = '未超支' | '交付预算超支' | '交付外包超支' | '原厂外包均超支'

/** 交付成本状态:由交付部门剩余、交付外包剩余两列判定。<0=超支,≥0=不超支(含 =0)。 */
export function deliveryStatusOf(deptRemain: number, outsourceRemain: number): DeliveryStatus {
  const deptOver = deptRemain < 0
  const outOver = outsourceRemain < 0
  if (deptOver && outOver) return '原厂外包均超支'
  if (deptOver) return '交付预算超支'
  if (outOver) return '交付外包超支'
  return '未超支'
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts -t deliveryStatusOf`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/costAnalysis.ts frontend/src/lib/costAnalysis.test.ts
git commit -m "feat(cost): deliveryStatusOf 交付成本状态纯函数(4 态,含 =0 边界)"
```

---

### Task 2: `buildCostRows` 售前预算回退原项目 + 超支布尔 + 交付状态

**Files:**
- Modify: `frontend/src/lib/costAnalysis.ts`
- Test: `frontend/src/lib/costAnalysis.test.ts`

**Interfaces:**
- Consumes: `deliveryStatusOf`（Task 1）、`riskReasons(project, pmis?)` from `./riskReasons`（返回 `{category, detail, tone}[]`，category 含 `'总成本超支'`/`'交付成本超支'`）。
- Produces: `CostRow` 新增字段 `deliveryStatus: DeliveryStatus`、`totalOverspend: boolean`、`deliveryOverspend: boolean`、`overspendAmount: number`。`buildCostRows(projects, pmis)` 签名不变。

- [ ] **Step 1: 写失败测试**（追加到 `costAnalysis.test.ts`）

```ts
import { buildCostRows } from './costAnalysis'

describe('buildCostRows 售前预算回退原项目 + 超支布尔', () => {
  it('售前项目三列取原项目:总预算=原总预算、已核算=原核算+售前自身核算、剩余=总-已', () => {
    const projects = [
      { projectId: 'SF1', projectName: '售前甲', isPresale: true, relatedClosedId: 'O1', orgL4: 'D1',
        deliveryCosts: [{ 类别: '交付部门人工成本', 剩余预算: 100 }, { 类别: '交付外包服务成本', 剩余预算: -5 }] },
    ] as any
    const pmis = {
      SF1: { cost: { 核算: 100 }, status: {}, team: {} },
      O1: { cost: { 总预算: 1000, 核算: 600 }, status: {}, team: {} },
    } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalBudget).toBe(1000)
    expect(r.actualCost).toBe(700)   // 原核算600 + 售前核算100
    expect(r.remaining).toBe(300)    // 1000 - 700
    expect(r.deliveryStatus).toBe('交付外包超支') // 部门100≥0, 外包-5<0
  })
  it('非售前项目三列读自身 cost(不变)', () => {
    const projects = [{ projectId: 'WS1', orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { WS1: { cost: { 总预算: 200, 核算: 50, 剩余预算: 150 }, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalBudget).toBe(200)
    expect(r.actualCost).toBe(50)
    expect(r.remaining).toBe(150)
  })
  it('售前无 relatedClosedId → 回退自身 cost', () => {
    const projects = [{ projectId: 'SF2', isPresale: true, orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { SF2: { cost: { 总预算: 0, 核算: 0, 剩余预算: 0 }, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalBudget).toBe(0)
  })
  it('总成本超支布尔与 overspendAmount(overspendAmount>0)', () => {
    const projects = [{ projectId: 'WS2', orgL4: 'D1', overspendAmount: 8000, deliveryCosts: [] }] as any
    const pmis = { WS2: { cost: {}, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalOverspend).toBe(true)
    expect(r.overspendAmount).toBe(8000)
    expect(r.deliveryOverspend).toBe(false)
  })
  it('交付成本超支布尔(cost.交付超支 flag)', () => {
    const projects = [{ projectId: 'WS3', orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { WS3: { cost: { 交付超支: true }, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.deliveryOverspend).toBe(true)
    expect(r.totalOverspend).toBe(false)
  })
  it('异常项目(orgL4 空)两超支均否(riskReasons 短路数据异常)', () => {
    const projects = [{ projectId: 'WS4', orgL4: '', overspendAmount: 9000, deliveryCosts: [] }] as any
    const pmis = { WS4: { cost: { 交付超支: true }, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalOverspend).toBe(false)
    expect(r.deliveryOverspend).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts -t "buildCostRows 售前"`
Expected: FAIL（缺 deliveryStatus/totalOverspend 等字段；售前三列仍为旧值）

- [ ] **Step 3: 实现**——改 `costAnalysis.ts`：

(3a) 顶部加 import：
```ts
import { riskReasons } from './riskReasons'
```

(3b) `CostRow` 接口加字段（在 `deliveryDeptRemaining/deliveryOutsourceRemaining` 行后补）：
```ts
export interface CostRow {
  projectId: string; projectName: string; projectType: string
  orgL3: string; orgL3_1: string; orgL4: string; manager: string
  amount: number; status: CostStatus
  totalBudget: number; actualCost: number; remaining: number; xs: boolean
  deliveryDeptRemaining: number; deliveryOutsourceRemaining: number
  deliveryStatus: DeliveryStatus
  totalOverspend: boolean; deliveryOverspend: boolean; overspendAmount: number
}
```

(3c) 整体替换 `buildCostRows`：
```ts
/** 全部主域项目装配成本行(明细表用;XS 保留并标记)。
 * 售前服务类(isPresale + relatedClosedId)的 总预算/已核算/剩余 回退原项目:
 *   总预算=原项目总预算; 已核算=原项目核算 + 售前自身核算; 剩余=总预算 − 已核算。
 * 超支判定(totalOverspend/deliveryOverspend)沿用 riskReasons(售前用自身),与 /projects 同源。
 * 交付成本状态由本行两交付剩余列判定(售前同样用自身 deliveryCosts/delivery_analysis.csv)。 */
export function buildCostRows(projects: Project[], pmis: Record<string, ProjectPmis>): CostRow[] {
  return projects.map((p) => {
    const m = (pmis[p.projectId] ?? {}) as any
    const cost = m.cost ?? {}
    const dc = p.deliveryCosts ?? []
    const findRem = (cat: string) => Number(dc.find((c: any) => c.类别 === cat)?.剩余预算 ?? 0)
    const deptRem = findRem('交付部门人工成本')
    const outRem = findRem('交付外包服务成本')

    // 售前三列回退原项目;否则读自身
    const originCost = (p.isPresale && p.relatedClosedId && pmis[p.relatedClosedId])
      ? ((pmis[p.relatedClosedId] as any).cost ?? {}) : null
    let totalBudget: number, actualCost: number, remaining: number
    if (originCost) {
      totalBudget = Number(originCost.总预算 ?? 0)
      actualCost = Number(originCost.核算 ?? 0) + Number(cost.核算 ?? 0)
      remaining = totalBudget - actualCost
    } else {
      totalBudget = Number(cost.总预算 ?? 0)
      actualCost = Number(cost.核算 ?? 0)
      remaining = Number(cost.剩余预算 ?? 0)
    }

    // 超支判定:复用 riskReasons(售前/异常按自身,与 /projects 一致)
    const cats = riskReasons(p, m as ProjectPmis).map((rr) => rr.category)

    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      projectType: (m.status?.项目类型 ?? '').trim(),
      orgL3: (m.team?.L3部门 ?? '').trim(),
      orgL3_1: (p.orgL3_1 ?? '').trim(),
      orgL4: (p.orgL4 ?? '').trim(),
      manager: (p.projectManager ?? '').trim(),
      amount: Number(p.paymentPmis?.contract ?? 0),
      status: costStatusOf(remaining, p.projectId),
      totalBudget, actualCost, remaining,
      xs: isXs(p.projectId),
      deliveryDeptRemaining: deptRem,
      deliveryOutsourceRemaining: outRem,
      deliveryStatus: deliveryStatusOf(deptRem, outRem),
      totalOverspend: cats.includes('总成本超支'),
      deliveryOverspend: cats.includes('交付成本超支'),
      overspendAmount: Number(p.overspendAmount ?? 0),
    }
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts`
Expected: 新 buildCostRows 测试 PASS（旧 costKpis 测试此时可能仍引用旧字段，Task 3 修；若旧 buildCostRows 测试因新增字段失败则在本步一并按新字段补齐断言）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/costAnalysis.ts frontend/src/lib/costAnalysis.test.ts
git commit -m "feat(cost): buildCostRows 售前预算回退原项目 + 超支布尔(riskReasons 同源) + 交付状态"
```

---

### Task 3: `costKpis` 改五值（不剔 XS）

**Files:**
- Modify: `frontend/src/lib/costAnalysis.ts`
- Test: `frontend/src/lib/costAnalysis.test.ts`

**Interfaces:**
- Produces: `export interface CostKpis { total: number; notOverspent: number; totalOverspend: number; totalOverspendOver5k: number; deliveryOverspend: number }`；`costKpis(rows): CostKpis`。

- [ ] **Step 1: 改/写测试**——`costAnalysis.test.ts` 中删除/替换旧 `costKpis`（normal/under5k/over5k）相关用例为：

```ts
describe('costKpis 五值(不剔 XS)', () => {
  const mk = (o: Partial<any>) => ({ totalOverspend: false, deliveryOverspend: false, overspendAmount: 0, xs: false, ...o })
  it('total=全部行(含 XS);未超支=两维度皆否;总超支/大于5000/交付超支', () => {
    const rows = [
      mk({ xs: true }),                                   // XS:也计入 total;两维度否→未超支
      mk({ totalOverspend: true, overspendAmount: 8000 }),// 总超支 + 大于5000
      mk({ totalOverspend: true, overspendAmount: 3000 }),// 总超支但不大于5000
      mk({ deliveryOverspend: true }),                    // 交付超支
      mk({ totalOverspend: true, deliveryOverspend: true, overspendAmount: 9000 }), // 两者
      mk({}),                                             // 未超支
    ] as any
    const k = costKpis(rows)
    expect(k.total).toBe(6)
    expect(k.notOverspent).toBe(2)       // XS 行 + 末行
    expect(k.totalOverspend).toBe(3)     // 三行 totalOverspend
    expect(k.totalOverspendOver5k).toBe(2) // 8000、9000
    expect(k.deliveryOverspend).toBe(2)  // 两行 deliveryOverspend
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts -t "costKpis 五值"`
Expected: FAIL（旧 costKpis 返回 normal/under5k/over5k）

- [ ] **Step 3: 实现**——替换 `CostKpis` 接口与 `costKpis`：

```ts
export interface CostKpis { total: number; notOverspent: number; totalOverspend: number; totalOverspendOver5k: number; deliveryOverspend: number }
/** 成本卡计数(不剔 XS):总数=全部行;未超支=两维度皆否;总/交付超支沿用 riskReasons 派生布尔;大于5000=overspendAmount>5000。 */
export function costKpis(rows: CostRow[]): CostKpis {
  const k: CostKpis = { total: 0, notOverspent: 0, totalOverspend: 0, totalOverspendOver5k: 0, deliveryOverspend: 0 }
  for (const r of rows) {
    k.total++
    if (!r.totalOverspend && !r.deliveryOverspend) k.notOverspent++
    if (r.totalOverspend) { k.totalOverspend++; if (r.overspendAmount > 5000) k.totalOverspendOver5k++ }
    if (r.deliveryOverspend) k.deliveryOverspend++
  }
  return k
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts`
Expected: 全 PASS（含 Task 1/2 用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/costAnalysis.ts frontend/src/lib/costAnalysis.test.ts
git commit -m "feat(cost): costKpis 改五值口径(总数不剔XS/未超支=两维度皆否/总·交付超支/大于5000)"
```

---

### Task 4: CostDetailView 四卡 + KPI 就地筛选

**Files:**
- Modify: `frontend/src/views/CostDetailView.vue`
- Test: `frontend/src/views/CostDetailView.test.ts`

**Interfaces:**
- Consumes: `costKpis`（Task 3，五值）、`CostRow.totalOverspend/deliveryOverspend`（Task 2）。
- Produces: 暴露 `kpiFilter` 供测试。

- [ ] **Step 1: 改测试**——`CostDetailView.test.ts`：①更新 seed 让 WS1 命中总成本超支（加 `overspendAmount: 8000`），WS2 命中交付超支（pmis WS2.cost 加 `交付超支: true`）；②替换"4 KPI"用例：

```ts
it('四卡:成本统计(含XS)/未超支/总成本超支数(+大于5000子)/交付成本超支数', () => {
  seed()
  const w = mount(CostDetailView, opts)
  const items = w.findComponent(MetricGrid).props('items') as any[]
  expect(items.map((i) => i.k)).toEqual(['成本统计项目数', '未超支', '总成本超支数', '交付成本超支数'])
  expect(items.find((i) => i.k === '成本统计项目数').v).toBe('3') // WS1/WS2/XS9 全计入(不剔XS)
  expect(items.find((i) => i.k === '总成本超支数').v).toBe('1')   // WS1
  expect(items.find((i) => i.k === '总成本超支数').sub).toContain('超支大于5000')
  expect(items.find((i) => i.k === '交付成本超支数').v).toBe('1') // WS2
})
it('点 KPI(总成本超支数)就地筛选明细=WS1;点成本统计复位', async () => {
  ;(Element.prototype as any).scrollIntoView = vi.fn()
  seed()
  const w = mount(CostDetailView, opts)
  ;(w.vm as any).onKpiClick(2)
  await w.vm.$nextTick()
  const detail = w.findAllComponents({ name: 'DataTable' }).at(-1)!
  expect((detail.props('rows') as any[]).map((r: any) => r.projectId)).toEqual(['WS1'])
  ;(w.vm as any).onKpiClick(0)
  await w.vm.$nextTick()
  expect((detail.props('rows') as any[]).length).toBe(3)
})
```

> 注：旧用例「点 KPI(超支大于5K)写成本状态列筛选」「KPI 计数 剔 XS:总数2」等与新口径冲突，删除或改写为上述两条。seed 的 XS9 现计入 total（3）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/CostDetailView.test.ts -t 四卡`
Expected: FAIL

- [ ] **Step 3: 实现**——`CostDetailView.vue` `<script setup>`：

(3a) 替换 `kpiItems`：
```ts
const kpiItems = computed(() => {
  const k = kpi.value
  return [
    { k: '成本统计项目数', v: String(k.total), clickable: true },
    { k: '未超支', v: String(k.notOverspent), cls: 'ok', clickable: true },
    { k: '总成本超支数', v: String(k.totalOverspend), sub: `超支大于5000: ${k.totalOverspendOver5k}`, cls: 'danger', clickable: true },
    { k: '交付成本超支数', v: String(k.deliveryOverspend), cls: 'danger', clickable: true },
  ]
})
```

(3b) 替换 KPI 点击逻辑（删除旧 `KPI_STATUS`/`onKpiClick` 中写 crossFilter status 的实现），改：
```ts
type KpiFilter = 'all' | 'notOverspent' | 'totalOverspend' | 'deliveryOverspend'
const KPI_FILTER: KpiFilter[] = ['all', 'notOverspent', 'totalOverspend', 'deliveryOverspend']
const kpiFilter = ref<KpiFilter>('all')
function onKpiClick(i: number) {
  const f = KPI_FILTER[i]
  kpiFilter.value = (i === 0 || kpiFilter.value === f) ? 'all' : f
  detailCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
```

(3c) `filtered` computed 末段加 kpiFilter 过滤（在关键词过滤后、排序前）：
```ts
const filtered = computed(() => {
  const colFiltered = applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID))
  const kw = fKw.value.trim()
  let r = kw ? colFiltered.filter((x) => x.projectId.includes(kw) || x.projectName.includes(kw)) : colFiltered
  if (kpiFilter.value === 'notOverspent') r = r.filter((x) => !x.totalOverspend && !x.deliveryOverspend)
  else if (kpiFilter.value === 'totalOverspend') r = r.filter((x) => x.totalOverspend)
  else if (kpiFilter.value === 'deliveryOverspend') r = r.filter((x) => x.deliveryOverspend)
  return [...r].sort((a, b) => a.orgL4.localeCompare(b.orgL4) || a.projectId.localeCompare(b.projectId))
})
```

(3d) `defineExpose` 增加 `kpiFilter`、`onKpiClick`（若未导出）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/CostDetailView.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/CostDetailView.vue frontend/src/views/CostDetailView.test.ts
git commit -m "feat(costdetail): 四卡换总/交付成本超支口径 + KPI 就地筛选明细"
```

---

### Task 5: CostDetailView 明细表(交付成本状态列/标题) + L4 汇总选列 + 图打磨

**Files:**
- Modify: `frontend/src/views/CostDetailView.vue`
- Test: `frontend/src/views/CostDetailView.test.ts`

**Interfaces:**
- Consumes: `CostRow.deliveryStatus`（Task 2）、`ColumnPicker`、`useColumnPrefs`。

- [ ] **Step 1: 写失败测试**——`CostDetailView.test.ts` 追加：

```ts
it('明细含交付成本状态列;L4 汇总表可选列;标题去括号', () => {
  seed()
  const w = mount(CostDetailView, opts)
  const detailCols = (w.vm as any).DETAIL_COLS as any[]
  expect(detailCols.map((c) => c.key)).toContain('deliveryStatus')
  // L4 汇总表暴露可见列
  expect(((w.vm as any).l4VisibleColumns as any[]).length).toBeGreaterThan(0)
  // 标题去括号(不含"(按")
  expect(w.text()).toContain('项目成本明细')
  expect(w.text()).not.toContain('项目成本明细(按')
  expect(w.text()).not.toContain('超支项目分布(按')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/CostDetailView.test.ts -t 交付成本状态`
Expected: FAIL

- [ ] **Step 3: 实现**——`CostDetailView.vue`：

(3a) import 增加：
```ts
import ColumnPicker from '@/components/ColumnPicker.vue'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
```

(3b) L4 汇总选列（在 `L4_COLS` 定义后）：
```ts
const L4_TABLE_ID = 'cost-l4-summary'
const l4Prefs = useColumnPrefs(L4_TABLE_ID, L4_COLS.map((c) => c.key), L4_COLS.map((c) => c.key))
const l4VisibleColumns = computed(() =>
  l4Prefs.visibleKeys.value.map((k) => L4_COLS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const l4PickerColumns = L4_COLS.map((c) => ({ key: c.key, label: c.label }))
```

(3c) `DETAIL_COLS` 在 `deliveryOutsourceRemaining` 列后追加：
```ts
  { key: 'deliveryStatus', label: '交付成本状态', width: 130, sortable: true },
```

(3d) 交付状态 tone 映射（与 TONE 并列）：
```ts
const DELIVERY_TONE: Record<string, string> = { 未超支: 'ok', 交付预算超支: 'warn', 交付外包超支: 'warn', 原厂外包均超支: 'danger' }
```

(3e) `defineExpose` 加 `l4VisibleColumns`。

(3f) 模板：
- 明细卡标题 `项目成本明细(按 L4 组织排序)` → `项目成本明细`。
- 图卡标题 `超支项目分布(按 L4,剔 XS)` → `超支项目分布`。
- 图 `<ChartBox :option="distOption" height="300px" />` → `height="420px"`（拉长）；如下方仍空，把 `distOption` 的 `grid.bottom` 由 `64` 调到 `48`、`grid.top` 由 `36` 调到 `30`（实现时按真机微调）。
- L4 汇总卡头加选列：把 `<div class="cd-card-h">L4 部门成本情况汇总</div>` 改为带工具的行：
```html
<div class="cd-card-h cd-card-h--row">
  <span>L4 部门成本情况汇总</span>
  <ColumnPicker :columns="l4PickerColumns" :visible-keys="l4Prefs.visibleKeys.value"
    @toggle="l4Prefs.toggle" @move-up="l4Prefs.moveUp" @move-down="l4Prefs.moveDown" @reset="l4Prefs.reset" />
</div>
```
  并把该表 `<DataTable :columns="L4_COLS" ...>` 改 `:columns="l4VisibleColumns"`。
- 明细 `<DataTable>` 内追加单元格插槽（交付状态用 StatusBadge）：
```html
<template #cell-deliveryStatus="{ value }"><StatusBadge :label="value" :tone="DELIVERY_TONE[value]" /></template>
```

(3g) `onExport` 的导出对象追加：`交付成本状态: r.deliveryStatus,`。

(3h) `<style>` 加 `.cd-card-h--row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }`。

- [ ] **Step 4: 跑测试确认通过 + typecheck**

Run: `cd frontend && npx vitest run src/views/CostDetailView.test.ts && npm run typecheck`
Expected: PASS / 无错

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/CostDetailView.vue frontend/src/views/CostDetailView.test.ts
git commit -m "feat(costdetail): 明细加交付成本状态列+标题去括号;L4汇总选列;超支分布图拉长"
```

---

## Part 2 —— 全站筛选 UX（ColumnFilter 一处）

### Task 6: ColumnFilter 级联选项（随其他列收窄）

**Files:**
- Modify: `frontend/src/components/ColumnFilter.vue`
- Test: `frontend/src/components/ColumnFilter.test.ts`

**Interfaces:**
- Consumes: `applyColumnFilters` from `@/lib/crossFilter`、`useCrossFilterStore`（组件已用）。
- Produces: 弹层选项 `uniques` 改为基于「被其他列筛选后的行」。

- [ ] **Step 1: 写失败测试**——`ColumnFilter.test.ts` 追加（参照该文件既有 mount 方式）：

```ts
it('级联:A 列已筛选后,B 列选项只列 A 筛选后行的 B 值', async () => {
  setActivePinia(createPinia())
  const store = useCrossFilterStore()
  const rows = [
    { L4: '甲组', mgr: '张' },
    { L4: '甲组', mgr: '李' },
    { L4: '乙组', mgr: '王' },
  ]
  // 先对 L4 列设筛选=甲组(总值数2:甲组/乙组)
  store.setColumnFilter('T1', 'L4', ['甲组'], 2)
  const w = mount(ColumnFilter, {
    props: { tableId: 'T1', colKey: 'mgr', sourceRows: rows },
    global: { plugins: [ElementPlus] },
  })
  ;(w.vm as any).visible = true
  await w.vm.$nextTick()
  const displays = ((w.vm as any).uniques as any[]).map((u) => u.display)
  expect(displays.sort()).toEqual(['张', '李'].sort()) // 不含 王(乙组已被 L4 筛掉)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/ColumnFilter.test.ts -t 级联`
Expected: FAIL（uniques 含「王」）

- [ ] **Step 3: 实现**——`ColumnFilter.vue` `<script setup>`：

(3a) import 增加：
```ts
import { cfUniqueValues, applyColumnFilters } from '@/lib/crossFilter'
```

(3b) 替换 `uniques` 计算（排除本列自身的筛选后再取唯一值）：
```ts
const uniques = computed(() => {
  const all = store.tableFilters(props.tableId)
  const others: typeof all = {}
  for (const k of Object.keys(all)) if (k !== props.colKey) others[k] = all[k]
  const scoped = applyColumnFilters(props.sourceRows, others)
  return cfUniqueValues(scoped, props.colKey)
})
```

(3c) 打开弹层初始化 `selected` 时与可见 uniques 取交集（替换 watch(visible) 内的赋值）：
```ts
watch(visible, (open) => {
  if (!open) return
  search.value = ''
  const cur = store.tableFilters(props.tableId)[props.colKey]
  const visibleSet = new Set(uniques.value.map((u) => u.display))
  selected.value = cur
    ? new Set(cur.value.filter((v) => visibleSet.has(v)))
    : new Set(uniques.value.map((u) => u.display))
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/ColumnFilter.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ColumnFilter.vue frontend/src/components/ColumnFilter.test.ts
git commit -m "fix(filter): 列头筛选选项随其他列筛选级联收窄(排除本列自身)"
```

---

### Task 7: ColumnFilter 点筛选不误触发排序

**Files:**
- Modify: `frontend/src/components/ColumnFilter.vue`
- Test: 手动真机冒烟（jsdom 不渲染 el-table 排序冒泡，单测不可靠 → 改在 Task 8 冒烟核验）

- [ ] **Step 1: 实现**——`ColumnFilter.vue` 模板，触发器 span 加 `@click.stop`（阻断冒泡到表头排序）：

```html
<template #reference>
  <span class="cf-icon" :class="{ active }" title="列筛选" @click.stop>&#9660;</span>
</template>
```

> 说明：el-popover trigger="click" 仍在 reference 上监听 → 弹层照常打开；`@click.stop` 仅阻断向祖先 `<th>`（el-table 排序）冒泡。Task 8 冒烟验证「点 ▼ 弹层开且排序态不变」。若实测弹层不开，则改为受控：reference span 上 `@click.stop="visible = !visible"`（`el-popover` 已 `v-model:visible="visible"`），二者取其一。

- [ ] **Step 2: typecheck + 既有测试不回归**

Run: `cd frontend && npm run typecheck && npx vitest run src/components/ColumnFilter.test.ts`
Expected: 无错 / PASS

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/ColumnFilter.vue
git commit -m "fix(filter): 点列头筛选 @click.stop 不再误触发表头排序"
```

---

### Task 8: 版本 + PROGRESS + 全量验证 + 真机冒烟

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 版本与进度**——`version.ts` `APP_VERSION = 'V2.5.4'`；`PROGRESS.md` 头部加 V2.5.4 条目（costdetail 改造 + 筛选 UX 修复；纯前端零口径）。

- [ ] **Step 2: 全量 verify**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（pytest + ruff + typecheck + vitest + build）

- [ ] **Step 3: 真机冒烟**（[[design-review-screenshot-harness]]，admin/account=admin、pwd=wxtnb）

核验：
- costdetail 四卡：成本统计=638（真实数据含 XS/售前/异常）、总成本超支数=68、交付成本超支数=39、未超支=638−(总∪交付 distinct)；点卡就地筛选明细。
- 明细：交付成本状态列渲染四态；售前行三列非 0（取原项目）；标题无括号；导出含新列。
- L4 汇总「选列 ▾」可隐列；超支分布图拉长无大片空白。
- 筛选：/projects 筛 L4=某组后，项目经理筛选弹层只列该组经理；点 ▼ 弹层开且不触发排序。
- 零 console JS 错误（仅 favicon 404 既有无害）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.5.4 costdetail 改造 + 筛选 UX 修复(verify 全绿/真机冒烟过)"
```

---

## Self-Review（已执行）

- **Spec 覆盖**：四卡(Task3/4)、图(Task5)、L4选列(Task5)、明细标题+交付状态列(Task5)、售前预算(Task2)、级联筛选(Task6)、点筛选排序解耦(Task7)、/data 排除(既有,Task8 冒烟核验)、9 页(共享 ColumnFilter,Task6/7 一处覆盖)。无遗漏。
- **占位扫描**：图 grid 像素与 Task7 备选方案标注「实现时按真机微调/二者取其一」属合理视觉/交互兜底,非需求缺口。
- **类型一致**：`CostKpis` 五值在 Task3 定义、Task4 消费一致；`CostRow` 新字段 Task2 定义、Task4/5 消费一致；`deliveryStatusOf`/`DeliveryStatus` Task1 定义、Task2/5 消费一致；`applyColumnFilters` 既有签名。
- **边界**：图/L4汇总/旧成本状态列保留 ±5000（仅四卡换口径）；交付状态 =0 归不超支；售前无 relatedClosedId 回退自身；成本统计含 XS/售前/异常。
