import { describe, it, expect } from 'vitest'
import { filterPayNodes, payDashSummary, payTierStats } from './payDashboard'
import type { PayNodeRow } from './paymentPmis'

function node(p: Partial<PayNodeRow>): PayNodeRow {
  return {
    projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-01', actualDate: '',
    payRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0, projectManager: '张三',
    status: '待回款', dept: 'A组', projStage: '', tier: '100万以上', progress: '部分回款', ...p,
  }
}

describe('filterPayNodes', () => {
  const rows = [
    node({ projectId: 'P1', dept: 'A组', projectManager: '张三', planDate: '2026-02-01' }),
    node({ projectId: 'P2', dept: 'B组', projectManager: '李四', planDate: '2026-08-01' }),
    node({ projectId: 'P3', dept: 'A组', projectManager: '张三', planDate: '' }),
  ]
  const base = { filterYear: 'all', viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  it('视角 l4 按 dept 过滤', () => {
    expect(filterPayNodes(rows, { ...base, viewMode: 'l4', viewL4: 'A组' }).map((r) => r.projectId)).toEqual(['P1', 'P3'])
  })
  it('视角 pm 按 projectManager 过滤', () => {
    expect(filterPayNodes(rows, { ...base, viewMode: 'pm', viewPM: '李四' }).map((r) => r.projectId)).toEqual(['P2'])
  })
  it('排除按 excludedIds', () => {
    expect(filterPayNodes(rows, { ...base, excludeActive: true, excludedIds: { P1: true } }).map((r) => r.projectId)).toEqual(['P2', 'P3'])
  })
  it('单年度按 planDate 月份(无 planDate 被排除)', () => {
    expect(filterPayNodes(rows, { ...base, filterYear: '2026' }).map((r) => r.projectId)).toEqual(['P1', 'P2'])
  })
  it('季度过滤 2026-Q1', () => {
    expect(filterPayNodes(rows, { ...base, filterYear: '2026-Q1' }).map((r) => r.projectId)).toEqual(['P1'])
  })
})

describe('payDashSummary', () => {
  const rows = [
    node({ projectId: 'P1', expectedPayment: 1000, receivedAmount: 600, unpaidAmount: 400, status: '部分回款' }),
    node({ projectId: 'P2', expectedPayment: 500, receivedAmount: 0, unpaidAmount: 500, status: '延期' }),
  ]
  const projects = [{ projectId: 'P1', orgL4: 'A组', projectManager: '张三' }, { projectId: 'P2', orgL4: 'B组', projectManager: '李四' }] as any
  const opts = { viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  it('金额/完成率/延期项目/项目数', () => {
    const s = payDashSummary(rows, projects, opts)
    expect(s.relatedNodeCount).toBe(2)
    expect(s.totalProjects).toBe(2)
    expect(s.totalActual).toBe(600)
    expect(s.totalExpected).toBe(1500)
    expect(s.totalRemaining).toBe(900)
    expect(s.rate).toBeCloseTo(0.4)
    expect(s.delayedProjects).toBe(1)
  })
})

describe('payTierStats', () => {
  const rows = [
    node({ projectId: 'P1', tier: '100万以上', expectedPayment: 1000, receivedAmount: 600, unpaidAmount: 400, status: '已回款' }),
    node({ projectId: 'P1', tier: '100万以上', expectedPayment: 500, receivedAmount: 0, unpaidAmount: 500, status: '延期' }),
    node({ projectId: 'P2', tier: '50万以下', expectedPayment: 100, receivedAmount: 0, unpaidAmount: 100, status: '待回款' }),
  ]
  it('单档聚合 Wan + 5态计数', () => {
    const s = payTierStats('100万以上', rows)
    expect(s.projectCount).toBe(1)
    expect(s.expectedAmountWan).toBeCloseTo(0.15)
    expect(s.actualAmountWan).toBeCloseTo(0.06)
    expect(s.delayedCount).toBe(1)
    expect(s.paidCount).toBe(1)
  })
})
