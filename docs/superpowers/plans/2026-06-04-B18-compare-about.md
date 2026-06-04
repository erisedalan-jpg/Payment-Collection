# B18 区间对比(compare) + 关于(about) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点亮前端重写最后两个路由 `/compare`（区间对比）与 `/about`（关于产品），用 PageStub 替换为真实视图，忠实移植 app.js `initCompare()` 与 `initAbout()`。

**Architecture:** 纯计算下沉到 `lib/compare.ts`（按档统计 + 4 张图表的数据构造），单测覆盖；`CompareCards.vue` 渲染三档卡片；`CompareView.vue` 组合卡片 + 3 个 ECharts（ChartBox）+ 服务组 TOP5/BOTTOM5 HTML 排名榜；`AboutView.vue` 为基本静态信息 + 版本号 + `meta.lastUpdate`。版本号抽到单一来源 `version.ts`，AppHeader 与 About 共用。数据源 = 后端预计算的 `data.summary` / `data.dashboard.orgRanking` / `data.rawNodes`（与 app.js 一致，**不经**年份/视角/纳管筛选）。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Pinia（useDataStore）、vue-echarts（ChartBox 封装）、Vitest + @vue/test-utils + jsdom。

---

## 背景与忠实性基准（实现前必读）

app.js 对应函数：
- `initCompare()` app.js:3164-3400
- `initAbout()` app.js:3859-3949

数据源（与 app.js 一致）：
- 卡片与图表统计取 **`D.summary[档位]`**（后端预计算的分档汇总），辅以 `D.rawNodes`（仅用于完成率回退累加）。
- 服务组排名取 **`D.dashboard.orgRanking`**（后端预计算）。
- 这些**都不经** filterStore（年份/视角/纳管）筛选——忠实于 app.js（compare 页直接读 `D.summary`/`D.dashboard`）。

**两处对 app.js 既有缺陷的"忠实但修正"处理（务必照此实现，不要照抄 bug）：**

1. **进度对比图"已回款"系列**：app.js:3268 写成 `data:tiers.map((t,i)=>{return fmt(stats[i].actualAmountWan||0)})`，`fmt()` 返回带千分位逗号的字符串（如 `"1,234.0"`），ECharts 无法解析该逗号串（会渲染为 0/NaN），且同图另两个系列（待回款/延期）用的是裸数值。这是 app.js 的潜在 bug。本计划**统一用裸数值** `s.actualAmountWan || 0`（与同图其余系列一致，符合"金额(万)柱状图"的显然意图）。

2. **状态分布图的兜底分支**：app.js:3308 在 6 个已知状态全部 if 命中后，仍有 `const rel=...; return rel>0?rel:0` 兜底——对这 6 个状态而言是**不可达死代码**。本计划在 `compareStatusSeries` 中**保留**该兜底（无害、最大化忠实）。

ECharts 选项细节（颜色、grid、legend、柱宽等）属"展示"，照 app.js 搬运即可；其中柱宽常量 `CHART_BAR_WIDTH=38`、`CHART_BAR_CATEGORY_GAP='19%'`（见 app.js）本计划直接内联字面量。

`initAbout()`：基本是静态内容 + `APP_VERSION` + `D.meta.lastUpdate`。功能清单 `<li>` 列表属产品文档，照搬为字符串数组。发布日期 app.js 写死 `2026-06-02`，作者 `交付中心-交付实施三部-阿童木`，数据来源 `WPS云文档 - 项目回款节点清单`——照搬。

版本号：现 `AppHeader.vue:5` 本地常量 `APP_VERSION='V6.0.0'`。按"版本号单一来源"约定，抽到 `src/version.ts`，AppHeader 与 About 共用。

---

## File Structure

- Create: `frontend/src/version.ts` — 版本号/发布日期单一来源
- Modify: `frontend/src/layout/AppHeader.vue:5` — 改为从 `version.ts` 导入
- Create: `frontend/src/lib/compare.ts` — 纯计算（按档统计 + 4 图表数据 + 常量）
- Create: `frontend/src/lib/compare.test.ts`
- Create: `frontend/src/components/CompareCards.vue` — 三档对比卡片
- Create: `frontend/src/components/CompareCards.test.ts`
- Create: `frontend/src/views/CompareView.vue` — 组合卡片 + 3 图 + 排名榜
- Create: `frontend/src/views/CompareView.test.ts`
- Create: `frontend/src/views/AboutView.vue` — 静态信息 + 版本 + lastUpdate
- Create: `frontend/src/views/AboutView.test.ts`
- Modify: `frontend/src/router/index.ts` — `/compare`→CompareView、`/about`→AboutView（移除对应 PageStub）
- Modify: `frontend/src/router/index.test.ts` — 断言 compare/about 解析到非 PageStub 组件
- Modify: `PROGRESS.md` — B18 完成结论

---

## Task 1: 版本号单一来源 version.ts + AppHeader 接入

**Files:**
- Create: `frontend/src/version.ts`
- Modify: `frontend/src/layout/AppHeader.vue`

- [ ] **Step 1: 创建 version.ts**

Create `frontend/src/version.ts`:

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V6.0.0'
export const RELEASE_DATE = '2026-06-02'
```

- [ ] **Step 2: AppHeader 改为导入**

In `frontend/src/layout/AppHeader.vue`, replace the local literal line:

```ts
const APP_VERSION = 'V6.0.0' // 单一来源；发版时更新
```

with an import (add to the existing `<script setup>` imports, remove the local const):

```ts
import { APP_VERSION } from '@/version'
```

Leave the template `{{ APP_VERSION }}` usage unchanged.

- [ ] **Step 3: 跑前端检查确认无回归**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: PASS（AppHeader 现有测试若有，仍应通过；版本展示不变）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts frontend/src/layout/AppHeader.vue
git commit -m "refactor(b18): 版本号抽取为 version.ts 单一来源，AppHeader 接入"
```

---

## Task 2: lib/compare.ts 纯计算 + 单测

**Files:**
- Create: `frontend/src/lib/compare.ts`
- Test: `frontend/src/lib/compare.test.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend/src/lib/compare.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  compareTierStats,
  compareProgressSeries,
  compareStatusSeries,
  compareTrendSeries,
  compareOrgRanks,
  COMPARE_TIERS,
  COMPARE_STATUSES,
} from './compare'

const summary = {
  '100万以上': {
    projectCount: 3,
    totalAmountWan: 500,
    remainingAmountWan: 200,
    actualAmountWan: 300,
    expectedAmountWan: 500,
    delayedAmount: 80,
    relatedNodeCount: 10,
    delayedCount: 2,
    onTimeCount: 4,
    advanceEarlyCount: 1,
    fullPaidCount: 2,
    canAdvanceCount: 0,
    reachedConditionCount: 1,
    monthlyPlan: { '2026-01': { amountWan: 100 }, '2026-02': { amountWan: 50 } },
  },
  '50-100万': {
    projectCount: 2,
    totalAmountWan: 150,
    remainingAmountWan: 60,
    relatedNodeCount: 0,
    delayedCount: 0,
    monthlyPlan: { '2026-02': { amountWan: 30 }, '2028-01': { amountWan: 999 } },
  },
  '50万以下': {
    projectCount: 0,
    monthlyPlan: {},
  },
}

describe('compareTierStats', () => {
  it('完成率优先用 summary 的 actual/expectedAmountWan', () => {
    const s = compareTierStats(summary, [])
    expect(s.map((x) => x.tier)).toEqual(COMPARE_TIERS)
    expect(s[0].completionRate).toBeCloseTo(300 / 500)
    expect(s[0].delayRate).toBeCloseTo(2 / 10)
  })

  it('summary 缺 actual/expectedAmountWan 时按 rawNodes 回退累加(元/1万)', () => {
    const raw = [
      { tier: '50-100万', isPaymentRelated: true, actualPayment: 200000, expectedPayment: 400000 },
      { tier: '50-100万', isPaymentRelated: false, actualPayment: 9, expectedPayment: 9 },
      { tier: '100万以上', isPaymentRelated: true, actualPayment: 1, expectedPayment: 1 },
    ] as any
    const s = compareTierStats(summary, raw)
    // 50-100万 无 actual/expectedAmountWan → 用 related 节点累加：20万 / 40万
    const mid = s.find((x) => x.tier === '50-100万')!
    expect(mid.actualAmountWan).toBeCloseTo(20)
    expect(mid.expectedAmountWan).toBeCloseTo(40)
    expect(mid.completionRate).toBeCloseTo(0.5)
  })

  it('relatedNodeCount=0 → delayRate=0；expectedWan=0 → completionRate=0', () => {
    const s = compareTierStats(summary, [])
    const low = s.find((x) => x.tier === '50万以下')!
    expect(low.delayRate).toBe(0)
    expect(low.completionRate).toBe(0)
  })
})

describe('compareProgressSeries', () => {
  it('三系列均为裸数值（已回款不再用千分位字符串）', () => {
    const stats = compareTierStats(summary, [])
    const p = compareProgressSeries(stats)
    expect(p.categories).toEqual(COMPARE_TIERS)
    expect(p.paid[0]).toBe(300)
    expect(p.pending[0]).toBe(200)
    expect(p.delayed[0]).toBe(80)
    // 缺字段档位回退 0
    expect(p.delayed[2]).toBe(0)
  })
})

describe('compareStatusSeries', () => {
  it('6 状态按 summary 计数映射，缺失回退 0', () => {
    const ser = compareStatusSeries(summary)
    expect(ser.map((s) => s.name)).toEqual(COMPARE_STATUSES)
    const byName = Object.fromEntries(ser.map((s) => [s.name, s.data]))
    expect(byName['正常实施中'][0]).toBe(4) // onTimeCount
    expect(byName['延期'][0]).toBe(2) // delayedCount
    expect(byName['已全额回款'][0]).toBe(2) // fullPaidCount
    expect(byName['加资源可提前'][0]).toBe(0) // canAdvanceCount
    expect(byName['达到回款条件'][0]).toBe(1) // reachedConditionCount
    expect(byName['已提前回款'][0]).toBe(1) // advanceEarlyCount
  })
})

describe('compareTrendSeries', () => {
  it('月份为各档 monthlyPlan 键并集、升序、过滤 >2027-12', () => {
    const t = compareTrendSeries(summary)
    expect(t.months).toEqual(['2026-01', '2026-02']) // 2028-01 被过滤
    const top = t.series.find((s) => s.tier === '100万以上')!
    expect(top.data).toEqual([100, 50])
    const mid = t.series.find((s) => s.tier === '50-100万')!
    expect(mid.data).toEqual([0, 30]) // 2026-01 无值→0
  })
})

describe('compareOrgRanks', () => {
  it('按达成率降序取 TOP5 / BOTTOM5(升序)，max=actualTotal 最大值且≥1', () => {
    const org = [
      { org: 'A', actualTotal: 10, actualTotalWan: 1, achievementRate: 0.9 },
      { org: 'B', actualTotal: 30, actualTotalWan: 3, achievementRate: 0.5 },
      { org: 'C', actualTotal: 20, actualTotalWan: 2, achievementRate: 0.1 },
    ]
    const r = compareOrgRanks(org)
    expect(r.top5.map((x) => x.org)).toEqual(['A', 'B', 'C'])
    expect(r.bottom5.map((x) => x.org)).toEqual(['C', 'B', 'A']) // slice(-5).reverse()
    expect(r.max).toBe(30)
  })

  it('空排名 → max 回退 1，列表为空', () => {
    const r = compareOrgRanks([])
    expect(r.max).toBe(1)
    expect(r.top5).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/compare.test.ts`
Expected: FAIL（`compare.ts` 不存在 / 函数未定义）

- [ ] **Step 3: 实现 compare.ts**

Create `frontend/src/lib/compare.ts`:

```ts
import type { RawNode } from '@/types/analysis'

/** 三档顺序（忠实 app.js initCompare 的 tiers）。 */
export const COMPARE_TIERS = ['100万以上', '50-100万', '50万以下'] as const

/** 各档线条/强调色（忠实 app.js tierColors）。 */
export const COMPARE_TIER_COLORS: Record<string, string> = {
  '100万以上': '#EF4444',
  '50-100万': '#F59E0B',
  '50万以下': '#10B981',
}

/** 状态分布图的 6 状态与配色（忠实 app.js statuses/statusColors，顺序不可改）。 */
export const COMPARE_STATUSES = [
  '加资源可提前',
  '达到回款条件',
  '已提前回款',
  '已全额回款',
  '延期',
  '正常实施中',
] as const
export const COMPARE_STATUS_COLORS = ['#6366F1', '#F59E0B', '#059669', '#10B981', '#EF4444', '#3B82F6']

export interface CompareTierStat {
  tier: string
  completionRate: number
  delayRate: number
  actualAmountWan: number
  expectedAmountWan: number
  // 其余字段（projectCount/totalAmountWan/remainingAmountWan/delayedAmount/...）来自 summary 透传
  [k: string]: any
}

/**
 * 按档统计（忠实移植 app.js:3178-3196）。
 * 完成率优先用 summary 的 actual/expectedAmountWan；缺失时按该档 isPaymentRelated 节点累加(元→万)。
 * delayRate = relatedNodeCount>0 ? delayedCount/relatedNodeCount : 0。
 */
export function compareTierStats(
  summary: Record<string, any> | undefined,
  rawNodes: RawNode[],
): CompareTierStat[] {
  return COMPARE_TIERS.map((t) => {
    const s = summary?.[t] || {}
    const tierRelated = rawNodes.filter(
      (n) => (n as any).tier === t && (n as any).isPaymentRelated,
    )
    const tierActualWan =
      s.actualAmountWan ||
      tierRelated.reduce((acc, n) => acc + ((n as any).actualPayment || 0), 0) / 10000
    const tierExpectedWan =
      s.expectedAmountWan ||
      tierRelated.reduce((acc, n) => acc + ((n as any).expectedPayment || 0), 0) / 10000
    const completionRate = tierExpectedWan > 0 ? tierActualWan / tierExpectedWan : 0
    const delayRate = s.relatedNodeCount > 0 ? s.delayedCount / s.relatedNodeCount : 0
    return {
      ...s,
      tier: t,
      actualAmountWan: tierActualWan,
      expectedAmountWan: tierExpectedWan,
      completionRate,
      delayRate,
    }
  })
}

export interface CompareProgress {
  categories: string[]
  paid: number[]
  pending: number[]
  delayed: number[]
}

/**
 * 进度对比图三系列（忠实移植 app.js:3266-3274 的数据，已修正"已回款"系列：
 * app.js 误用 fmt() 千分位字符串导致 ECharts 解析失败，这里统一用裸数值）。
 */
export function compareProgressSeries(stats: CompareTierStat[]): CompareProgress {
  return {
    categories: [...COMPARE_TIERS],
    paid: stats.map((s) => s.actualAmountWan || 0),
    pending: stats.map((s) => s.remainingAmountWan || 0),
    delayed: stats.map((s) => s.delayedAmount || 0),
  }
}

export interface CompareStatusSeries {
  name: string
  data: number[]
}

/** 状态分布堆叠图（忠实移植 app.js:3304-3314，保留原不可达兜底分支）。 */
export function compareStatusSeries(summary: Record<string, any> | undefined): CompareStatusSeries[] {
  return COMPARE_STATUSES.map((st) => ({
    name: st,
    data: COMPARE_TIERS.map((t) => {
      const s = (summary?.[t] || {}) as Record<string, any>
      if (st === '正常实施中') return s.onTimeCount || 0
      if (st === '已提前回款') return s.advanceEarlyCount || 0
      if (st === '已全额回款') return s.fullPaidCount || 0
      if (st === '加资源可提前') return s.canAdvanceCount || 0
      if (st === '达到回款条件') return s.reachedConditionCount || 0
      if (st === '延期') return s.delayedCount || 0
      // 忠实保留：6 状态全命中后不可达的兜底分支
      const rel =
        (s.relatedNodeCount || 0) -
        (s.onTimeCount || 0) -
        (s.advanceEarlyCount || 0) -
        (s.delayedCount || 0)
      return rel > 0 ? rel : 0
    }),
  }))
}

export interface CompareTrend {
  months: string[]
  series: { tier: string; data: number[] }[]
}

/** 月度趋势（忠实移植 app.js:3328-3356）：各档 monthlyPlan 键并集、升序、过滤 >2027-12。 */
export function compareTrendSeries(summary: Record<string, any> | undefined): CompareTrend {
  const ms = new Set<string>()
  const td: Record<string, Record<string, any>> = {}
  COMPARE_TIERS.forEach((t) => {
    const mp = (summary?.[t] || {}).monthlyPlan || {}
    td[t] = mp
    Object.keys(mp).forEach((m) => ms.add(m))
  })
  const months = [...ms].sort().filter((m) => m <= '2027-12')
  return {
    months,
    series: COMPARE_TIERS.map((t) => ({
      tier: t,
      data: months.map((m) => ((td[t] || {})[m] || {}).amountWan || 0),
    })),
  }
}

export interface OrgRankRow {
  org: string
  actualTotal: number
  actualTotalWan: number
  achievementRate: number
  [k: string]: any
}

export interface CompareOrgRanks {
  top5: OrgRankRow[]
  bottom5: OrgRankRow[]
  max: number
}

/** 服务组达成率 TOP5/BOTTOM5（忠实移植 app.js:3368-3374）。 */
export function compareOrgRanks(orgRanking: OrgRankRow[] | undefined): CompareOrgRanks {
  const sorted = [...(orgRanking || [])].sort((a, b) => b.achievementRate - a.achievementRate)
  const top5 = sorted.slice(0, 5)
  const bottom5 = sorted.slice(-5).reverse()
  const max = Math.max(...sorted.map((s) => s.actualTotal), 1)
  return { top5, bottom5, max }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/compare.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/compare.ts frontend/src/lib/compare.test.ts
git commit -m "feat(b18): lib/compare 按档统计 + 四图表数据构造（含两处 app.js 缺陷的忠实修正）"
```

---

## Task 3: CompareCards.vue 三档对比卡片

**Files:**
- Create: `frontend/src/components/CompareCards.vue`
- Test: `frontend/src/components/CompareCards.test.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/CompareCards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CompareCards from './CompareCards.vue'
import type { CompareTierStat } from '@/lib/compare'

const stats: CompareTierStat[] = [
  {
    tier: '100万以上',
    projectCount: 3,
    totalAmountWan: 500,
    remainingAmountWan: 200,
    actualAmountWan: 300,
    expectedAmountWan: 500,
    completionRate: 0.6,
    delayRate: 0.2,
  },
  {
    tier: '50-100万',
    projectCount: 2,
    totalAmountWan: 150,
    remainingAmountWan: 60,
    actualAmountWan: 90,
    expectedAmountWan: 150,
    completionRate: 0.6,
    delayRate: 0.05,
  },
  {
    tier: '50万以下',
    projectCount: 0,
    totalAmountWan: 0,
    remainingAmountWan: 0,
    actualAmountWan: 0,
    expectedAmountWan: 0,
    completionRate: 0,
    delayRate: 0,
  },
]

describe('CompareCards', () => {
  it('渲染三张卡片，标题为档位名', () => {
    const w = mount(CompareCards, { props: { stats } })
    const cards = w.findAll('.cmp-card')
    expect(cards.length).toBe(3)
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('50-100万')
    expect(w.text()).toContain('50万以下')
  })

  it('展示项目数/计划金额/待回款/完成率/延期率', () => {
    const w = mount(CompareCards, { props: { stats } })
    const t = w.text()
    expect(t).toContain('项目数')
    expect(t).toContain('计划回款总金额(万)')
    expect(t).toContain('待回款总金额(万)')
    expect(t).toContain('完成率')
    expect(t).toContain('延期率')
    expect(t).toContain('60%') // completionRate 0.6 → 60%
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/CompareCards.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 CompareCards.vue**

Create `frontend/src/components/CompareCards.vue`:

```vue
<script setup lang="ts">
import { fmtYuan, pct } from '@/lib/format'
import type { CompareTierStat } from '@/lib/compare'

defineProps<{ stats: CompareTierStat[] }>()

const ACCENT: Record<string, string> = {
  '100万以上': '#EF4444',
  '50-100万': '#F59E0B',
  '50万以下': '#10B981',
}

function rateColor(r: number): string {
  return r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444'
}
function delayColor(r: number): string {
  return r > 0.2 ? '#ef4444' : r > 0.1 ? '#f59e0b' : '#10b981'
}
</script>

<template>
  <div class="cmp-cards">
    <div v-for="s in stats" :key="s.tier" class="cmp-card">
      <div class="cmp-accent" :style="{ background: ACCENT[s.tier] || '#94a3b8' }"></div>
      <div class="cmp-title">{{ s.tier }}</div>
      <div class="cmp-metrics">
        <div class="cmp-metric">
          <span class="cmp-ml">项目数</span>
          <span class="cmp-mv" style="color:#0f172a">{{ s.projectCount || 0 }}</span>
        </div>
        <div class="cmp-metric">
          <span class="cmp-ml">计划回款总金额(万)</span>
          <span class="cmp-mv" style="color:#3b82f6">{{ fmtYuan(s.totalAmountWan) }}</span>
        </div>
        <div class="cmp-metric">
          <span class="cmp-ml">待回款总金额(万)</span>
          <span class="cmp-mv" style="color:#ef4444">{{ fmtYuan(s.remainingAmountWan) }}</span>
        </div>
        <div class="cmp-metric">
          <span class="cmp-ml">完成率</span>
          <span class="cmp-mv" :style="{ color: rateColor(s.completionRate) }">{{ pct(s.completionRate) }}</span>
        </div>
        <div class="cmp-metric">
          <span class="cmp-ml">延期率</span>
          <span class="cmp-mv" :style="{ color: delayColor(s.delayRate) }">{{ pct(s.delayRate) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cmp-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.cmp-card { position: relative; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; overflow: hidden; }
.cmp-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.cmp-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
.cmp-metrics { display: flex; flex-direction: column; gap: 8px; }
.cmp-metric { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
.cmp-ml { color: #64748b; }
.cmp-mv { font-weight: 700; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/CompareCards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CompareCards.vue frontend/src/components/CompareCards.test.ts
git commit -m "feat(b18): CompareCards 三档对比卡片"
```

---

## Task 4: CompareView.vue 组合视图

**Files:**
- Create: `frontend/src/views/CompareView.vue`
- Test: `frontend/src/views/CompareView.test.ts`

注：ChartBox 在测试环境已由 `vitest.setup.ts` 的 vue-echarts 桩替换，断言走结构（卡片、排名榜文本、空态），不断言图形像素。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/views/CompareView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CompareView from './CompareView.vue'
import { useDataStore } from '@/stores/data'

const fakeData = {
  meta: { lastUpdate: '2026-06-01' },
  dashboard: {
    orgRanking: [
      { org: '北京交付组', actualTotal: 30, actualTotalWan: 3, achievementRate: 0.6 },
      { org: '上海交付组', actualTotal: 10, actualTotalWan: 1, achievementRate: 0.2 },
    ],
  },
  summary: {
    '100万以上': {
      projectCount: 3,
      totalAmountWan: 500,
      remainingAmountWan: 200,
      actualAmountWan: 300,
      expectedAmountWan: 500,
      delayedAmount: 80,
      relatedNodeCount: 10,
      delayedCount: 2,
      onTimeCount: 4,
      monthlyPlan: { '2026-01': { amountWan: 100 } },
    },
    '50-100万': { projectCount: 2, monthlyPlan: {} },
    '50万以下': { projectCount: 0, monthlyPlan: {} },
  },
  rawNodes: [],
}

describe('CompareView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useDataStore()
    store.data = fakeData as any
  })

  it('渲染三档卡片与四个图表区块标题', async () => {
    const w = mount(CompareView, { global: { stubs: { ChartBox: true } } })
    await flushPromises()
    expect(w.findAll('.cmp-card').length).toBe(3)
    const t = w.text()
    expect(t).toContain('回款达成对比看板')
    expect(t).toContain('回款进度对比')
    expect(t).toContain('状态分布对比')
    expect(t).toContain('月度回款趋势对比')
    expect(t).toContain('服务组达成率排名')
  })

  it('排名榜渲染 TOP5/BOTTOM5 与服务组名', async () => {
    const w = mount(CompareView, { global: { stubs: { ChartBox: true } } })
    await flushPromises()
    const t = w.text()
    expect(t).toContain('TOP5')
    expect(t).toContain('BOTTOM5')
    expect(t).toContain('北京交付组')
    expect(t).toContain('上海交付组')
  })

  it('无数据时不抛错（空态）', async () => {
    setActivePinia(createPinia())
    const store = useDataStore()
    store.data = null as any
    const w = mount(CompareView, { global: { stubs: { ChartBox: true } } })
    await flushPromises()
    expect(w.findAll('.cmp-card').length).toBe(3) // 三档恒在，数值回退 0
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/CompareView.test.ts`
Expected: FAIL（视图不存在）

- [ ] **Step 3: 实现 CompareView.vue**

Create `frontend/src/views/CompareView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import ChartBox from '@/charts/ChartBox.vue'
import CompareCards from '@/components/CompareCards.vue'
import { fmtYuan, pct } from '@/lib/format'
import {
  compareTierStats,
  compareProgressSeries,
  compareStatusSeries,
  compareTrendSeries,
  compareOrgRanks,
  COMPARE_TIERS,
  COMPARE_TIER_COLORS,
  COMPARE_STATUSES,
  COMPARE_STATUS_COLORS,
} from '@/lib/compare'

const data = useDataStore()
onMounted(() => {
  if (!data.data) data.load()
})

const summary = computed(() => (data.data?.summary ?? {}) as Record<string, any>)
const rawNodes = computed(() => (data.data?.rawNodes ?? []) as any[])
const orgRanking = computed(() => ((data.data?.dashboard as any)?.orgRanking ?? []) as any[])

const stats = computed(() => compareTierStats(summary.value, rawNodes.value))

// 图1：回款进度对比（分组柱：已回款/待回款/延期金额）
const progressOption = computed(() => {
  const p = compareProgressSeries(stats.value)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['已回款', '待回款', '延期金额'] },
    grid: { left: 60, right: 30, top: 30, bottom: 55 },
    xAxis: { type: 'category', data: p.categories },
    yAxis: { type: 'value', name: '金额(万)' },
    series: [
      { name: '已回款', type: 'bar', data: p.paid, itemStyle: { color: '#10B981' }, barWidth: 38, barCategoryGap: '19%' },
      { name: '待回款', type: 'bar', data: p.pending, itemStyle: { color: '#F59E0B' } },
      { name: '延期金额', type: 'bar', data: p.delayed, itemStyle: { color: '#EF4444', borderRadius: [4, 4, 0, 0] } },
    ],
  }
})

// 图2：状态分布对比（堆叠柱）
const statusOption = computed(() => {
  const ser = compareStatusSeries(summary.value)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: [...COMPARE_STATUSES], bottom: 0 },
    grid: { left: 60, right: 30, top: 25, bottom: 60 },
    xAxis: { type: 'category', data: [...COMPARE_TIERS] },
    yAxis: { type: 'value', name: '节点数' },
    series: ser.map((s, si) => ({
      name: s.name,
      type: 'bar',
      stack: 'a',
      data: s.data,
      itemStyle:
        si === ser.length - 1
          ? { color: COMPARE_STATUS_COLORS[si], borderRadius: [4, 4, 0, 0] }
          : { color: COMPARE_STATUS_COLORS[si] },
    })),
  }
})

// 图3：月度回款趋势对比（折线）
const trendOption = computed(() => {
  const t = compareTrendSeries(summary.value)
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: [...COMPARE_TIERS], bottom: 0 },
    grid: { left: 60, right: 30, top: 25, bottom: 60 },
    xAxis: { type: 'category', data: t.months, axisLabel: { rotate: t.months.length > 12 ? 30 : 0 } },
    yAxis: { type: 'value', name: '金额(万)' },
    series: t.series.map((s) => ({
      name: s.tier,
      type: 'line',
      smooth: true,
      data: s.data,
      itemStyle: { color: COMPARE_TIER_COLORS[s.tier] },
      lineStyle: { width: 2 },
    })),
  }
})

// 图4：服务组 TOP5/BOTTOM5 HTML 排名榜
const ranks = computed(() => compareOrgRanks(orgRanking.value))
function barColor(r: number): string {
  return r >= 0.45 ? 'linear-gradient(90deg,#10B981,#34D399)' : r >= 0.3 ? 'linear-gradient(90deg,#F59E0B,#FBBF24)' : 'linear-gradient(90deg,#EF4444,#F87171)'
}
function rateColor(r: number): string {
  return r >= 0.45 ? '#10b981' : r >= 0.3 ? '#f59e0b' : '#ef4444'
}
function clip(name: string): string {
  return name && name.length > 8 ? name.slice(0, 8) + '…' : name
}
</script>

<template>
  <div class="compare-view">
    <div class="cv-card">
      <div class="cv-head">回款达成对比看板</div>
      <div class="cv-body"><CompareCards :stats="stats" /></div>
    </div>

    <div class="cv-two-col">
      <div class="cv-card">
        <div class="cv-head">回款进度对比</div>
        <div class="cv-body"><ChartBox :option="progressOption" height="320px" /></div>
      </div>
      <div class="cv-card">
        <div class="cv-head">状态分布对比</div>
        <div class="cv-body"><ChartBox :option="statusOption" height="320px" /></div>
      </div>
    </div>

    <div class="cv-card">
      <div class="cv-head">月度回款趋势对比</div>
      <div class="cv-body"><ChartBox :option="trendOption" height="360px" /></div>
    </div>

    <div class="cv-card">
      <div class="cv-head">服务组达成率排名</div>
      <div class="cv-body">
        <div class="cv-ranks">
          <div class="cv-rank-col">
            <div class="cv-rank-title" style="color:#10b981">TOP5</div>
            <div v-for="(v, i) in ranks.top5" :key="'t' + v.org" class="cv-rank-item">
              <span class="cv-rank-no">{{ i + 1 }}</span>
              <span class="cv-rank-name" :title="v.org">{{ clip(v.org) }}</span>
              <span class="cv-rank-bar-wrap"><span class="cv-rank-bar" :style="{ width: (v.actualTotal / ranks.max * 100).toFixed(1) + '%', background: barColor(v.achievementRate) }" /></span>
              <span class="cv-rank-amount">{{ fmtYuan(v.actualTotalWan) }}</span>
              <span class="cv-rank-rate" :style="{ color: rateColor(v.achievementRate) }">{{ pct(v.achievementRate) }}</span>
            </div>
          </div>
          <div class="cv-rank-col">
            <div class="cv-rank-title" style="color:#ef4444">BOTTOM5</div>
            <div v-for="(v, i) in ranks.bottom5" :key="'b' + v.org" class="cv-rank-item">
              <span class="cv-rank-no">{{ i + 1 }}</span>
              <span class="cv-rank-name" :title="v.org">{{ clip(v.org) }}</span>
              <span class="cv-rank-bar-wrap"><span class="cv-rank-bar" :style="{ width: (v.actualTotal / ranks.max * 100).toFixed(1) + '%', background: barColor(v.achievementRate) }" /></span>
              <span class="cv-rank-amount">{{ fmtYuan(v.actualTotalWan) }}</span>
              <span class="cv-rank-rate" :style="{ color: rateColor(v.achievementRate) }">{{ pct(v.achievementRate) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compare-view { padding: 16px; }
.cv-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; }
.cv-head { font-weight: 700; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; color: #2563eb; }
.cv-body { padding: 16px; }
.cv-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.cv-two-col .cv-card { margin-bottom: 14px; }
.cv-ranks { display: flex; gap: 24px; }
.cv-rank-col { flex: 1; min-width: 0; }
.cv-rank-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; padding-left: 4px; }
.cv-rank-item { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 13px; }
.cv-rank-no { width: 20px; text-align: center; color: #64748b; }
.cv-rank-name { width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-rank-bar-wrap { flex: 1; background: #f1f5f9; border-radius: 4px; height: 10px; }
.cv-rank-bar { display: block; height: 10px; border-radius: 4px; }
.cv-rank-amount { width: 80px; text-align: right; color: #334155; }
.cv-rank-rate { width: 56px; text-align: right; font-weight: 600; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/CompareView.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/CompareView.vue frontend/src/views/CompareView.test.ts
git commit -m "feat(b18): CompareView 区间对比（卡片+三图+服务组TOP5/BOTTOM5排名榜）"
```

---

## Task 5: AboutView.vue 关于产品

**Files:**
- Create: `frontend/src/views/AboutView.vue`
- Test: `frontend/src/views/AboutView.test.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend/src/views/AboutView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AboutView from './AboutView.vue'
import { useDataStore } from '@/stores/data'
import { APP_VERSION } from '@/version'

describe('AboutView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('展示产品名、版本号、作者、数据来源', () => {
    const w = mount(AboutView)
    const t = w.text()
    expect(t).toContain('项目回款跟踪与管控平台')
    expect(t).toContain(APP_VERSION)
    expect(t).toContain('交付中心-交付实施三部-阿童木')
    expect(t).toContain('WPS云文档')
  })

  it('数据更新取 meta.lastUpdate；缺失显示 -', () => {
    const store = useDataStore()
    store.data = { meta: { lastUpdate: '2026-05-30' } } as any
    const w = mount(AboutView)
    expect(w.text()).toContain('2026-05-30')
  })

  it('渲染功能说明列表（至少若干条）', () => {
    const w = mount(AboutView)
    expect(w.findAll('.about-features li').length).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/AboutView.test.ts`
Expected: FAIL（视图不存在）

- [ ] **Step 3: 实现 AboutView.vue**

Create `frontend/src/views/AboutView.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { APP_VERSION, RELEASE_DATE } from '@/version'

const data = useDataStore()
const lastUpdate = computed(() => (data.data?.meta as any)?.lastUpdate || '-')

const FEATURES = [
  '按项目金额区间（100万以上 / 50-100万 / 50万以下）分级管理',
  '看板首页：6 种节点状态（加资源可提前 / 达到回款条件 / 已提前回款 / 已全额回款 / 延期 / 正常实施中）汇总展示',
  '季度待回款与月度待回款图表，支持年份 / 季度切换',
  '服务组（L4）达成率排名、延期项目 Top10',
  '区间对比：三档回款达成对比看板、回款进度 / 状态分布 / 月度趋势对比、服务组 TOP5/BOTTOM5 排名',
  '回款日历：独立年份切换、双月视图、状态热力图、15 天 / 30 天到期提醒',
  '回款台账：跨区间统一视图、行内下钻、节点状态卡片、区间摘要',
  '业务分析：项目总览 / 回款节点 / 回款状态 / 风险项目 / 数据质检',
  '项目经理视图、视角切换（L4 服务组 / 项目经理）、周期切换（年 / 季度）',
  '临期跟进（Signal Board）：L4 服务组 30/15/7 天临期回款进度，含展开面板、节点详情、跟进记录与云文档异步回写',
  '纳管筛选开关，支持是 / 空值展示、否排除，全系统联动',
  '数据管理：WPS 云文档同步（含停止同步）、离线 Excel 导入（含停止）、数据缺失检查、清空数据',
]
</script>

<template>
  <div class="about-view">
    <div class="about-head">
      <div class="about-name">项目回款跟踪与管控平台</div>
      <div class="about-ver">Version {{ APP_VERSION }}</div>
    </div>

    <div class="about-grid">
      <div class="about-k">产品名称</div><div class="about-v">项目回款跟踪与管控平台</div>
      <div class="about-k">版本号</div><div class="about-v">{{ APP_VERSION }}</div>
      <div class="about-k">发布日期</div><div class="about-v">{{ RELEASE_DATE }}</div>
      <div class="about-k">作者</div><div class="about-v">交付中心-交付实施三部-阿童木</div>
      <div class="about-k">数据来源</div><div class="about-v">WPS云文档 - 项目回款节点清单</div>
      <div class="about-k">数据更新</div><div class="about-v">{{ lastUpdate }}</div>
    </div>

    <div class="about-feat-box">
      <div class="about-feat-title">功能说明</div>
      <ul class="about-features">
        <li v-for="(f, i) in FEATURES" :key="i">{{ f }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.about-view { padding: 24px; max-width: 720px; }
.about-head { margin-bottom: 24px; }
.about-name { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
.about-ver { font-size: 14px; color: #94a3b8; }
.about-grid { display: grid; grid-template-columns: 120px 1fr; gap: 12px 16px; font-size: 13px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
.about-k { color: #64748b; font-weight: 600; }
.about-v { color: #1f2937; }
.about-feat-box { margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 12px; color: #64748b; }
.about-feat-title { font-weight: 700; margin-bottom: 8px; color: #334155; }
.about-features { list-style: disc; padding-left: 20px; line-height: 2; margin: 0; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/AboutView.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/AboutView.vue frontend/src/views/AboutView.test.ts
git commit -m "feat(b18): AboutView 关于产品（版本/信息/功能说明）"
```

---

## Task 6: 路由接入 + 测试更新 + 验证 + PROGRESS

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/router/index.test.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 路由替换 PageStub**

In `frontend/src/router/index.ts`:

加入两个 import（放在已有视图 import 之后）：

```ts
import CompareView from '@/views/CompareView.vue'
import AboutView from '@/views/AboutView.vue'
```

把 `/compare` 与 `/about` 两行的 `component: PageStub` 改为：

```ts
    { path: '/compare', name: 'compare', component: CompareView, meta: { title: '区间对比' } },
```
```ts
    { path: '/about', name: 'about', component: AboutView, meta: { title: '关于产品' } },
```

`PageStub` 此时已无人引用——移除其 import 行 `import PageStub from '@/components/PageStub.vue'`（B18 后所有路由均为真实视图）。

- [ ] **Step 2: 更新路由测试，断言 compare/about 不再是 PageStub**

In `frontend/src/router/index.test.ts`, 在第一个 `it` 之后追加：

```ts
  it('compare / about 解析到真实视图（非占位 PageStub）', () => {
    const c = router.resolve('/compare')
    const a = router.resolve('/about')
    expect((c.matched[0].components?.default as any).__name).toBe('CompareView')
    expect((a.matched[0].components?.default as any).__name).toBe('AboutView')
  })
```

注：若 `.__name` 在构建产物中不可靠，改为断言 `c.name === 'compare'` 且组件非 `PageStub`——但 dev/test 下 SFC 编译会带 `__name`，优先用上面写法。

- [ ] **Step 3: 跑路由测试**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: PASS（含原 3 例 + 新增 1 例）

- [ ] **Step 4: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（py_compile + ruff + pytest + 前端 typecheck/vitest/build 全绿）

- [ ] **Step 5: 更新 PROGRESS.md**

- 把 Backlog 行 `- [ ] **B18** 区间对比(compare) + 关于(about)。` 改为 `- [x]` 并补一句结论。
- 顶部"最近更新"改为 `2026-06-04（B18 区间对比 + 关于 完成；Phase B 前端重写收官）`。
- 在"会话交接备注"顶部新增 `### ✅ Plan B18 完成（2026-06-04）` 段，记录：产物（version.ts、lib/compare、CompareCards、CompareView、AboutView、路由接入）、两处 app.js 缺陷的忠实修正（已回款系列裸数值 / 保留状态图死代码兜底）、数据源口径（summary/dashboard 不经 filterStore）、整体进度（B1-B18 前端全部完成）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/router/index.test.ts PROGRESS.md
git commit -m "feat(b18): 路由接入 CompareView/AboutView，移除 PageStub；PROGRESS 收官"
```

---

## Self-Review（计划自检）

- **Spec coverage**：compare 的卡片 / 进度图 / 状态图 / 趋势图 / 服务组排名五块（Task 2 数据 + Task 3 卡片 + Task 4 视图）全覆盖；about 的信息网格 + 版本 + lastUpdate + 功能列表（Task 5）覆盖；两个路由点亮（Task 6）。
- **Placeholder scan**：无 TODO/TBD；每个代码步骤含完整代码。
- **Type consistency**：`CompareTierStat`/`OrgRankRow`/`CompareProgress` 等在 Task 2 定义，Task 3/4 引用一致；`compareTierStats(summary, rawNodes)`、`compareOrgRanks(orgRanking)` 签名前后一致；`APP_VERSION`/`RELEASE_DATE` 在 Task 1 定义，Task 5 引用。
- **忠实性双确认**：已回款系列改裸数值（修 app.js 千分位字符串 bug）、状态图保留不可达兜底分支——均在 Task 2 代码注释与 PROGRESS 记录。
