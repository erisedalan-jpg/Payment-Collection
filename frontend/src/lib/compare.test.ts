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
