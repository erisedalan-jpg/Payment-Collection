import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis, PaymentRecordsEntry } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
import { computeKpis, healthSummary, paymentBand } from './overview'

const PAY0 = { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }

// orgL4 非空 = 正常项目（P-3 无 orgL4 = 异常项目，回款达成率应排除）
const PROJECTS = [
  { projectId: 'P-1', projectName: '甲', orgL4: '交付一组', payment: { ...PAY0, expectedTotal: 1000, actualTotal: 600 }, deliveryCosts: [],
    health: { progressAbnormal: true, riskAbnormal: true, costAbnormal: false, paymentAbnormal: false, overall: '风险' } },
  { projectId: 'P-2', projectName: '乙', orgL4: '交付二组', payment: { ...PAY0, expectedTotal: 1000, actualTotal: 0 }, deliveryCosts: [],
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
    // 回款达成率排除异常项目(P-3 orgL4 空): 600/(1000+1000) = 0.3
    expect(k.paymentRatio).toBeCloseTo(0.3)
  })
  it('计划为 0 → 达成率 null', () => {
    // P-3 orgL4 为空 = 异常, 排除后 exp=0 → null
    expect(computeKpis([PROJECTS[2]], {}).paymentRatio).toBeNull()
  })
  it('[守护] 全部项目异常时达成率为 null', () => {
    // 三个项目均无 orgL4
    const anomalous = PROJECTS.map((p) => ({ ...p, orgL4: undefined })) as unknown as Project[]
    expect(computeKpis(anomalous, PMIS).paymentRatio).toBeNull()
  })
  it('[守护] cost.项目超支:true 且不含旧键超支 → 计入 overspend', () => {
    // 确保旧键 cost.超支 回归能被抓到：新键项目超支生效，不依赖旧键
    const proj = { projectId: 'G-1', projectName: '守护测试', orgL4: '测试组', payment: { ...PAY0 }, deliveryCosts: [],
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
  it('无 paymentRecords 时退化节点 receivedAmount(原口径兼容)', () => {
    const now = new Date('2026-02-15T00:00:00')
    const rows = [
      pn({ planDate: '2026-02-10', expectedPayment: 100000, receivedAmount: 40000, unpaidAmount: 60000, status: '部分回款' }),
      pn({ planDate: '2026-02-18', expectedPayment: 50000, receivedAmount: 0, unpaidAmount: 50000, status: '延期', stage: '验收款', projectId: 'P9', projectName: '丙' }),
      pn({ planDate: '2025-12-01', expectedPayment: 30000, receivedAmount: 30000, unpaidAmount: 0, status: '已回款' }),
    ]
    const b = paymentBand(rows, now)
    expect(b.yearExpected).toBe(150000)
    expect(b.yearActual).toBe(40000)  // 节点 receivedAmount（仅当年节点）
    expect(b.monthPending).toBe(110000)
    expect(b.dueSoon7).toBe(1)
    expect(b.delayedTop[0]).toMatchObject({ projectId: 'P9', stage: '验收款', remaining: 50000 })
  })

  it('传入 paymentRecords 时 yearActual 改用流水(全部口径，start/end 均空)', () => {
    const now = new Date('2026-02-15T00:00:00')
    const rows = [
      pn({ projectId: 'P1', planDate: '2026-02-10', expectedPayment: 100000, receivedAmount: 40000, unpaidAmount: 60000, status: '部分回款' }),
      pn({ projectId: 'P9', planDate: '2026-02-18', expectedPayment: 50000, receivedAmount: 0, unpaidAmount: 50000, status: '延期', stage: '验收款', projectName: '丙' }),
    ]
    const paymentRecords: Record<string, PaymentRecordsEntry> = {
      P1: { records: [{ amount: 70000, date: '2026-02-01' } as any] },
      P9: { records: [{ amount: 20000, date: '2025-12-10' } as any] },
    }
    // 全部口径(start=end=''):流水含空日期和所有日期，yearActual = 70000+20000
    const b = paymentBand(rows, now, paymentRecords, '', '')
    expect(b.yearActual).toBe(90000)  // 两项目流水之和
    expect(b.yearExpected).toBe(150000)  // 无区间，年度前缀匹配
  })

  it('传入 paymentRecords + 区间时 yearActual 仅含区间内流水', () => {
    const now = new Date('2026-02-15T00:00:00')
    const rows = [
      pn({ projectId: 'P1', planDate: '2026-02-10', expectedPayment: 100000, receivedAmount: 40000, unpaidAmount: 60000, status: '部分回款' }),
      pn({ projectId: 'P9', planDate: '2026-08-01', expectedPayment: 50000, receivedAmount: 0, unpaidAmount: 50000, status: '延期', stage: '验收款', projectName: '丙' }),
    ]
    const paymentRecords: Record<string, PaymentRecordsEntry> = {
      P1: { records: [{ amount: 70000, date: '2026-02-01' } as any] },
      P9: { records: [{ amount: 20000, date: '2025-12-10' } as any] },  // 区间外
    }
    // 区间 2026-01-01..2026-06-30: P1 流水在内, P9 流水在外
    const b = paymentBand(rows, now, paymentRecords, '2026-01-01', '2026-06-30')
    expect(b.yearActual).toBe(70000)
    // 区间内计划节点只有 P1(2026-02-10 ∈ 区间); P9 计划日 2026-08-01 在区间外
    expect(b.yearExpected).toBe(100000)
    // delayedTop: P9 延期但计划日区间外，不纳入
    expect(b.delayedTop).toHaveLength(0)
  })
})
