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
})

describe('delayedTopProjects', () => {
  it('returns delayed projects sorted by max delayDays', () => {
    const r = delayedTopProjects(NODES, 10)
    expect(r.length).toBe(1)
    expect(r[0].projectId).toBe('P1')
    expect(r[0].maxDelay).toBe(30)
  })
})
