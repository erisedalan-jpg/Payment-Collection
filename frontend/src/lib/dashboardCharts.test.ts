import { describe, it, expect } from 'vitest'
import { aggregateQuarterly, aggregateMonthly, rankByOrg, delayedTopProjects } from './dashboardCharts'

const NODES: any[] = [
  { projectId: 'P1', tier: '100万以上', orgL4: '北京', isPaymentRelated: true, nodeStatus: '延期', planMonth: '2026-02', expectedPayment: 1000000, actualPayment: 0, actualPaymentRatio: '0%', delayDays: 30 },
  { projectId: 'P2', tier: '50-100万', orgL4: '上海', isPaymentRelated: true, nodeStatus: '正常实施中', planMonth: '2026-05', expectedPayment: 800000, actualPayment: 200000, actualPaymentRatio: '25%', delayDays: 0 },
  { projectId: 'P3', tier: '100万以上', orgL4: '北京', isPaymentRelated: true, nodeStatus: '已全额回款', planMonth: '2026-03', expectedPayment: 500000, actualPayment: 500000, actualPaymentRatio: '100%', delayDays: 0 },
]

describe('aggregateQuarterly', () => {
  it('sums remaining(万) by tier×quarter, excludes fully-paid', () => {
    const r = aggregateQuarterly(NODES, 'all')
    expect(r.categories).toEqual(['2026-Q1', '2026-Q2'])
    const above = r.series.find((s) => s.tier === '100万以上')!
    const mid = r.series.find((s) => s.tier === '50-100万')!
    expect(above.data).toEqual([100, 0])
    expect(mid.data).toEqual([0, 60])
  })
  it('fills all 4 quarters for a specific year', () => {
    const r = aggregateQuarterly(NODES, '2026')
    expect(r.categories).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'])
  })
})

describe('aggregateMonthly', () => {
  it('sums remaining(万) by tier×month, excludes fully-paid', () => {
    const r = aggregateMonthly(NODES, 'all')
    expect(r.categories).toEqual(['2026-02', '2026-05'])
  })
  it('fills 12 months for a specific year', () => {
    const r = aggregateMonthly(NODES, '2026')
    expect(r.categories.length).toBe(12)
    expect(r.categories[0]).toBe('2026-01')
  })
})

describe('rankByOrg', () => {
  it('groups related nodes by orgL4 with achievementRate, sorted', () => {
    const r = rankByOrg(NODES, '', 'actualTotal')
    const bj = r.find((o) => o.org === '北京')!
    expect(bj.expectedTotal).toBe(1500000)
    expect(bj.actualTotal).toBe(500000)
    expect(bj.achievementRate).toBeCloseTo(1 / 3)
    expect(r[0].org).toBe('北京')
  })
  it('tier filter restricts to that tier', () => {
    const r = rankByOrg(NODES, '50-100万', 'actualTotal')
    expect(r.map((o) => o.org)).toEqual(['上海'])
  })
  it('sorts by achievementRate when requested', () => {
    // 北京: 600000/1000000 = 0.6; 上海: 200000/800000 = 0.25 → 北京 first by rate
    const r = rankByOrg(NODES, '', 'achievementRate')
    expect(r[0].org).toBe('北京')
    expect(r[0].achievementRate).toBeGreaterThan(r[1].achievementRate)
  })
})

describe('delayedTopProjects', () => {
  it('returns delayed projects sorted by max delayDays', () => {
    const r = delayedTopProjects(NODES, 10)
    expect(r.length).toBe(1)
    expect(r[0].projectId).toBe('P1')
    expect(r[0].maxDelay).toBe(30)
  })
  it('truncates to the given limit', () => {
    const many: any[] = []
    for (let i = 0; i < 15; i++) {
      many.push({ projectId: `D${i}`, projectName: `延期${i}`, tier: '100万以上', orgL4: '北京', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 100000, actualPayment: 0, delayDays: i + 1, planMonth: '2025-01' })
    }
    const r = delayedTopProjects(many, 10)
    expect(r.length).toBe(10)
    // 按 delayDays 降序，最大 delayDays=15 (D14) 在首位
    expect(r[0].projectId).toBe('D14')
  })
})

describe('delayedTopProjects sortBy', () => {
  const dnodes = [
    { projectId: 'A', projectName: '延期A', tier: '100万以上', orgL4: 'X', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 2200000, actualPayment: 0, delayDays: 15, planMonth: '2026-01' },
    { projectId: 'B', projectName: '延期B', tier: '50万以下', orgL4: 'Y', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 400000, actualPayment: 0, delayDays: 40, planMonth: '2026-02' },
  ] as any

  it('默认按天数降序', () => {
    const r = delayedTopProjects(dnodes, 10)
    expect(r.map((p) => p.projectId)).toEqual(['B', 'A'])
  })

  it('按金额降序（remainingAmount）', () => {
    const r = delayedTopProjects(dnodes, 10, 'amount')
    expect(r.map((p) => p.projectId)).toEqual(['A', 'B'])
    expect(r[0].remainingAmount).toBe(2200000)
  })
})
