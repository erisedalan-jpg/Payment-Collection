import { describe, it, expect } from 'vitest'
import { filterPayNodes, payDashSummary, payTierStats } from './payDashboard'
import type { PayNodeRow } from './paymentPmis'

function node(p: Partial<PayNodeRow>): PayNodeRow {
  return {
    projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-01', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0, projectManager: '张三',
    status: '待回款', dept: 'A组', orgL3_1: '', projStage: '', tier: '100万以上', progress: '部分回款', ...p,
  }
}

describe('filterPayNodes', () => {
  const rows = [
    node({ projectId: 'P1', dept: 'A组', projectManager: '张三', planDate: '2026-02-01' }),
    node({ projectId: 'P2', dept: 'B组', projectManager: '李四', planDate: '2026-08-01' }),
    node({ projectId: 'P3', dept: 'A组', projectManager: '张三', planDate: '' }),
  ]
  const base = { dateStart: '', dateEnd: '', viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  it('视角 l4 按 dept 过滤', () => {
    expect(filterPayNodes(rows, { ...base, viewMode: 'l4', viewL4: 'A组' }).map((r) => r.projectId)).toEqual(['P1', 'P3'])
  })
  it('视角 pm 按 projectManager 过滤', () => {
    expect(filterPayNodes(rows, { ...base, viewMode: 'pm', viewPM: '李四' }).map((r) => r.projectId)).toEqual(['P2'])
  })
  it('排除按 excludedIds', () => {
    expect(filterPayNodes(rows, { ...base, excludeActive: true, excludedIds: { P1: true } }).map((r) => r.projectId)).toEqual(['P2', 'P3'])
  })
  it('dateStart/dateEnd 均空=全部（含空 planDate）', () => {
    expect(filterPayNodes(rows, { ...base }).map((r) => r.projectId)).toEqual(['P1', 'P2', 'P3'])
  })
  it('区间过滤 2026-01-01~2026-06-30: P1 在内 P2 不在 P3(空 planDate)排除', () => {
    expect(filterPayNodes(rows, { ...base, dateStart: '2026-01-01', dateEnd: '2026-06-30' }).map((r) => r.projectId)).toEqual(['P1'])
  })
  it('仅 dateStart 限制下界', () => {
    expect(filterPayNodes(rows, { ...base, dateStart: '2026-07-01', dateEnd: '' }).map((r) => r.projectId)).toEqual(['P2'])
  })
})

describe('payDashSummary', () => {
  const rows = [
    node({ projectId: 'P1', expectedPayment: 1000, receivedAmount: 600, unpaidAmount: 400, status: '部分回款', planDate: '2026-02-01' }),
    node({ projectId: 'P2', expectedPayment: 500, receivedAmount: 0, unpaidAmount: 500, status: '延期', planDate: '2026-08-01' }),
  ]
  const projects = [{ projectId: 'P1', orgL4: 'A组', projectManager: '张三' }, { projectId: 'P2', orgL4: 'B组', projectManager: '李四' }] as any
  const opts = { viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  // paymentRecords: P1 有流水 700, P2 有流水 200
  const paymentRecords = {
    P1: { records: [{ date: '2026-02-10', amount: 700 }] },
    P2: { records: [{ date: '2026-08-05', amount: 200 }] },
  } as any
  // paymentNodes: 与 rows planDate 对应
  const paymentNodes = {
    P1: [{ planDate: '2026-02-01', expectedPayment: 1000, unpaidAmount: 400, reached: false, status: '部分回款' }],
    P2: [{ planDate: '2026-08-01', expectedPayment: 500, unpaidAmount: 500, reached: false, status: '延期' }],
  } as any

  it('全部口径: 已回款=Σ全流水(inScope), 完成率=totalActual/totalExpected, 延期项目/relatedNodeCount', () => {
    const s = payDashSummary(rows, projects, opts, paymentRecords, paymentNodes, '', '')
    expect(s.relatedNodeCount).toBe(2)
    expect(s.totalActual).toBe(900)           // P1:700 + P2:200
    expect(s.totalExpected).toBe(1500)        // 来自 rows
    expect(s.totalRemaining).toBe(900)        // 来自 rows
    expect(s.rate).toBeCloseTo(900 / 1500)    // 流水/计划
    expect(s.delayedProjects).toBe(1)
    // 全部下两个项目均有活动
    expect(s.totalProjects).toBe(2)
  })

  it('区间口径: start/end 过滤, 已回款只计区间内流水, 项目数=有活动项目', () => {
    // 区间 2026-01-01~2026-06-30: P1 流水(2026-02-10)在内, P2 流水(2026-08-05)不在
    const s = payDashSummary(rows, projects, opts, paymentRecords, paymentNodes, '2026-01-01', '2026-06-30')
    expect(s.totalActual).toBe(700)           // 只有 P1 的流水
    expect(s.totalProjects).toBe(1)           // 只有 P1 有活动(节点 planDate 2026-02-01 在区间内)
  })

  it('全部口径不变式: start=end="" 时 totalActual=Σ全流水(inScope)', () => {
    const s = payDashSummary(rows, projects, opts, paymentRecords, paymentNodes, '', '')
    expect(s.totalActual).toBe(900)
    expect(s.rate).toBeCloseTo(s.totalActual / s.totalExpected)
  })

  it('无 paymentRecords 时 totalActual=0', () => {
    const s = payDashSummary(rows, projects, opts, undefined, undefined, '', '')
    expect(s.totalActual).toBe(0)
    expect(s.rate).toBe(0)
  })

  it('totalProjects 排除 orgL4 空项目', () => {
    const p2 = [
      { projectId: 'A', projectName: 'a', orgL4: '组1' } as any,
      { projectId: 'X', projectName: 'x', orgL4: '' } as any,
    ]
    const opts2 = { viewMode: 'global', viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} } as any
    // 全部口径, 无活动(paymentRecords/paymentNodes 均空), 只有 A(orgL4非空) 在 inScope
    // start=end='' 下 hasActivityInRange 对空 nodes/records 返回 false => totalProjects=0
    expect(payDashSummary([], p2, opts2, {}, {}, '', '').totalProjects).toBe(0)
    // inScope 仍有 1 个项目(A), 只是无活动
    expect(payDashSummary([], p2, opts2).relatedNodeCount).toBe(0)
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

import { payOrgRanking, payMonthlyTrend, payQuarterlyTrend } from './payDashboard'

describe('payOrgRanking', () => {
  const rows = [
    node({ dept: 'A组', expectedPayment: 1000, receivedAmount: 800 }),
    node({ dept: 'B组', expectedPayment: 1000, receivedAmount: 100 }),
  ]
  it('OrgRank 形态 + 按 actualTotal 降序', () => {
    const r = payOrgRanking(rows, 'actualTotal')
    expect(r[0].org).toBe('A组')
    expect(r[0].actualTotal).toBe(800)
    expect(r[0].achievementRate).toBeCloseTo(0.8)
  })
  it('按 achievementRate 降序', () => {
    expect(payOrgRanking(rows, 'achievementRate')[0].org).toBe('A组')
  })
})

describe('payMonthlyTrend/payQuarterlyTrend', () => {
  const rows = [
    node({ tier: '100万以上', planDate: '2026-02-10', unpaidAmount: 10000, status: '待回款' }),
    node({ tier: '100万以上', planDate: '2026-05-10', unpaidAmount: 20000, status: '延期' }),
    node({ tier: '100万以上', planDate: '2026-02-10', unpaidAmount: 99999, status: '已回款' }),
  ]
  it('月度按 planDate 月份分桶，已回款不计（start/end 空=全部）', () => {
    const s = payMonthlyTrend(rows, '', '')
    expect(s.categories).toContain('2026-02')
    const t = s.series.find((x) => x.tier === '100万以上')!
    const i = s.categories.indexOf('2026-02')
    expect(t.data[i]).toBeCloseTo(1)
  })
  it('指定区间补满月份键（2026-01-01~2026-12-31 补 12 个月）', () => {
    expect(payMonthlyTrend(rows, '2026-01-01', '2026-12-31').categories.length).toBe(12)
  })
  it('季度分桶 key 形如 2026-Q1（start/end 空=全部）', () => {
    expect(payQuarterlyTrend(rows, '', '').categories).toContain('2026-Q1')
  })
  it('指定区间补满季度键（2026-01-01~2026-12-31 补 4 季度）', () => {
    expect(payQuarterlyTrend(rows, '2026-01-01', '2026-12-31').categories.length).toBe(4)
  })
})
