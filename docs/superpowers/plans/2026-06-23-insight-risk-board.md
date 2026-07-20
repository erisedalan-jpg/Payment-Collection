# 风险看板 + /insight 与 /insight/board 改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在"项目分析"区新增风险看板 `/insight/risk`（4 卡片 + 风险排名 + 风险概览表），并为 `/insight` 调整维度（去评级、加项目级别）、为 `/insight/board` 排名加排序选项卡。

**Architecture:** 纯前端，复用现有多维分析基建（`SegToggle`/`ChartTypeSelector`/`chartOptions.buildRankingOption`/`DataTable`）。风险口径"仅看未关闭风险"从 `pmis.riskRecords` 现场计算，新建独立纯函数库 `lib/riskBoard.ts`，零后端/数据迁移。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + ECharts；测试 vitest（`frontend/`）；spec：`docs/superpowers/specs/2026-06-23-insight-risk-board-design.md`。

## Global Constraints

- 简体中文 UI；**不使用任何 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`。
- 样式只引用 `frontend/src/styles/theme.css` 设计令牌，**不手写散值**；金额/百分比/数字列挂 `.u-num`；状态用淡底深字三态（高=danger/中=warn/低=advance/健康=ok），禁止实底+小号白字。
- 版本单一来源 `frontend/src/version.ts`，本期 → **V1.18.0**（新增整页 Y 级，无需大版本确认）。
- 风险口径"仅看未关闭风险"：项目有风险 ⟺ 存在 `风险状态` 不含"已关闭"且 `风险等级`∈{高,中,低} 的记录；等级取这些记录的最高（高>中>低）；否则"无风险"。全量按 `{无风险,高,中,低}` 互斥四分。
- 合同金额字段统一取 `pmis.customer.合同总额`（与 /insight `contractAmount` 同源）。
- 每任务自带 commit，逐文件 `git add`，提交信息结尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 文档（spec/plan）写盘不 commit（项目惯例）。
- 验证命令：前端 `cd frontend && npx vitest run <file>`；整体 `bash verify.sh`。

---

### Task 1: riskBoard 口径核心（lib/riskBoard.ts 第一部分）

**Files:**
- Create: `frontend/src/lib/riskBoard.ts`
- Test: `frontend/src/lib/riskBoard.test.ts`

**Interfaces:**
- Consumes: `Project`, `ProjectPmis`（`@/types/analysis`）；`ProjectPmis.riskRecords: Array<Record<string,unknown>>`（中文键 `风险等级`/`风险状态` 透传）；`pmis.status.项目级别`、`pmis.customer.行业`、`pmis.customer.合同总额`、`p.orgL4`、`p.projectManager`。
- Produces: `RiskLevel`、`projectRiskLevel(pmis)`、`openRiskCount(pmis)`、`RiskRow`、`buildRiskRows(projects, pmisMap)`、`RiskSummary`、`riskSummary(rows)`。

- [ ] **Step 1: 写失败测试**

写入 `frontend/src/lib/riskBoard.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import { projectRiskLevel, openRiskCount, buildRiskRows, riskSummary } from './riskBoard'

const rec = (lvl: string, status: string) => ({ 风险等级: lvl, 风险状态: status })

describe('projectRiskLevel / openRiskCount', () => {
  it('未关闭记录取最高等级', () => {
    const pmis = { riskRecords: [rec('中', '处理中'), rec('高', '未关闭')] } as unknown as ProjectPmis
    expect(projectRiskLevel(pmis)).toBe('高')
    expect(openRiskCount(pmis)).toBe(2)
  })
  it('忽略已关闭记录:仅未关闭的中→中', () => {
    const pmis = { riskRecords: [rec('高', '已关闭'), rec('中', '跟进中')] } as unknown as ProjectPmis
    expect(projectRiskLevel(pmis)).toBe('中')
    expect(openRiskCount(pmis)).toBe(1)
  })
  it('全部已关闭 → 无风险, openRiskCount=0', () => {
    const pmis = { riskRecords: [rec('高', '已关闭')] } as unknown as ProjectPmis
    expect(projectRiskLevel(pmis)).toBe('无风险')
    expect(openRiskCount(pmis)).toBe(0)
  })
  it('无记录/未定义 → 无风险', () => {
    expect(projectRiskLevel(undefined)).toBe('无风险')
    expect(projectRiskLevel({ riskRecords: [] } as unknown as ProjectPmis)).toBe('无风险')
  })
  it('未关闭但等级空 → 无风险(有未关闭记录但不分级)', () => {
    const pmis = { riskRecords: [rec('', '未关闭')] } as unknown as ProjectPmis
    expect(projectRiskLevel(pmis)).toBe('无风险')
    expect(openRiskCount(pmis)).toBe(1)
  })
})

describe('buildRiskRows', () => {
  const projects = [
    { projectId: 'P1', projectName: '甲', orgL4: '交付一组', projectManager: '张三' },
    { projectId: 'P2', projectName: '乙', orgL4: '', projectManager: '' },
  ] as unknown as Project[]
  const pmisMap = {
    P1: { status: { 项目级别: 'A级' }, customer: { 行业: '金融', 合同总额: 2000000 },
          riskRecords: [rec('高', '未关闭')] },
    P2: { status: {}, customer: {}, riskRecords: [] },
  } as unknown as Record<string, ProjectPmis>

  it('字段映射与缺省归一,含异常项目(orgL4 空)', () => {
    const rows = buildRiskRows(projects, pmisMap)
    expect(rows).toHaveLength(2)
    const [a, b] = rows
    expect(a).toMatchObject({ projectId: 'P1', orgL4: '交付一组', projectLevel: 'A级',
      manager: '张三', industry: '金融', riskLevel: '高', openRisks: 1, contractAmount: 2000000 })
    expect(b).toMatchObject({ projectId: 'P2', orgL4: '未指定', projectLevel: '未指定',
      manager: '未指定', industry: '未指定', riskLevel: '无风险', openRisks: 0, contractAmount: 0 })
  })
})

describe('riskSummary', () => {
  it('四类互斥分区与健康度/有风险', () => {
    const rows = [
      { riskLevel: '高' }, { riskLevel: '高' }, { riskLevel: '中' },
      { riskLevel: '低' }, { riskLevel: '无风险' }, { riskLevel: '无风险' },
    ] as any
    const s = riskSummary(rows)
    expect(s).toMatchObject({ total: 6, noRisk: 2, high: 2, mid: 1, low: 1, hasRisk: 4 })
    expect(s.healthPct).toBeCloseTo(2 / 6)
    expect(s.total).toBe(s.noRisk + s.high + s.mid + s.low)
  })
  it('空列表 healthPct=null', () => {
    expect(riskSummary([]).healthPct).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts`
Expected: FAIL（`riskBoard.ts` 不存在 / 函数未定义）。

- [ ] **Step 3: 写实现**

写入 `frontend/src/lib/riskBoard.ts`：

```ts
import type { Project, ProjectPmis } from '@/types/analysis'

export type RiskLevel = '高' | '中' | '低' | '无风险'
const RISK_RANK: Record<string, number> = { 高: 3, 中: 2, 低: 1 }

const v = (raw: unknown, fallback = '未指定'): string => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? fallback : s
}

/** 未关闭风险记录(风险状态不含"已关闭") */
function openRecords(pmis: ProjectPmis | undefined): Array<Record<string, unknown>> {
  const recs = (pmis?.riskRecords ?? []) as Array<Record<string, unknown>>
  return recs.filter((r) => !String(r['风险状态'] ?? '').includes('已关闭'))
}

export function openRiskCount(pmis: ProjectPmis | undefined): number {
  return openRecords(pmis).length
}

/** 仅看未关闭风险:取未关闭记录里最高等级(高>中>低);无未关闭分级风险→无风险 */
export function projectRiskLevel(pmis: ProjectPmis | undefined): RiskLevel {
  let best = 0
  for (const r of openRecords(pmis)) {
    const rank = RISK_RANK[String(r['风险等级'] ?? '').trim()] ?? 0
    if (rank > best) best = rank
  }
  return best === 3 ? '高' : best === 2 ? '中' : best === 1 ? '低' : '无风险'
}

export interface RiskRow {
  projectId: string
  projectName: string
  orgL4: string
  projectLevel: string
  manager: string
  industry: string
  riskLevel: RiskLevel
  openRisks: number
  contractAmount: number
}

export function buildRiskRows(projects: Project[], pmisMap: Record<string, ProjectPmis>): RiskRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as ProjectPmis
    const st = (m.status ?? {}) as Record<string, unknown>
    const cust = (m.customer ?? {}) as Record<string, unknown>
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      orgL4: v(p.orgL4),
      projectLevel: v(st['项目级别']),
      manager: v(p.projectManager),
      industry: v(cust['行业']),
      riskLevel: projectRiskLevel(m),
      openRisks: openRiskCount(m),
      contractAmount: Number(cust['合同总额'] ?? 0),
    }
  })
}

export interface RiskSummary {
  total: number
  noRisk: number
  high: number
  mid: number
  low: number
  hasRisk: number
  healthPct: number | null
}

export function riskSummary(rows: RiskRow[]): RiskSummary {
  let noRisk = 0, high = 0, mid = 0, low = 0
  for (const r of rows) {
    if (r.riskLevel === '高') high++
    else if (r.riskLevel === '中') mid++
    else if (r.riskLevel === '低') low++
    else noRisk++
  }
  const total = rows.length
  const hasRisk = high + mid + low
  return { total, noRisk, high, mid, low, hasRisk, healthPct: total > 0 ? noRisk / total : null }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts`
Expected: PASS（全部用例绿）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/riskBoard.ts frontend/src/lib/riskBoard.test.ts
git commit -m "feat(risk): riskBoard 口径核心(仅看未关闭风险/buildRiskRows/riskSummary)"
```

---

### Task 2: riskBoard 排名与概览聚合（lib/riskBoard.ts 第二部分）

**Files:**
- Modify: `frontend/src/lib/riskBoard.ts`（追加导出）
- Test: `frontend/src/lib/riskBoard.test.ts`（追加 describe）

**Interfaces:**
- Consumes: `RiskRow`（Task 1）。
- Produces: `RiskDimDef`、`RISK_DIMENSIONS`、`RiskMetricKey`、`RiskMetricDef`、`RISK_METRICS`、`RiskGroup`、`groupRisk(rows, dimKey)`、`RiskOverviewRow`、`riskOverview(rows, dimKey)`。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/riskBoard.test.ts` 末尾追加：

```ts
import { RISK_DIMENSIONS, RISK_METRICS, groupRisk, riskOverview } from './riskBoard'

const RR = [
  { orgL4: '一组', riskLevel: '高', openRisks: 2, contractAmount: 100 },
  { orgL4: '一组', riskLevel: '无风险', openRisks: 0, contractAmount: 200 },
  { orgL4: '二组', riskLevel: '中', openRisks: 1, contractAmount: 300 },
] as any

describe('风险契约面/聚合', () => {
  it('维度与统计清单', () => {
    expect(RISK_DIMENSIONS.map((d) => d.key)).toEqual(['riskLevel', 'orgL4', 'projectLevel', 'manager', 'industry'])
    expect(RISK_METRICS.map((m) => m.key)).toEqual(['projectCount', 'hasRiskCount', 'openRiskSum', 'contractAmount'])
  })
  it('groupRisk 按维分桶算统计,默认项目数降序', () => {
    const gs = groupRisk(RR, 'orgL4')
    expect(gs.map((g) => g.key)).toEqual(['一组', '二组'])   // 2 > 1
    const g1 = gs.find((g) => g.key === '一组')!
    expect(g1).toMatchObject({ projectCount: 2, hasRiskCount: 1, openRiskSum: 2, contractAmount: 300 })
  })
  it('riskOverview 四类计数 + total + healthPct, 按 total 降序', () => {
    const ov = groupRisk.length && riskOverview(RR, 'orgL4')
    expect(ov.map((r) => r.key)).toEqual(['一组', '二组'])
    const o1 = ov.find((r) => r.key === '一组')!
    expect(o1).toMatchObject({ 高: 1, 中: 0, 低: 0, 无风险: 1, total: 2 })
    expect(o1.healthPct).toBeCloseTo(0.5)
    const o2 = ov.find((r) => r.key === '二组')!
    expect(o2.healthPct).toBeCloseTo(0)   // 无 无风险
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts`
Expected: FAIL（新导出未定义）。

- [ ] **Step 3: 写实现**

在 `frontend/src/lib/riskBoard.ts` 末尾追加：

```ts
export interface RiskDimDef { key: 'riskLevel' | 'orgL4' | 'projectLevel' | 'manager' | 'industry'; label: string }
export const RISK_DIMENSIONS: RiskDimDef[] = [
  { key: 'riskLevel', label: '风险等级' },
  { key: 'orgL4', label: 'L4组织' },
  { key: 'projectLevel', label: '项目级别' },
  { key: 'manager', label: '项目经理' },
  { key: 'industry', label: '行业' },
]

export type RiskMetricKey = 'projectCount' | 'hasRiskCount' | 'openRiskSum' | 'contractAmount'
export interface RiskMetricDef { key: RiskMetricKey; label: string; kind: 'count' | 'money' }
export const RISK_METRICS: RiskMetricDef[] = [
  { key: 'projectCount', label: '项目数', kind: 'count' },
  { key: 'hasRiskCount', label: '有风险项目数', kind: 'count' },
  { key: 'openRiskSum', label: '未关闭风险数', kind: 'count' },
  { key: 'contractAmount', label: '合同总额', kind: 'money' },
]

export interface RiskGroup {
  key: string
  rows: RiskRow[]
  projectCount: number
  hasRiskCount: number
  openRiskSum: number
  contractAmount: number
}

export function groupRisk(rows: RiskRow[], dimKey: RiskDimDef['key']): RiskGroup[] {
  const buckets: Record<string, RiskRow[]> = {}
  for (const r of rows) {
    const key = String(r[dimKey])
    ;(buckets[key] ||= []).push(r)
  }
  return Object.entries(buckets)
    .map(([key, grows]) => ({
      key,
      rows: grows,
      projectCount: grows.length,
      hasRiskCount: grows.filter((r) => r.riskLevel !== '无风险').length,
      openRiskSum: grows.reduce((s, r) => s + r.openRisks, 0),
      contractAmount: grows.reduce((s, r) => s + r.contractAmount, 0),
    }))
    .sort((a, b) => b.projectCount - a.projectCount)
}

export interface RiskOverviewRow {
  key: string
  高: number
  中: number
  低: number
  无风险: number
  total: number
  healthPct: number | null
}

export function riskOverview(rows: RiskRow[], dimKey: RiskDimDef['key']): RiskOverviewRow[] {
  const buckets: Record<string, RiskRow[]> = {}
  for (const r of rows) {
    const key = String(r[dimKey])
    ;(buckets[key] ||= []).push(r)
  }
  return Object.entries(buckets)
    .map(([key, grows]) => {
      const c = { 高: 0, 中: 0, 低: 0, 无风险: 0 }
      for (const r of grows) c[r.riskLevel]++
      const total = grows.length
      return { key, 高: c.高, 中: c.中, 低: c.低, 无风险: c.无风险, total, healthPct: total > 0 ? c.无风险 / total : null }
    })
    .sort((a, b) => b.total - a.total)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/riskBoard.ts frontend/src/lib/riskBoard.test.ts
git commit -m "feat(risk): riskBoard 排名分组 groupRisk + 概览 riskOverview"
```

---

### Task 3: buildRankingOption 支持饼图图例显数量（chartOptions.ts）

**Files:**
- Modify: `frontend/src/lib/chartOptions.ts`
- Test: `frontend/src/lib/chartOptions.test.ts`

**Interfaces:**
- Produces: `RankingOptionParams.legendCounts?: number[]`；`buildRankingOption('pie', {..., legendCounts})` 设 `legend.formatter`，不传则不变（向后兼容）。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/chartOptions.test.ts` 末尾追加（若文件不存在则创建并补 import）：

```ts
import { buildRankingOption } from './chartOptions'

describe('buildRankingOption pie legendCounts', () => {
  it('传 legendCounts → legend.formatter 显 名称(数量)', () => {
    const opt = buildRankingOption('pie', {
      categories: ['一组', '二组'], values: [10, 20], metricLabel: '合同总额',
      valueKind: 'amount', legendCounts: [3, 5],
    })
    expect(typeof (opt.legend as any).formatter).toBe('function')
    expect((opt.legend as any).formatter('一组')).toBe('一组 (3)')
    expect((opt.legend as any).formatter('二组')).toBe('二组 (5)')
  })
  it('不传 legendCounts → 无 formatter(回归)', () => {
    const opt = buildRankingOption('pie', {
      categories: ['一组'], values: [10], metricLabel: '项目数', valueKind: 'count',
    })
    expect((opt.legend as any).formatter).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/chartOptions.test.ts`
Expected: FAIL（formatter 不存在）。

- [ ] **Step 3: 写实现**

在 `frontend/src/lib/chartOptions.ts`：

(a) `RankingOptionParams` 接口加可选字段：

```ts
export interface RankingOptionParams {
  categories: string[]
  values: number[]
  metricLabel: string
  valueKind: ValueKind
  legendCounts?: number[]
}
```

(b) 把 `type === 'pie'` 分支里的 `legend` 由内联对象改为变量并按需加 formatter：

```ts
  if (type === 'pie') {
    const pieData = categories.map((name, i) => ({ name, value: values[i] }))
    const legend: Record<string, any> = { type: 'scroll', orient: 'vertical', right: 10, top: 'middle' }
    if (params.legendCounts) {
      const countByName: Record<string, number> = {}
      categories.forEach((name, i) => { countByName[name] = params.legendCounts![i] })
      legend.formatter = (name: string) => `${name} (${countByName[name] ?? 0})`
    }
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
      legend,
      color: CHART_LIGHT,
      series: [
        {
          name: metricLabel,
          type: 'pie',
          radius: ['40%', '70%'],
          data: pieData,
          label: {
            show: true,
            formatter: (p: { name: string; value: number; percent: number }) =>
              `${p.name}\n${formatter({ value: p.value })}`,
          },
          emphasis: { itemStyle: { shadowBlur: 8, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.3)' } },
        },
      ],
    }
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/chartOptions.test.ts`
Expected: PASS（新用例 + 既有用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/chartOptions.ts frontend/src/lib/chartOptions.test.ts
git commit -m "feat(chart): buildRankingOption 饼图可选 legendCounts 图例显数量"
```

---

### Task 4: /insight 维度去评级、加项目级别（projectPivot.ts）

**Files:**
- Modify: `frontend/src/lib/projectPivot.ts`
- Test: `frontend/src/lib/projectPivot.test.ts`

**Interfaces:**
- 改动：`InsightRow` 去 `rating`、加 `projectLevel`；`InsightDimDef.key` union 去 `'rating'`、加 `'projectLevel'`；`INSIGHT_DIMENSIONS` 去"评级"、在"服务组"后加"项目级别"。`/insight` 视图三块（DIM_OPTS 派生）自动同步，无需改 InsightView.vue。

- [ ] **Step 1: 改测试为新契约（先红）**

改 `frontend/src/lib/projectPivot.test.ts`：

(a) 把第 116-120 行"契约面"用例改为：

```ts
describe('契约面', () => {
  it('维度去评级加项目级别;6 指标', () => {
    expect(INSIGHT_DIMENSIONS.map((d) => d.label)).toEqual(['阶段', '项目状态', '风险等级', '项目经理', '服务组', '项目级别', '行业', '签约单位', '健康度', '超支', '暂停'])
    expect(INSIGHT_DIMENSIONS.map((d) => d.key)).not.toContain('rating')
    expect(INSIGHT_METRICS.map((m) => m.key)).toEqual(['projectCount', 'contractAmount', 'avgProgress', 'avgCostRatio', 'paymentRatio', 'delayedProjects'])
  })
})
```

(b) 在 `describe('buildInsightRows', ...)` 内追加一条用例（断言 projectLevel 映射、无 rating）：

```ts
  it('含 projectLevel 维度,不再有 rating', () => {
    const pmis = { 'P-1': { status: { 项目级别: 'A级' } } } as unknown as Record<string, ProjectPmis>
    const projects = [{ projectId: 'P-1', projectName: '甲', orgL4: '交付一组', payment: { ...PAY0 }, health: {} }] as unknown as Project[]
    const r = buildInsightRows(projects, pmis)[0] as Record<string, unknown>
    expect(r.projectLevel).toBe('A级')
    expect('rating' in r).toBe(false)
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/projectPivot.test.ts`
Expected: FAIL（当前含 '评级'、无 projectLevel）。

- [ ] **Step 3: 写实现**

在 `frontend/src/lib/projectPivot.ts`：

(a) `InsightRow` 接口：删除 `rating: string`（原第 19 行），在 `orgL4: string` 后加 `projectLevel: string`。结果片段：

```ts
  health: string
  orgL4: string
  projectLevel: string
  overspend: string // '是' | '否'(维度用字符串值)
  paused: string    // '是' | '否'
```

(b) `buildInsightRows` 返回对象：删除 `rating: v(st.评级, '无'),`（原第 57 行），在 `orgL4: v(p.orgL4),` 后加 `projectLevel: v(st.项目级别),`。结果片段：

```ts
      health: v(p.health?.overall, '无数据'),
      orgL4: v(p.orgL4),
      projectLevel: v(st.项目级别),
      overspend: cost.项目超支 === true ? '是' : '否',
```

(c) `InsightDimDef.key` union（原第 72 行）：去 `'rating'`、加 `'projectLevel'`：

```ts
export interface InsightDimDef {
  key: 'stage' | 'projectStatus' | 'riskLevel' | 'manager' | 'orgL4' | 'projectLevel' | 'industry' | 'signType' | 'health' | 'overspend' | 'paused'
  label: string
}
```

(d) `INSIGHT_DIMENSIONS`（原第 78-90 行）：删除 `{ key: 'rating', label: '评级' }`，在 `{ key: 'orgL4', label: '服务组' }` 后插入 `{ key: 'projectLevel', label: '项目级别' }`：

```ts
export const INSIGHT_DIMENSIONS: InsightDimDef[] = [
  { key: 'stage', label: '阶段' },
  { key: 'projectStatus', label: '项目状态' },
  { key: 'riskLevel', label: '风险等级' },
  { key: 'manager', label: '项目经理' },
  { key: 'orgL4', label: '服务组' },
  { key: 'projectLevel', label: '项目级别' },
  { key: 'industry', label: '行业' },
  { key: 'signType', label: '签约单位' },
  { key: 'health', label: '健康度' },
  { key: 'overspend', label: '超支' },
  { key: 'paused', label: '暂停' },
]
```

- [ ] **Step 4: 运行确认通过 + 全仓回归**

Run: `cd frontend && npx vitest run src/lib/projectPivot.test.ts src/views/InsightView.test.ts`
Expected: PASS。若 `InsightView.test.ts` 有断言"评级"则按本任务改为"项目级别"（grep 确认：`grep -n "评级\|rating" src/views/InsightView.test.ts`；该处仅 /insight 维度上下文才改，其它页面的"评级"列不动）。再跑 `npx vitest run src/lib/projectPivot.test.ts` 与 typecheck：`npx vue-tsc --noEmit` 确认无残留 `rating` 引用。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/projectPivot.ts frontend/src/lib/projectPivot.test.ts
git commit -m "feat(insight): 维度去掉评级、新增项目级别"
```

---

### Task 5: board 排名排序纯函数（paymentBoard.ts）

**Files:**
- Modify: `frontend/src/lib/paymentBoard.ts`（追加导出）
- Test: `frontend/src/lib/paymentBoard.test.ts`（追加）

**Interfaces:**
- Consumes: `PayBoardGroup`（既有，含 `projectCount`/`contractSum`/`rate`/`delayedNodeSum`，`rate: number|null`）。
- Produces: `PayBoardSortKey`、`PAY_BOARD_SORTS`、`sortPayBoardGroups(groups, key)`。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/paymentBoard.test.ts` 末尾追加：

```ts
import { sortPayBoardGroups, PAY_BOARD_SORTS } from './paymentBoard'

const G = (key: string, p: number, c: number, rate: number | null, d: number) =>
  ({ key, values: [key], rows: [], projectCount: p, contractSum: c, actualSum: 0, expectedSum: 0, pendingSum: 0, rate, delayedNodeSum: d }) as any

describe('sortPayBoardGroups', () => {
  const gs = [G('A', 1, 300, 0.5, 2), G('B', 3, 100, null, 0), G('C', 2, 200, 0.9, 5)]
  it('PAY_BOARD_SORTS 四项', () => {
    expect(PAY_BOARD_SORTS.map((s) => s.key)).toEqual(['projectCount', 'contractSum', 'rate', 'delayedNodeSum'])
  })
  it('按项目数降序', () => {
    expect(sortPayBoardGroups(gs, 'projectCount').map((g) => g.key)).toEqual(['B', 'C', 'A'])
  })
  it('按合同金额降序', () => {
    expect(sortPayBoardGroups(gs, 'contractSum').map((g) => g.key)).toEqual(['A', 'C', 'B'])
  })
  it('按完成率降序,null 排末', () => {
    expect(sortPayBoardGroups(gs, 'rate').map((g) => g.key)).toEqual(['C', 'A', 'B'])
  })
  it('按延期节点降序', () => {
    expect(sortPayBoardGroups(gs, 'delayedNodeSum').map((g) => g.key)).toEqual(['C', 'A', 'B'])
  })
  it('不改入参(返回副本)', () => {
    const copy = [...gs]
    sortPayBoardGroups(gs, 'rate')
    expect(gs).toEqual(copy)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentBoard.test.ts`
Expected: FAIL（未定义）。

- [ ] **Step 3: 写实现**

在 `frontend/src/lib/paymentBoard.ts` 末尾追加：

```ts
export type PayBoardSortKey = 'projectCount' | 'contractSum' | 'rate' | 'delayedNodeSum'
export const PAY_BOARD_SORTS: { key: PayBoardSortKey; label: string }[] = [
  { key: 'projectCount', label: '项目数' },
  { key: 'contractSum', label: '合同金额' },
  { key: 'rate', label: '完成率' },
  { key: 'delayedNodeSum', label: '延期节点' },
]

/** 按 key 降序排序分组副本;rate 为 null 视作 -Infinity(排末尾)。不改入参。 */
export function sortPayBoardGroups(groups: PayBoardGroup[], key: PayBoardSortKey): PayBoardGroup[] {
  const val = (g: PayBoardGroup): number => {
    const x = g[key]
    return x == null ? -Infinity : (x as number)
  }
  return [...groups].sort((a, b) => val(b) - val(a))
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentBoard.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/paymentBoard.ts frontend/src/lib/paymentBoard.test.ts
git commit -m "feat(board): 排名排序纯函数 sortPayBoardGroups + PAY_BOARD_SORTS"
```

---

### Task 6: board 排名加排序选项卡（BoardView.vue）

**Files:**
- Modify: `frontend/src/views/BoardView.vue`
- Test: `frontend/src/views/BoardView.test.ts`

**Interfaces:**
- Consumes: `sortPayBoardGroups`、`PAY_BOARD_SORTS`、`PayBoardSortKey`（Task 5）。
- 行为：single（排名）模式工具栏在"维度"与"图表类型"之间加"排序"`SegToggle`；表与图（chartTop）改按所选排序键降序；默认 `projectCount`。

- [ ] **Step 1: 改测试（先红）**

改 `frontend/src/views/BoardView.test.ts` 第 77-87 行那条用例为"含排序控件且生效"：

```ts
  it('排名表列含五指标 + 新增「排序」选项卡(默认项目数),切合同金额重排', async () => {
    seed()
    const w = mount(BoardView, opts)
    await flushPromises()
    const cols = (w.findComponent(DataTable).props('columns') as Array<{ key: string }>).map((c) => c.key)
    expect(cols).toEqual(['key', 'projectCount', 'contractSum', 'expectedSum', 'rate', 'delayedNodeSum'])
    // 新增排序选项卡(四项)
    expect(w.find('[data-test="seg-projectCount"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-contractSum"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-rate"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-delayedNodeSum"]').exists()).toBe(true)
    // 默认按项目数:北京/上海各 1 个项目,顺序稳定;切到合同金额后按 contractSum 降序(北京 200万 > 上海 30万)
    await w.get('[data-test="seg-contractSum"]').trigger('click')
    const rows = w.findComponent(DataTable).props('rows') as Array<Record<string, any>>
    expect(rows[0].key).toBe('北京')
  })
```

> 注：seed() 中北京(P1 contract 200万) 与上海(P2 contract 30万) 各 1 项目，按合同金额降序北京居首。

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/BoardView.test.ts`
Expected: FAIL（无 `seg-contractSum` 等排序控件）。

- [ ] **Step 3: 写实现**

在 `frontend/src/views/BoardView.vue`：

(a) `<script setup>` 顶部从 paymentBoard 导入处加入新符号（在既有 `import { ... } from '@/lib/paymentBoard'` 中追加）：`sortPayBoardGroups, PAY_BOARD_SORTS, type PayBoardSortKey`。

(b) 在 `metricKey` 等 ref 附近新增：

```ts
const sortKey = ref<PayBoardSortKey>('projectCount')
const SORT_OPTS = PAY_BOARD_SORTS.map((s) => ({ value: s.key, label: s.label }))
const sortedGroups = computed(() => sortPayBoardGroups(groups.value, sortKey.value))
```

(c) 把 `chartTop`（原 `[...groups.value].sort((a, b) => b.expectedSum - a.expectedSum).slice(0, 15)`）改为：

```ts
const chartTop = computed(() => sortedGroups.value.slice(0, 15))
```

(d) 排名表模板里 `:rows` 由 `groups`（或 `sortedGroups` 之前的来源）改为 `sortedGroups`（找到 single 模式那个 `<DataTable ... :rows="...">`，single 排名表绑 `sortedGroups`）。

(e) 工具栏 `v-if="mode === 'single'"` 内，在"维度"`SegToggle` 与"图表类型"`ChartTypeSelector` 之间插入：

```vue
    <div class="bv-ctl">
      <span class="bv-ctl-label">排序</span>
      <SegToggle v-model="sortKey" :options="SORT_OPTS" />
    </div>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/BoardView.test.ts`
Expected: PASS（含改后的排序用例与其余既有用例；注意原"柱状图按 expectedSum 降序"用例若断言顺序，需核对：默认 sortKey=projectCount，北京/上海各 1 项目，顺序稳定，total.label.formatter 仍取 dataIndex 0；若该用例因排序键变化失败，按实际默认排序更新其期望值，保持"label.show/position/总计 formatter"断言不变）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/BoardView.vue frontend/src/views/BoardView.test.ts
git commit -m "feat(board): 排名新增排序选项卡(项目数/合同金额/完成率/延期节点)"
```

---

### Task 7: 风险看板页（RiskBoardView.vue）

**Files:**
- Create: `frontend/src/views/RiskBoardView.vue`
- Test: `frontend/src/views/RiskBoardView.test.ts`

**Interfaces:**
- Consumes: `buildRiskRows`/`riskSummary`/`groupRisk`/`riskOverview`/`RISK_DIMENSIONS`/`RISK_METRICS`/`RiskMetricKey`/`RiskDimDef`（Task 1-2）；`buildRankingOption`（Task 3，pie 传 legendCounts）；`SegToggle`/`ChartTypeSelector`/`ChartBox`/`DataTable`/`fmtWan`/`pct`。

- [ ] **Step 1: 写失败测试**

写入 `frontend/src/views/RiskBoardView.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import RiskBoardView from './RiskBoardView.vue'
import DataTable from '@/components/DataTable.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => setActivePinia(createPinia()))

const rec = (lvl: string, status: string) => ({ 风险等级: lvl, 风险状态: status })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    projects: [
      { projectId: 'P1', projectName: '甲', orgL4: '北京', projectManager: '张三' },
      { projectId: 'P2', projectName: '乙', orgL4: '上海', projectManager: '李四' },
      { projectId: 'P3', projectName: '丙', orgL4: '北京', projectManager: '张三' },
    ],
    projectPmis: {
      P1: { status: { 项目级别: 'A级' }, customer: { 行业: '金融', 合同总额: 1000000 }, riskRecords: [rec('高', '未关闭')] },
      P2: { status: { 项目级别: 'B级' }, customer: { 行业: '政务', 合同总额: 500000 }, riskRecords: [rec('中', '处理中')] },
      P3: { status: { 项目级别: 'A级' }, customer: { 行业: '金融', 合同总额: 300000 }, riskRecords: [rec('高', '已关闭')] },
    },
    displayColumns: {}, followupRecords: {},
  } as any
}

const opts = { global: { plugins: [ElementPlus] } }

describe('RiskBoardView', () => {
  it('渲染 4 卡片:健康度 33.3% / 高1 / 中1 / 低0', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    const t = w.text()
    expect(t).toContain('项目健康度')
    expect(t).toContain('无风险 1 / 全量 3')   // P3 全部已关闭 → 无风险
    expect(t).toContain('高风险项目')
    expect(t).toContain('中风险项目')
    expect(t).toContain('低风险项目')
  })
  it('排名维度与统计选项存在', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    expect(w.find('[data-test="seg-riskLevel"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-orgL4"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-projectCount"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-contractAmount"]').exists()).toBe(true)
  })
  it('概览表含 高/中/低/无风险/合计/健康度% 列', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    const tables = w.findAllComponents(DataTable)
    const ovCols = (tables[tables.length - 1].props('columns') as Array<{ key: string }>).map((c) => c.key)
    expect(ovCols).toEqual(['key', '高', '中', '低', '无风险', 'total', 'healthPct'])
  })
  it('空数据显空态', () => {
    const ds = useDataStore()
    ds.data = { meta: {}, projects: [], projectPmis: {}, displayColumns: {}, followupRecords: {} } as any
    const w = mount(RiskBoardView, opts)
    expect(w.text()).toContain('暂无项目主域数据')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/RiskBoardView.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 写实现**

写入 `frontend/src/views/RiskBoardView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import type { Project, ProjectPmis } from '@/types/analysis'
import {
  buildRiskRows, riskSummary, groupRisk, riskOverview,
  RISK_DIMENSIONS, RISK_METRICS, type RiskMetricKey, type RiskDimDef,
} from '@/lib/riskBoard'
import { fmtWan, pct } from '@/lib/format'
import { buildRankingOption, type ValueKind } from '@/lib/chartOptions'
import SegToggle from '@/components/SegToggle.vue'
import ChartTypeSelector from '@/components/ChartTypeSelector.vue'
import ChartBox from '@/charts/ChartBox.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() =>
  buildRiskRows(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
  ),
)
const summary = computed(() => riskSummary(rows.value))

const ratioText = (n: number, d: number): string => (d > 0 ? pct(n / d) : '-')
const cards = computed(() => {
  const s = summary.value
  return [
    { k: '项目健康度', main: s.healthPct == null ? '-' : pct(s.healthPct), sub: `无风险 ${s.noRisk} / 全量 ${s.total}`, tone: 'ok' },
    { k: '高风险项目', main: `${s.high} 个`, sub: `占比 ${ratioText(s.high, s.hasRisk)}`, tone: 'danger' },
    { k: '中风险项目', main: `${s.mid} 个`, sub: `占比 ${ratioText(s.mid, s.hasRisk)}`, tone: 'warn' },
    { k: '低风险项目', main: `${s.low} 个`, sub: `占比 ${ratioText(s.low, s.hasRisk)}`, tone: 'advance' },
  ]
})

// ---- 风险统计分析(排名) ----
const DIM_OPTS = RISK_DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))
const METRIC_OPTS = RISK_METRICS.map((m) => ({ value: m.key, label: m.label }))
const dimKey = ref<RiskDimDef['key']>('riskLevel')
const metricKey = ref<RiskMetricKey>('projectCount')
const chartTypes = ref<string[]>(['bar'])

const metricDef = computed(() => RISK_METRICS.find((m) => m.key === metricKey.value)!)
const currentValueKind = computed<ValueKind>(() => (metricDef.value.kind === 'money' ? 'amount' : 'count'))

const groups = computed(() => {
  const gs = groupRisk(rows.value, dimKey.value)
  const k = metricKey.value
  return [...gs].sort((a, b) => (b[k] as number) - (a[k] as number))
})
const top = computed(() => groups.value.slice(0, 15))

const rankingChartOptions = computed(() =>
  chartTypes.value.map((t) =>
    buildRankingOption(t as 'bar' | 'pie', {
      categories: top.value.map((g) => g.key),
      values: top.value.map((g) => g[metricKey.value] as number),
      metricLabel: metricDef.value.label,
      valueKind: currentValueKind.value,
      legendCounts: top.value.map((g) => g.projectCount),
    }),
  ),
)
const RANK_COLS = computed<DataColumn[]>(() => [
  { key: 'key', label: RISK_DIMENSIONS.find((d) => d.key === dimKey.value)?.label ?? '维度' },
  { key: 'projectCount', label: '项目数', width: 80, sortable: true, num: true },
  { key: 'hasRiskCount', label: '有风险项目数', width: 120, sortable: true, num: true },
  { key: 'openRiskSum', label: '未关闭风险数', width: 120, sortable: true, num: true },
  { key: 'contractAmount', label: '合同总额(万)', width: 120, sortable: true, num: true, formatter: (v) => fmtWan(v as number) },
])

// ---- 风险概览(透视表) ----
const OVERVIEW_DIM_OPTS = RISK_DIMENSIONS.filter((d) => d.key !== 'riskLevel').map((d) => ({ value: d.key, label: d.label }))
const overviewDim = ref<RiskDimDef['key']>('orgL4')
const overviewRows = computed(() => riskOverview(rows.value, overviewDim.value))
const OVERVIEW_COLS = computed<DataColumn[]>(() => [
  { key: 'key', label: RISK_DIMENSIONS.find((d) => d.key === overviewDim.value)?.label ?? '维度' },
  { key: '高', label: '高', width: 70, sortable: true, num: true },
  { key: '中', label: '中', width: 70, sortable: true, num: true },
  { key: '低', label: '低', width: 70, sortable: true, num: true },
  { key: '无风险', label: '无风险', width: 80, sortable: true, num: true },
  { key: 'total', label: '合计', width: 80, sortable: true, num: true },
  { key: 'healthPct', label: '健康度%', width: 90, num: true, formatter: (v) => (v == null ? '-' : pct(v as number)) },
])
</script>

<template>
  <div class="risk-view">
    <h2 class="rv-title">风险看板</h2>

    <div v-if="!rows.length" class="rv-empty">暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>

    <template v-else>
      <div class="rv-cards">
        <div v-for="c in cards" :key="c.k" class="rv-card">
          <div class="rv-card-k">{{ c.k }}</div>
          <div class="rv-card-main u-num" :class="'rv-main-' + c.tone">{{ c.main }}</div>
          <div class="rv-card-sub u-num">{{ c.sub }}</div>
        </div>
      </div>

      <h3 class="rv-h3">风险统计分析</h3>
      <div class="rv-toolbar">
        <span class="rv-label">维度</span><SegToggle v-model="dimKey" :options="DIM_OPTS" />
        <span class="rv-label">统计</span><SegToggle v-model="metricKey" :options="METRIC_OPTS" />
        <span class="rv-label">图表类型</span><ChartTypeSelector v-model="chartTypes" :available="['bar', 'pie']" />
      </div>
      <div class="rv-charts-row">
        <div v-for="(opt, idx) in rankingChartOptions" :key="chartTypes[idx]" class="rv-chart-item">
          <ChartBox :option="opt" height="300px" />
        </div>
      </div>
      <DataTable :columns="RANK_COLS" :rows="groups" />

      <h3 class="rv-h3">风险概览</h3>
      <div class="rv-toolbar">
        <span class="rv-label">行维度</span><SegToggle v-model="overviewDim" :options="OVERVIEW_DIM_OPTS" />
      </div>
      <DataTable :columns="OVERVIEW_COLS" :rows="overviewRows" />
    </template>
  </div>
</template>

<style scoped>
.risk-view { padding: var(--sp-4); }
.rv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.rv-h3 { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: var(--sp-5) 0 var(--sp-3); }
.rv-cards { display: flex; flex-wrap: wrap; gap: var(--gap-card); margin-bottom: var(--sp-3); }
.rv-card { flex: 1 1 200px; min-width: 180px; background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r-md); padding: var(--card-pad); display: flex; flex-direction: column; gap: var(--gap-stack); }
.rv-card-k { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.rv-card-main { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.rv-card-sub { font-size: var(--fs-2); color: var(--mut); }
.rv-main-ok { color: var(--ok-text); }
.rv-main-danger { color: var(--danger); }
.rv-main-warn { color: var(--warn-text); }
.rv-main-advance { color: var(--c-advance); }
.rv-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.rv-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.rv-charts-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); margin-bottom: var(--sp-3); }
.rv-chart-item { flex: 1 1 400px; min-width: 300px; background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r-md); padding: var(--sp-3); }
.rv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card);
  border: 1px solid var(--line); border-radius: var(--r-md); }
</style>
```

> 令牌核对：若 `--ok-text` / `--warn-text` / `--c-advance` 与 theme.css 实际命名不符，按 `frontend/src/styles/theme.css` 现有状态色令牌名取（状态三态淡底深字的 `*-text` 系列），不得手写散值。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/RiskBoardView.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/RiskBoardView.vue frontend/src/views/RiskBoardView.test.ts
git commit -m "feat(risk): 风险看板页 RiskBoardView(4卡片+风险排名+风险概览)"
```

---

### Task 8: 路由/导航/门禁接入 + 版本 V1.18.0 + 全量验证

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/nav.ts`
- Modify: `frontend/src/lib/pageAccess.ts`
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: `RiskBoardView.vue`（Task 7）。

- [ ] **Step 1: 路由**

`frontend/src/router/index.ts`：import `RiskBoardView`，在 `/insight/costdetail` 之后、`/insight/board` 之前加路由：

```ts
{ path: '/insight/risk', name: 'insight-risk', component: RiskBoardView, meta: { title: '风险看板', hideFilter: true, pageKey: 'insight-risk' } },
```

（顶部 import 处加：`import RiskBoardView from '@/views/RiskBoardView.vue'`）

- [ ] **Step 2: 导航**

`frontend/src/nav.ts` `ANALYSIS_LINKS`：在 `{ label: '成本分析', to: '/insight/costdetail', key: 'insight-costdetail' }` 之后插入：

```ts
  { label: '风险看板', to: '/insight/risk', key: 'insight-risk' },
```

- [ ] **Step 3: 门禁 PageKey**

`frontend/src/lib/pageAccess.ts` `PageKey` union：在 `'insight-costdetail'` 后、`'insight-board'` 前加 `'insight-risk'`：

```ts
  | 'insight' | 'insight-milestone' | 'insight-costdetail' | 'insight-risk' | 'insight-board' | 'insight-calendar'
```

- [ ] **Step 4: 版本与进度**

`frontend/src/version.ts`：`APP_VERSION = 'V1.18.0'`（`RELEASE_DATE = '2026-06-23'`）。

`PROGRESS.md`：头部"当前版本"改 **V1.18.0**、"最近更新"写一句；版本史加一条 V1.18.0（风险看板 /insight/risk + /insight 去评级加项目级别 + /insight/board 排名排序）。

- [ ] **Step 5: 全量验证**

Run: `bash verify.sh`
Expected: PASS（后端 pytest/ruff 不受影响；前端 typecheck + 全量 vitest + build 全绿）。
若 typecheck 报 `rating` 残留或路由/导航类型不符，按报错定位修正（不扩大改动面）。手动可选：`python server.py` 走查 `/insight/risk` 三块、`/insight` 维度、`/insight/board` 排序。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/router/index.ts frontend/src/nav.ts frontend/src/lib/pageAccess.ts frontend/src/version.ts PROGRESS.md
git commit -m "feat(risk): 接入风险看板路由/导航/门禁 + 版本 V1.18.0"
```

---

## 计划自检

**1. Spec 覆盖**：① 风险口径库(§2)=Task 1-2；② 风险页 4 卡片+排名+概览(§3)=Task 7（依赖 1-2-3）；③ 导航/门禁(§4)=Task 8；④ /insight 去评级加项目级别(§5)=Task 4；⑤ board 排序(§6)=Task 5-6；⑥ chartOptions legendCounts(§6.3)=Task 3；⑦ 测试(§7)分散于各任务。无遗漏。

**2. 占位符扫描**：各步均含真实代码/命令/期望输出，无 TBD/TODO/"类似"。

**3. 类型一致性**：`RiskRow`/`RiskGroup`/`RiskOverviewRow`/`RiskMetricKey`/`RiskDimDef` 在 Task 1-2 定义、Task 7 消费一致；`PayBoardSortKey`/`sortPayBoardGroups` Task 5 定义、Task 6 消费一致；`legendCounts` Task 3 定义、Task 7 使用一致；`projectLevel`/去 `rating` 在 Task 4 内自洽。

**4. 风险点**：Task 6 需同步更新 BoardView.test 既有"无排序控件"用例与可能的"柱状图按 expectedSum 降序"用例（已在步骤注明按实际默认排序更新期望）；Task 7 styles 的状态色令牌名以 theme.css 实际为准。
