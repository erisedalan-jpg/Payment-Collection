# SP5 /payment/board 多维看板重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/payment/board` 的维度集改为 L4部门/项目级别/行业/项目阶段/标签、指标集改为 项目数/合同总额/计划回款/完成率/延期节点，排名表去独立排序控件改 DataTable 表头排序，柱状图加 已回/待回柱内 + 总计柱顶数字，标签按多值炸开分组，交叉/透视维度同步。

**Architecture:** 两步且每步收尾全绿。Task 1 改数据层 `lib/paymentBoard.ts` 到目标态（5 维/5 指标 + `projectLevel`/`tags` 字段 + `groupPayBoard` 多值炸开），重写其单测，并对 `BoardView.test.ts` 打 3 行过渡补丁保绿（视图本体下一任务改）。Task 2 重做 `BoardView.vue`（DataTable 排名表、去排序控件、柱状图数字、标签 store 接入、deep-link 别名）+ 重写受影响视图测试 + 版本号。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus(el-table) + ECharts(vue-echarts) + vitest；纯前端。

## Global Constraints

- **纯前端，零口径变更**：金额/完成率/延期沿用 SP2/SP3 区间口径（`paymentPmisInRange`），本轮只改维度/指标/分组/展示。
- 版本：`frontend/src/version.ts` → `V1.14.0`（Y 级），`RELEASE_DATE` 保持 `2026-06-19`。
- 维度集（三模式共用）：`dept`(L4部门)/`projectLevel`(项目级别)/`industry`(行业)/`stage`(项目阶段)/`tag`(标签，多值)。移除 manager/tier/progress 三维（其行字段保留不删，避免牵动 BoardDrilldownModal 等）。
- 指标集（交叉/透视选择器）：`projectCount`(项目数)/`contractSum`(合同总额)/`expectedSum`(计划回款)/`rate`(完成率)/`delayedNodeSum`(延期节点)。`PayBoardGroup` 仍保留 `actualSum`/`pendingSum` 字段（柱状图用），仅从指标选择器移除。
- 标签多值：含 `tag` 维时一项目计入它每个标签的组（标准多标签 faceting，组间重复计数），空标签归「无标签」。
- 排名表：DataTable 表头点击排序，默认项目数降序；列 = 维度名 + 5 指标，无「已回款/待回款」列。
- 柱状图：已回款值显绿段内、待回款值显黄段内、总计(已回+待回)显柱顶；整数万。
- 样式只引用 theme.css 令牌不手写散值；禁 emoji；提交逐文件 `git add`（禁 `git add -A`/`.`），message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 收尾判据：`bash verify.sh` 全绿。

---

## File Structure

| 文件 | 责任 | 变更 |
|---|---|---|
| `frontend/src/lib/paymentBoard.ts` | 看板数据派生/分组/交叉/透视 | Task1：PayBoardRow 加 projectLevel/tags；buildPayBoardRows 加 tagAssignments 参；DIMENSIONS→5、METRICS→5；groupPayBoard 多值炸开 |
| `frontend/src/lib/paymentBoard.test.ts` | 上者单测 | Task1：重写 meta/分组/交叉测试 + 加 projectLevel/tags/tag 炸开 |
| `frontend/src/views/BoardView.vue` | 看板视图（三模式） | Task1：不动；Task2：DataTable 表、去排序、柱状图数字、tag store、deep-link 别名 |
| `frontend/src/views/BoardView.test.ts` | 视图测试 | Task1：3 行过渡补丁保绿；Task2：重写受影响用例 + 新断言 |
| `frontend/src/version.ts` | 版本单一来源 | Task2：V1.14.0 |

---

## Task 1: 数据层 paymentBoard.ts 到目标态（5 维/5 指标 + 标签多值炸开）

**Files:**
- Modify: `frontend/src/lib/paymentBoard.ts`
- Modify: `frontend/src/lib/paymentBoard.test.ts`
- Modify: `frontend/src/views/BoardView.test.ts`（仅 3 行过渡补丁保绿）

**Interfaces:**
- Consumes: `Project`/`ProjectPmis`（`status.项目级别`、`customer.行业`）、`paymentPmisInRange`、`deriveDept`/`deriveStage`、`projectTags.assignments`(Record<pid,string[]>，由 Task2 注入)。
- Produces: `PAY_BOARD_DIMENSIONS`(5)、`PAY_BOARD_METRICS`(5)、`PayBoardRow` 含 `projectLevel:string`/`tags:string[]`、`buildPayBoardRows(...,tagAssignments?)`、`groupPayBoard` 支持 `tag` 多值炸开。供 Task2 视图消费。

- [ ] **Step 1: 改 meta 测试预期为 5 维/5 指标（先红）**

`frontend/src/lib/paymentBoard.test.ts` 的 `describe('PAY_BOARD_DIMENSIONS / PAY_BOARD_METRICS')` 整段替换：

```ts
describe('PAY_BOARD_DIMENSIONS / PAY_BOARD_METRICS', () => {
  it('维度 5 项：L4部门/项目级别/行业/项目阶段/标签，标签为多值', () => {
    expect(PAY_BOARD_DIMENSIONS.map((d) => d.key)).toEqual(['dept', 'projectLevel', 'industry', 'stage', 'tag'])
    expect(PAY_BOARD_DIMENSIONS.find((d) => d.key === 'tag')?.multi).toBe(true)
    expect(PAY_BOARD_DIMENSIONS.find((d) => d.key === 'dept')?.label).toBe('L4部门')
    expect(PAY_BOARD_DIMENSIONS.find((d) => d.key === 'stage')?.label).toBe('项目阶段')
  })
  it('指标 5 项，仅 rate 为 kind=rate', () => {
    expect(PAY_BOARD_METRICS.map((m) => m.key)).toEqual(['projectCount', 'contractSum', 'expectedSum', 'rate', 'delayedNodeSum'])
    expect(PAY_BOARD_METRICS.filter((m) => m.kind === 'rate').map((m) => m.key)).toEqual(['rate'])
    expect(PAY_BOARD_METRICS.find((m) => m.key === 'delayedNodeSum')?.label).toBe('延期节点')
  })
})
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd frontend && npm run test:run -- paymentBoard`
Expected: FAIL（现 DIMENSIONS 为 6 维、METRICS 为 7 项）。

- [ ] **Step 3: 改 DIMENSIONS / METRICS / PayBoardDimDef / PayBoardMetricKey**

`frontend/src/lib/paymentBoard.ts`：

维度定义段（替换 `PayBoardDimDef` 接口与 `PAY_BOARD_DIMENSIONS`）：

```ts
export interface PayBoardDimDef {
  key: 'dept' | 'projectLevel' | 'industry' | 'stage' | 'tag'
  label: string
  multi?: boolean   // tag 为 true：分组时按标签炸开
}
export const PAY_BOARD_DIMENSIONS: PayBoardDimDef[] = [
  { key: 'dept', label: 'L4部门' },
  { key: 'projectLevel', label: '项目级别' },
  { key: 'industry', label: '行业' },
  { key: 'stage', label: '项目阶段' },
  { key: 'tag', label: '标签', multi: true },
]
```

指标定义段（替换 `PayBoardMetricKey` 与 `PAY_BOARD_METRICS`）：

```ts
export type PayBoardMetricKey =
  | 'projectCount' | 'contractSum' | 'expectedSum' | 'rate' | 'delayedNodeSum'
export interface PayBoardMetricDef {
  key: PayBoardMetricKey
  label: string
  kind: 'count' | 'money' | 'rate'
}
export const PAY_BOARD_METRICS: PayBoardMetricDef[] = [
  { key: 'projectCount', label: '项目数', kind: 'count' },
  { key: 'contractSum', label: '合同总额', kind: 'money' },
  { key: 'expectedSum', label: '计划回款', kind: 'money' },
  { key: 'rate', label: '完成率', kind: 'rate' },
  { key: 'delayedNodeSum', label: '延期节点', kind: 'count' },
]
```

`PAY_BOARD_DIM_BY_KEY`/`PAY_BOARD_METRIC_BY_KEY` 的 `Object.fromEntries(...)` 两行不动（自动随新数组）。`PayBoardGroup` 接口不动（保留 actualSum/pendingSum）。`buildGroup` 不动（仍算全部字段）。

> 注：`mv()` 辅助函数签名 `(g, k: PayBoardMetricKey)` 仍成立（新 key 是旧 key 子集）。

- [ ] **Step 4: PayBoardRow 加 projectLevel/tags + buildPayBoardRows 派生与注入**

`PayBoardRow` 接口加两字段（加在 `progress` 后即可）：

```ts
  projectLevel: string
  tags: string[]
```

`buildPayBoardRows` 签名末位加可选参数：

```ts
export function buildPayBoardRows(
  projects: Project[],
  pmisMap?: Record<string, ProjectPmis>,
  paymentNodes?: Paymentnodes,
  paymentRecords?: Paymentrecords,
  start = '',
  end = '',
  tagAssignments?: Record<string, string[]>,
): PayBoardRow[] {
```

函数体内 `const cust = ...` 之后加一行取 status：

```ts
    const stat = (pmisMap?.[p.projectId]?.status ?? {}) as Record<string, unknown>
```

返回对象里加两字段（加在 `progress,` 行附近，与其它字段并列）：

```ts
      projectLevel: v(stat['项目级别']),
      tags: tagAssignments?.[p.projectId] ?? [],
```

- [ ] **Step 5: groupPayBoard 改为多值炸开（dimValuesOf 助手）**

在 `groupPayBoard` 之前加助手；替换 `groupPayBoard` 函数体：

```ts
/** 取某行在某维的取值列表：multi 维(tag)可多值(空→['无标签'])，其余维恒单值 */
function dimValuesOf(row: PayBoardRow, def: PayBoardDimDef): string[] {
  if (def.multi) {
    const arr = row.tags
    return arr && arr.length ? arr : ['无标签']
  }
  const raw = (row as unknown as Record<string, unknown>)[def.key]
  return [raw == null || String(raw).trim() === '' ? '未指定' : String(raw)]
}

/** 按 1..N 维分桶(桶 key=各维取值 ' / ' 连接),算指标(加权完成率 Σ÷Σ);默认按项目数降序。
 *  含 multi 维(tag)时按各维取值笛卡尔积炸开,一行可计入多桶(标准多标签 faceting,组间重复计数);
 *  非 multi 维全程每行每维恰一值,笛卡尔积退化为现状(零回归)。 */
export function groupPayBoard(rows: PayBoardRow[], dimKeys: string[]): PayBoardGroup[] {
  const defs = dimKeys.map((k) => PAY_BOARD_DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, { values: string[]; rows: PayBoardRow[] }> = {}
  for (const r of rows) {
    let combos: string[][] = [[]]
    for (const d of defs) {
      const vals = dimValuesOf(r, d)
      combos = combos.flatMap((c) => vals.map((val) => [...c, val]))
    }
    for (const combo of combos) {
      const key = combo.join(' / ')
      ;(buckets[key] ||= { values: combo, rows: [] }).rows.push(r)
    }
  }
  return Object.entries(buckets)
    .map(([key, b]) => buildGroup(key, b.values, b.rows))
    .sort((a, b) => b.projectCount - a.projectCount)
}
```

> `payBoardCross`/`payBoardPivot` 不改：内部调 `groupPayBoard`，tag 炸开自动生效。

- [ ] **Step 6: 改 paymentBoard.test 旧维引用 + 加 projectLevel/tags/tag 炸开测试**

(a) `buildPayBoardRows` 的 `describe`：第一个用例「无区间(全部)」末尾加两断言（fixture 已有 A 的 pmisMap，下一步补 status/级别 与 tagAssignments）：

```ts
    expect(a.projectLevel).toBe('A级')
    expect(a.tags).toEqual(['BH项目', '框架合同'])
```

并把该用例的 `buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '')` 调用改为带标签：`buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '', { A: ['BH项目', '框架合同'] })`。

在 fixture 区把 `pmisMap.A` 补 status（原 `{ progress: {...}, customer: {...} }` 加 status）：

```ts
const pmisMap: Record<string, ProjectPmis> = {
  A: { progress: { 项目阶段: '实施' }, customer: { 行业: '银行' }, status: { 项目级别: 'A级' } } as unknown as ProjectPmis,
}
```

(b) `payBoardCross / payBoardPivot` 的 `describe`：把两处 `payBoardCross(rows, 'dept', 'progress', ...)` 的 `'progress'` 改为 `'stage'`（progress 维已移除）：

```ts
    const m = payBoardCross(rows, 'dept', 'stage', 'contractSum')
```
```ts
    const m = payBoardCross(rows, 'dept', 'stage', 'rate')
```

(c) 新增一个 `describe` 验证标签多值炸开（放文件末尾）：

```ts
describe('groupPayBoard 标签多值炸开', () => {
  const rows = buildPayBoardRows(
    projects, pmisMap, paymentNodes, paymentRecords, '', '',
    { A: ['BH项目', '框架合同'], B: ['BH项目'] }, // C 无标签
  )
  it('多标签项目计入它每个标签组；无标签项目归「无标签」', () => {
    const g = groupPayBoard(rows, ['tag'])
    const bh = g.find((x) => x.key === 'BH项目')!
    const fw = g.find((x) => x.key === '框架合同')!
    const none = g.find((x) => x.key === '无标签')!
    // A,B 都挂 BH项目
    expect(bh.projectCount).toBe(2)
    // 仅 A 挂框架合同
    expect(fw.projectCount).toBe(1)
    // 仅 C 无标签
    expect(none.projectCount).toBe(1)
  })
  it('组间重复计数：各标签组项目数之和 > 总项目数(3)', () => {
    const g = groupPayBoard(rows, ['tag'])
    const sum = g.reduce((s, x) => s + x.projectCount, 0)
    expect(sum).toBeGreaterThan(3) // 2(BH)+1(框架)+1(无)=4 > 3
  })
  it('非 tag 维零回归：dept 仍每项目一桶(项目数之和=总数3)', () => {
    const g = groupPayBoard(rows, ['dept'])
    const sum = g.reduce((s, x) => s + x.projectCount, 0)
    expect(sum).toBe(3)
  })
  it('交叉含 tag 维：行/列正常返回', () => {
    const m = payBoardCross(rows, 'dept', 'tag', 'projectCount')
    expect(m.rows.length).toBeGreaterThan(0)
    expect(m.cols).toContain('BH项目')
  })
})
```

- [ ] **Step 7: 跑 paymentBoard 测试确认绿**

Run: `cd frontend && npm run test:run -- paymentBoard`
Expected: PASS（含新 meta、projectLevel/tags、tag 炸开、cross/pivot 改 stage）。

- [ ] **Step 8: BoardView.test 过渡补丁（保全量绿，视图下一任务改）**

`frontend/src/views/BoardView.test.ts` 因 lib 移除 tier/progress 维会红两处，仅做最小过渡修正：

- 「维度与指标标签」用例删两行 `expect(w.text()).toContain('金额档')` 与 `expect(w.text()).toContain('进度态')`（这两维已移除；'部门' 断言因 'L4部门' 含「部门」仍通过，'已回款(万)' 列此刻仍由旧模板硬编码渲染、仍通过）。
- 「切交叉模式 + 次维度渲染矩阵」用例把 `seg-tier` 改 `seg-stage`（tier 维已移除；stage 在 维度与次维度两个 SegToggle 都出现，`findAll(...).at(-1)` 仍取次维度那个）：

```ts
    const stageBtns = w.findAll('[data-test="seg-stage"]')
    await stageBtns[stageBtns.length - 1].trigger('click')
```

> 这两处是过渡性修正，Task2 会随视图重做整体重写本文件。

- [ ] **Step 9: 跑全量 vitest + typecheck 确认绿**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: typecheck 0 error；vitest 全绿（paymentBoard 新测试 + BoardView 过渡补丁 + 其余不受影响）。

- [ ] **Step 10: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add frontend/src/lib/paymentBoard.ts frontend/src/lib/paymentBoard.test.ts frontend/src/views/BoardView.test.ts
git commit -m "$(cat <<'EOF'
feat(SP5): paymentBoard 数据层到目标态 5维/5指标 + 标签多值炸开分组

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: BoardView 视图重做（DataTable 排名表 + 去排序 + 柱状图数字 + 标签接入）

**Files:**
- Modify: `frontend/src/views/BoardView.vue`
- Modify: `frontend/src/views/BoardView.test.ts`
- Modify: `frontend/src/version.ts`

**Interfaces:**
- Consumes: Task1 的 `PAY_BOARD_DIMENSIONS`(5)/`PAY_BOARD_METRICS`(5)/`buildPayBoardRows(...,tagAssignments)`/`groupPayBoard`(tag 炸开)、`PayBoardGroup`(含 key/projectCount/contractSum/expectedSum/actualSum/pendingSum/rate/delayedNodeSum/rows)；`DataTable`(props columns/rows/clickable，emit row-click，slot `#cell-<key>`/`#header-<key>`，sortable 列渲染 `.caret-wrapper`)；`useProjectTagsStore`(load/loaded/assignments)；`fmtRatio`/`rateColorPmis`/`fmtWan`。
- Produces: 重做后的 /payment/board（三模式，5 维/5 指标，DataTable 排名表，柱状图数字）。

- [ ] **Step 1: 改 BoardView.test 预期为重做后形态（先红）**

`frontend/src/views/BoardView.test.ts` 整体替换为（路由桩、seed 不变；mount 增 DataTable 不 stub 以便读 props）：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import BoardView from './BoardView.vue'
import DataTable from '@/components/DataTable.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useDataStore } from '@/stores/data'

let routeQuery: Record<string, string> = {}
vi.mock('vue-router', () => ({ useRoute: () => ({ query: routeQuery }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); routeQuery = {} })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [],
    projects: [
      { projectId: 'P1', projectName: '甲项目', orgL4: '北京', projectManager: '张三',
        payment: { relatedNodeCount: 3, expectedTotal: 1500000, actualTotal: 600000, remainingTotal: 900000, paymentRatio: 0.3, delayedCount: 2 },
        paymentPmis: { contract: 2000000, actualTotal: 600000, expectedTotal: 1500000, delayedCount: 2, nodeCount: 3, reachedCount: 1, fromOrigin: true } },
      { projectId: 'P2', projectName: '乙项目', orgL4: '上海', projectManager: '李四',
        payment: { relatedNodeCount: 1, expectedTotal: 300000, actualTotal: 300000, remainingTotal: 0, paymentRatio: 1, delayedCount: 0 },
        paymentPmis: { contract: 300000, actualTotal: 300000, expectedTotal: 300000, delayedCount: 0, nodeCount: 1, reachedCount: 1, fromOrigin: true } },
    ],
    projectPmis: {
      P1: { progress: { 项目阶段: '实施' }, customer: { 行业: '金融' }, status: { 项目级别: 'A级' } },
      P2: { progress: { 项目阶段: '验收' }, customer: { 行业: '政务' }, status: { 项目级别: 'B级' } },
    },
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

const opts = { global: { plugins: [ElementPlus], stubs: { BoardDrilldownModal: true } } }

describe('BoardView', () => {
  it('默认单维模式：排名表为 DataTable，含两组(北京/上海)', () => {
    seed()
    const w = mount(BoardView, opts)
    const dt = w.findComponent(DataTable)
    expect(dt.exists()).toBe(true)
    const rows = dt.props('rows') as Array<Record<string, any>>
    expect(rows.length).toBe(2)
    expect(rows.some((r) => r.key === '北京')).toBe(true)
    expect(rows.some((r) => r.key === '上海')).toBe(true)
  })

  it('维度集为新 5 维(含 L4部门/标签)，旧维(金额档/进度态)退场', () => {
    seed()
    const w = mount(BoardView, opts)
    expect(w.text()).toContain('L4部门')
    expect(w.text()).toContain('项目级别')
    expect(w.text()).toContain('标签')
    expect(w.text()).not.toContain('金额档')
    expect(w.text()).not.toContain('进度态')
  })

  it('排名表列：含五指标列、无已回款/待回款列、无独立「排序」控件', () => {
    seed()
    const w = mount(BoardView, opts)
    const cols = (w.findComponent(DataTable).props('columns') as Array<{ key: string }>).map((c) => c.key)
    expect(cols).toEqual(['key', 'projectCount', 'contractSum', 'expectedSum', 'rate', 'delayedNodeSum'])
    // 旧排序控件(已回款/延期节点数排序按钮)不存在
    expect(w.find('[data-test="seg-actualSum"]').exists()).toBe(false)
    // 数字列可排序：5 个可排序列渲染 caret-wrapper
    expect(w.findAll('.caret-wrapper').length).toBe(5)
  })

  it('单维点击行打开下钻', async () => {
    seed()
    const w = mount(BoardView, opts)
    const dt = w.findComponent(DataTable)
    const rows = dt.props('rows') as Array<Record<string, any>>
    await dt.vm.$emit('row-click', rows[0])
    expect((w.vm as any).drillOpen).toBe(true)
  })

  it('柱状图含已回/待回/总计数字 label', () => {
    seed()
    const w = mount(BoardView, opts)
    // 读 ChartBox 的 option prop（chartOption 未 defineExpose，经 prop 读取更可靠）
    const series = (w.findComponent(ChartBox).props('option') as any).series
    expect(series.find((s: any) => s.name === '已回款').label.show).toBe(true)
    expect(series.find((s: any) => s.name === '待回款').label.show).toBe(true)
    // 总计 series：透明、顶部 label、formatter 返回总计
    const total = series.find((s: any) => s.name === '总计')
    expect(total.label.position).toBe('top')
    // 图按 expectedSum 降序：P1(北京 expected150万) 居首；已回 round(600000/1e4)=60 + 待回 round(900000/1e4)=90 = 150
    expect(total.label.formatter({ dataIndex: 0 })).toBe('150')
  })

  it('切交叉模式选标签为次维度渲染矩阵', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-cross"]').trigger('click')
    const tagBtns = w.findAll('[data-test="seg-tag"]')
    await tagBtns[tagBtns.length - 1].trigger('click')
    expect(w.find('.bm').exists()).toBe(true)
  })

  it('切透视模式默认渲染透视表(行=L4部门)', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-pivot"]').trigger('click')
    expect(w.find('.pv').exists()).toBe(true)
    expect(w.text()).toContain('北京')
  })

  it('deep-link ?dim=orgL4 落到 L4部门(dept)', () => {
    seed()
    routeQuery = { dim: 'orgL4' }
    const w = mount(BoardView, opts)
    const rows = w.findComponent(DataTable).props('rows') as Array<Record<string, any>>
    expect(rows.some((r) => r.key === '北京')).toBe(true) // dept 分组
  })
})
```

> 总计断言数值核对：图按 `expectedSum` 降序 → P1(expected 1.5M) 居首=dataIndex 0；P1 actual=600000→`Math.round(/1e4)`=60、pending=900000→90、总计=150。故断言 `'150'` 正确（已直接写入，无占位待填）。

- [ ] **Step 2: 跑 BoardView 测试确认红**

Run: `cd frontend && npm run test:run -- BoardView`
Expected: FAIL（现为自绘表 `.bv-body`、有排序控件、无 DataTable/总计 series）。

- [ ] **Step 3: 重做 BoardView.vue —— script 段**

替换 import 与状态/计算（保留 mode/cross/pivot/drill 相关；删 SORT_OPTS/sortKey；加 DataTable/projectTags/fmtRatio/rateColorPmis；改 boardRows 传 tags；groups 不再二次排序；加 chartTop/tableColumns；deep-link 别名）：

import 段调整：
```ts
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useSettingsStore } from '@/stores/settings'
import { useProjectTagsStore } from '@/stores/projectTags'
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'
import {
  PAY_BOARD_DIMENSIONS as DIMENSIONS, PAY_BOARD_METRICS as METRICS, PAY_BOARD_METRIC_BY_KEY as METRIC_BY_KEY,
  buildPayBoardRows, groupPayBoard, payBoardCross, payBoardPivot, type PayBoardGroup,
} from '@/lib/paymentBoard'
import { filterProjects, rateColorPmis } from '@/lib/paymentPmis'
import { fmtWan, fmtRatio, pct } from '@/lib/format'
import ChartBox from '@/charts/ChartBox.vue'
import SegToggle from '@/components/SegToggle.vue'
import DimPicker from '@/components/DimPicker.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import BoardMatrix from '@/components/BoardMatrix.vue'
import PivotTable from '@/components/PivotTable.vue'
import BoardDrilldownModal from '@/components/BoardDrilldownModal.vue'

const route = useRoute()
const data = useDataStore()
const filter = useFilterStore()
const settings = useSettingsStore()
const projectTags = useProjectTagsStore()
onMounted(() => { if (!projectTags.loaded) projectTags.load() })
```

`DIM_OPTS`/`METRIC_OPTS`/`MODE_OPTS` 保留；**删** `SORT_OPTS`。

deep-link 别名（替换 `initDim`）：
```ts
const rawDim = typeof route.query.dim === 'string' ? route.query.dim : ''
const aliasDim = rawDim === 'orgL4' ? 'dept' : rawDim
const initDim = DIMENSIONS.some((d) => d.key === aliasDim) ? aliasDim : 'dept'
```

状态：删 `const sortKey = ref('actualSum')`；其余 `mode`/`dimKey`/`secondDim`/`metricKey`/`rowDims`/`colDims` 保留。

`boardRows` 末参加 tags：
```ts
const boardRows = computed(() =>
  buildPayBoardRows(
    filterProjects(data.data?.projects ?? [], {
      viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
      excludeActive: filter.excludeOn, excludedIds: filter.excludedIds,
    }),
    data.data?.projectPmis ?? {},
    data.data?.paymentNodes,
    filter.payRecordsAll,
    filter.dateStart,
    filter.dateEnd,
    projectTags.assignments,
  ),
)
```

单维 groups（去二次排序，直接用 groupPayBoard 的项目数降序）+ 表列 + 图数据：
```ts
// ---- 单维 ----
const groups = computed<PayBoardGroup[]>(() => groupPayBoard(boardRows.value, [dimKey.value]))

const dimLabel = computed(() => DIM_OPTS.find((d) => d.value === dimKey.value)?.label ?? '维度')
const tableColumns = computed<DataColumn[]>(() => [
  { key: 'key', label: dimLabel.value },
  { key: 'projectCount', label: '项目数', sortable: true, num: true },
  { key: 'contractSum', label: '合同总额(万)', sortable: true, num: true, formatter: (v) => fmtWan(v) },
  { key: 'expectedSum', label: '计划回款(万)', sortable: true, num: true, formatter: (v) => fmtWan(v) },
  { key: 'rate', label: '完成率', sortable: true, num: true },
  { key: 'delayedNodeSum', label: '延期节点', sortable: true, num: true },
])

// 柱状图：按计划回款降序 Top15，整数万；已回/待回柱内 + 总计柱顶
const chartTop = computed(() => [...groups.value].sort((a, b) => b.expectedSum - a.expectedSum).slice(0, 15))
const chartOption = computed(() => {
  const sc = settings.theme === 'dark' ? STATUS_DARK : STATUS_LIGHT
  const t = chartTop.value
  const paid = t.map((g) => Math.round(g.actualSum / 10000))
  const pending = t.map((g) => Math.round(g.pendingSum / 10000))
  const total = t.map((_, i) => paid[i] + pending[i])
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['已回款', '待回款'], top: 0 },
    grid: { left: 60, right: 20, top: 30, bottom: 60 },
    xAxis: { type: 'category', data: t.map((g) => g.key), axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: '金额(万)' },
    series: [
      { name: '已回款', type: 'bar', stack: 'a', data: paid, itemStyle: { color: sc.ok }, label: { show: true, position: 'inside' } },
      { name: '待回款', type: 'bar', stack: 'a', data: pending, itemStyle: { color: sc.warn }, label: { show: true, position: 'inside' } },
      // 透明总计 series:0 高、不入 legend,顶部显示 已回+待回 总计(ECharts 堆叠柱无内建总计)
      { name: '总计', type: 'bar', stack: 'a', data: total.map(() => 0), itemStyle: { color: 'transparent' },
        tooltip: { show: false }, label: { show: true, position: 'top', formatter: (p: { dataIndex: number }) => String(total[p.dataIndex]) } },
    ],
  }
})
```

> `pct` 仍被交叉/透视 `metricFormat` 用（rate kind→pct），保留 import。`metricKind`/`metricFormat`/交叉 `matrix`/`crossChartOption`/透视 `pivot`/下钻 `openDrill`/`onCellClick`/`onPivotCellClick`/`defineExpose` 全部不动；`SECOND_OPTS`/`watch(dimKey)` 不动。

- [ ] **Step 4: 重做 BoardView.vue —— 模板段**

(a) 排名模式工具栏删「排序」块（删除整个 `<div class="bv-ctl"><span>排序</span><SegToggle v-model="sortKey".../></div>`），保留 模式 + 维度。

(b) 排名模式的 `<!-- 单维 -->` 区块里，把自绘 `.bv-table` 整段换为 DataTable（图卡 `<section>` 不动，仅换表卡）：

```vue
        <section class="bv-card">
          <h3 class="bv-title">分组排名（点击行下钻该组项目）</h3>
          <DataTable :columns="tableColumns" :rows="groups" clickable @row-click="(r) => openDrill(r as PayBoardGroup)">
            <template #cell-rate="{ value }">
              <span class="u-num" :style="{ color: rateColorPmis(value) }">{{ fmtRatio(value) }}</span>
            </template>
            <template #cell-delayedNodeSum="{ value }">
              <span class="u-num" :class="{ 'bv-danger': value > 0 }">{{ value }}</span>
            </template>
          </DataTable>
        </section>
```

(c) 交叉/透视两区块模板不动。

(d) `<style>`：删不再使用的 `.bv-table`/`.bv-row`/`.bv-head`/`.bv-body`/`.bv-c-name`/`.bv-paid`/`.bv-remain` 规则；**保留** `.bv-danger`（DataTable 单元格仍用）。其余 `.board-view`/`.bv-toolbar`/`.bv-ctl`/`.bv-card`/`.bv-title`/`.bv-empty` 保留。

- [ ] **Step 5: 跑 BoardView 测试确认绿**

Run: `cd frontend && npm run test:run -- BoardView`
Expected: PASS（DataTable 表、5 列、5 caret、无 seg-actualSum、行下钻、总计 series formatter='150'、tag 次维度矩阵、deep-link orgL4→dept）。
若总计断言数值与实现不一致，核对 P1 actual/pending 取整后修正断言（应为 `'150'`）。

- [ ] **Step 6: bump 版本**

`frontend/src/version.ts` 第 2 行：`export const APP_VERSION = 'V1.14.0'`（`RELEASE_DATE` 保持 `'2026-06-19'`）。

- [ ] **Step 7: 全量 verify**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && bash verify.sh`
Expected: ruff / pytest / typecheck / vitest / build 全绿。重点确认 paymentBoard、BoardView 套件全过，无悬挂引用（删 SORT_OPTS/bv-table 后），DataTable/projectTags 接入无类型错。

- [ ] **Step 8: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add frontend/src/views/BoardView.vue frontend/src/views/BoardView.test.ts frontend/src/version.ts
git commit -m "$(cat <<'EOF'
feat(SP5): /payment/board 视图重做 DataTable排名表+去排序+柱状图数字+标签维度 (V1.14.0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage（spec 逐节 → 任务）：**
- §1 维度集 5 维 → T1 Step3 ✓；§1 指标 5 项 → T1 Step3 ✓
- §2.1 projectLevel/tags 字段 + tagAssignments 参 → T1 Step4 ✓
- §2.4 标签多值炸开 groupPayBoard → T1 Step5 + 测试 Step6(c) ✓
- §2.5 deep-link orgL4 别名 → T2 Step3(initDim) + 测试 T2 Step1 ✓
- §3.1 工具栏去排序 → T2 Step4(a) ✓；§3.2 DataTable 排名表 → T2 Step3/4(b) ✓
- §3.3 柱状图已回/待回/总计数字整数万 → T2 Step3(chartOption) ✓
- §3.4 标签 store 接入 → T2 Step3(onMounted+boardRows) ✓
- §4 版本 V1.14.0 → T2 Step6 ✓；测试覆盖 paymentBoard/BoardView → T1 Step6 + T2 Step1 ✓

**2. Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码。T2 Step1 测试里总计 formatter 断言显式标注「占位 `'21'` 改为 `'150'`」并在 Step5 复核——已用确定值 `'150'` 收口，无残留占位。

**3. 柱状图机制收口（spec §3.3 细化）：** spec 文字曾把「总计」label 挂在待回款顶层 series，但单 series 仅一个 label 位置、无法同时显示段内值与柱顶总计。计划改为**透明总计 series**（data=0、不入 legend、position:'top'、formatter 取预算 total[dataIndex]）——产出的可见结果与 spec 完全一致（已回内/待回内/总计顶），仅机制更可靠。属机制细化非行为偏离。

**4. 类型/命名一致性：** `PayBoardGroup`(key/projectCount/contractSum/expectedSum/actualSum/pendingSum/rate/delayedNodeSum/rows) 在 T1 定义、T2 表列与图消费一致；`tableColumns` key 与断言 `['key','projectCount','contractSum','expectedSum','rate','delayedNodeSum']` 一致；DataTable slot `#cell-rate`/`#cell-delayedNodeSum` 与 col key 一致；`buildPayBoardRows` 第 7 参 `tagAssignments` 在 T1 定义、T2 传 `projectTags.assignments`；`groupPayBoard` 多值在 T1 实现、tag 维在 T2 经 DIM_OPTS 暴露选用。

> backlog 承接：OrgRanking 散值等 pre-existing 项不在本轮。
