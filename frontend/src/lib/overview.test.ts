import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
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
  'P-1': { status: { 项目状态: '实施中', 是否暂停: false }, cost: { 项目超支: true } },
  'P-2': { status: { 项目状态: '项目暂停', 是否暂停: true }, cost: { 项目超支: false } },
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
  it('[守护] cost.项目超支:true 且不含旧键超支 → 计入 overspend', () => {
    // 确保旧键 cost.超支 回归能被抓到：新键项目超支生效，不依赖旧键
    const proj = { projectId: 'G-1', projectName: '守护测试', payment: { ...PAY0 }, deliveryCosts: [],
      health: { progressAbnormal: false, riskAbnormal: false, costAbnormal: false, paymentAbnormal: false, overall: '健康' } } as unknown as Project
    const pmis = { 'G-1': { status: {}, cost: { 项目超支: true } } } as unknown as Record<string, ProjectPmis>
    // pmis 中故意不含旧键 '超支'，只含新键 '项目超支'
    expect(pmis['G-1'].cost as any).not.toHaveProperty('超支')
    expect(computeKpis([proj], pmis).overspend).toBe(1)
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

function pn(overrides: Partial<PayNodeRow>): PayNodeRow {
  return {
    projectId: 'P1',
    projectName: '甲',
    stage: '预付款',
    planDate: '2026-01-01',
    actualDate: '',
    payRatio: 0.3,
    actualRatio: 0,
    expectedPayment: 100000,
    receivedAmount: 0,
    unpaidAmount: 100000,
    projectManager: '',
    status: '待回款',
    dept: '',
    orgL3_1: '',
    projStage: '',
    tier: '',
    progress: '0',
    ...overrides,
  }
}

describe('paymentBand', () => {
  it('paymentBand 收款阶段口径', () => {
    const now = new Date('2026-02-15T00:00:00')
    const rows = [
      pn({ planDate: '2026-02-10', expectedPayment: 100000, receivedAmount: 40000, unpaidAmount: 60000, status: '部分回款' }),
      pn({ planDate: '2026-02-18', expectedPayment: 50000, receivedAmount: 0, unpaidAmount: 50000, status: '延期', stage: '验收款', projectId: 'P9', projectName: '丙' }),
      pn({ planDate: '2025-12-01', expectedPayment: 30000, receivedAmount: 30000, unpaidAmount: 0, status: '已回款' }),
    ]
    const b = paymentBand(rows, now)
    expect(b.yearExpected).toBe(150000)
    expect(b.yearActual).toBe(40000)
    expect(b.monthPending).toBe(110000)
    expect(b.dueSoon7).toBe(1)
    expect(b.delayedTop[0]).toMatchObject({ projectId: 'P9', stage: '验收款', remaining: 50000 })
  })
})
