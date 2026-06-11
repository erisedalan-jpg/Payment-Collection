import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis, RawNode } from '@/types/analysis'
import { computeKpis, healthSummary, paymentBand } from './overview'

const PAY0 = { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }

const PROJECTS = [
  { projectId: 'P-1', projectName: '甲', payment: { ...PAY0, expectedTotal: 1000, actualTotal: 600 }, deliveryCosts: [],
    health: { progressAbnormal: true, riskAbnormal: true, costAbnormal: false, paymentAbnormal: false, overall: '风险' } },
  { projectId: 'P-2', projectName: '乙', payment: { ...PAY0, expectedTotal: 1000, actualTotal: 0 }, deliveryCosts: [],
    health: { progressAbnormal: false, riskAbnormal: false, costAbnormal: true, paymentAbnormal: false, overall: '关注' } },
  { projectId: 'P-3', projectName: '丙', payment: { ...PAY0 }, deliveryCosts: [],
    health: { overall: '健康' } },
] as unknown as Project[]

const PMIS = {
  'P-1': { status: { 项目状态: '实施中', 是否暂停: false }, cost: { 超支: true } },
  'P-2': { status: { 项目状态: '项目暂停', 是否暂停: true }, cost: { 超支: false } },
} as unknown as Record<string, ProjectPmis>

describe('computeKpis', () => {
  it('六指标统计(实施中/暂停bool/高风险=riskAbnormal/超支/达成率)', () => {
    const k = computeKpis(PROJECTS, PMIS)
    expect(k.total).toBe(3)
    expect(k.active).toBe(1)
    expect(k.paused).toBe(1)
    expect(k.highRisk).toBe(1)
    expect(k.overspend).toBe(1)
    expect(k.paymentRatio).toBeCloseTo(0.3) // 600/2000
  })
  it('计划为 0 → 达成率 null', () => {
    expect(computeKpis([PROJECTS[2]], {}).paymentRatio).toBeNull()
  })
})

describe('healthSummary', () => {
  it('三档计数+四维异常+风险项目卡列表', () => {
    const h = healthSummary(PROJECTS)
    expect(h.counts).toEqual({ 健康: 1, 关注: 1, 风险: 1, 无数据: 0 })
    expect(h.dims).toEqual({ progress: 1, risk: 1, cost: 1, payment: 0 })
    expect(h.riskProjects.map((p) => p.projectId)).toEqual(['P-1'])
  })
  it('overall 缺失/未知值归无数据', () => {
    const h = healthSummary([{ projectId: 'X', health: {} } as unknown as Project])
    expect(h.counts.无数据).toBe(1)
  })
})

describe('paymentBand', () => {
  const NOW = new Date('2026-06-11T08:00:00')
  const NODES = [
    // 年内+本月+未回清 → 计入年度/本月
    { projectId: 'P-1', projectName: '甲', nodeName: 'a', isPaymentRelated: true, nodeStatus: '正常实施中',
      planDate: '2026-06-25', planMonth: '2026-06', expectedPayment: 500000, actualPayment: 100000 },
    // 7 天临期(6-13)且未回清
    { projectId: 'P-1', projectName: '甲', nodeName: 'b', isPaymentRelated: true, nodeStatus: '正常实施中',
      planDate: '2026-06-13', planMonth: '2026-06', expectedPayment: 200000, actualPayment: 0 },
    // 延期,待回 30 万
    { projectId: 'P-2', projectName: '乙', nodeName: 'c', isPaymentRelated: true, nodeStatus: '延期',
      planDate: '2026-03-31', planMonth: '2026-03', expectedPayment: 300000, actualPayment: 0 },
    // 去年节点不计年度
    { projectId: 'P-2', projectName: '乙', nodeName: 'd', isPaymentRelated: true, nodeStatus: '已全额回款',
      planDate: '2025-12-31', planMonth: '2025-12', expectedPayment: 100000, actualPayment: 100000 },
    // 非回款节点排除
    { projectId: 'P-3', projectName: '丙', nodeName: 'e', isPaymentRelated: false, planDate: '2026-06-12', expectedPayment: 999999 },
  ] as unknown as RawNode[]

  it('年度/本月/临期/延期Top 各口径', () => {
    const b = paymentBand(NODES, NOW)
    expect(b.yearExpected).toBe(1000000) // a+b+c
    expect(b.yearActual).toBe(100000)
    expect(b.monthPending).toBe(600000)  // a 余40万 + b 20万
    expect(b.dueSoon7).toBe(1)           // b(6-13);a(6-25)超窗;e 非回款排除
    expect(b.delayedTop).toEqual([
      { projectId: 'P-2', projectName: '乙', nodeName: 'c', remaining: 300000 },
    ])
  })
  it('延期超过 3 条只取待回金额 Top3', () => {
    const many = [1, 2, 3, 4].map((i) => ({
      projectId: `P-${i}`, projectName: `项${i}`, nodeName: `n${i}`, isPaymentRelated: true,
      nodeStatus: '延期', planDate: '2026-01-01', planMonth: '2026-01',
      expectedPayment: i * 100000, actualPayment: 0,
    })) as unknown as RawNode[]
    const b = paymentBand(many, NOW)
    expect(b.delayedTop.map((t) => t.remaining)).toEqual([400000, 300000, 200000])
  })
})
