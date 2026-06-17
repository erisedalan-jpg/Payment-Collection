import { describe, it, expect } from 'vitest'
import {
  excludeFilter,
  filterLedgerProjects,
  ledgerSummary,
  ledgerTierStats,
  ledgerStatusCounts,
} from './ledger'

describe('excludeFilter', () => {
  const nodes = [{ projectId: 'P1' }, { projectId: 'P2' }] as any[]
  it('关闭时返回全部', () => {
    expect(excludeFilter(nodes, false, { P1: true })).toHaveLength(2)
  })
  it('开启时排除 excludedIds 命中的项目', () => {
    expect(excludeFilter(nodes, true, { P1: true }).map((n: any) => n.projectId)).toEqual(['P2'])
  })
})

describe('filterLedgerProjects', () => {
  const projs = [
    { projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '北京', tier: '100万以上', paymentStatus: '延期', projectAmount: 100, nodes: [{ tier: '100万以上' }] },
    { projectId: 'P2', projectName: '乙', projectManager: '李', orgL4: '上海', tier: '50万以下', paymentStatus: '正常实施中', projectAmount: 300, nodes: [{ tier: '50万以下' }] },
  ] as any[]
  it('搜索匹配编号/名称/经理/服务组', () => {
    expect(filterLedgerProjects(projs, { search: '李', tier: '', status: '' }).map((p) => p.projectId)).toEqual(['P2'])
  })
  it('区间按节点 tier 过滤', () => {
    expect(filterLedgerProjects(projs, { search: '', tier: '100万以上', status: '' }).map((p) => p.projectId)).toEqual(['P1'])
  })
  it('状态按 paymentStatus 过滤', () => {
    expect(filterLedgerProjects(projs, { search: '', tier: '', status: '延期' }).map((p) => p.projectId)).toEqual(['P1'])
  })
  it('默认按项目金额降序', () => {
    expect(filterLedgerProjects(projs, { search: '', tier: '', status: '' }).map((p) => p.projectId)).toEqual(['P2', 'P1'])
  })
})

describe('ledgerSummary', () => {
  it('合计与完成率', () => {
    const s = ledgerSummary([
      { expectedPayment: 200, actualPayment: 100 },
      { expectedPayment: 0, actualPayment: 0 },
    ] as any)
    expect(s.projectCount).toBe(2)
    expect(s.totalExp).toBe(200)
    expect(s.totalAct).toBe(100)
    expect(s.totalRem).toBe(100)
    expect(s.rate).toBeCloseTo(0.5)
  })
})

describe('ledgerTierStats', () => {
  it('按项目 tier 分三档（单位万）', () => {
    const r = ledgerTierStats([
      { tier: '100万以上', expectedPayment: 1000000, actualPayment: 400000 },
      { tier: '50万以下', expectedPayment: 200000, actualPayment: 0 },
    ] as any)
    expect(r.map((x) => x.tier)).toEqual(['100万以上', '50-100万', '50万以下'])
    expect(r[0]).toMatchObject({ count: 1, expWan: 100, remWan: 60 })
    expect(r[2]).toMatchObject({ count: 1, expWan: 20, remWan: 20 })
  })
})

describe('ledgerStatusCounts', () => {
  it('按 paymentStatus 计数', () => {
    const c = ledgerStatusCounts([
      { paymentStatus: '延期' },
      { paymentStatus: '延期' },
      { paymentStatus: '加资源可提前' },
    ] as any)
    expect(c.delayed).toBe(2)
    expect(c.canAdvance).toBe(1)
    expect(c.onTime).toBe(0)
  })
})

import {
  ledgerRows, filterLedgerRows, ledgerSummaryPmis, ledgerTierStatsPmis, ledgerStatusCountsPmis,
} from './ledger'
import type { PayNodeRow } from './paymentPmis'

function pn(p: Partial<PayNodeRow>): PayNodeRow {
  return { projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-01', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0,
    projectManager: '张三', status: '待回款', dept: 'A组', projStage: '', tier: '100万以上', progress: '部分回款', ...p }
}

describe('ledgerRows', () => {
  const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }] as any
  it('按项目聚合金额 + 派生 progress/延期 + join 维度', () => {
    const rows = ledgerRows([
      pn({ expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' }),
      pn({ expectedPayment: 500000, receivedAmount: 0, unpaidAmount: 500000, status: '延期' }),
    ], projects)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.expectedPayment).toBe(1500000)
    expect(r.actualPayment).toBe(600000)
    expect(r.remainingAmount).toBe(900000)
    expect(r.paymentRatio).toBeCloseTo(0.4)
    expect(r.paymentStatus).toBe('部分回款')
    expect(r.delayed).toBe(true)
    expect(r.orgL4).toBe('A组')
    expect(r.tier).toBe('100万以上')
    expect(r.projectAmount).toBe(2000000)
    expect(r.nodes).toHaveLength(2)
  })
  it('全额→已全额回款 / 零→未回款', () => {
    expect(ledgerRows([pn({ expectedPayment: 100, receivedAmount: 100, status: '已回款' })], projects)[0].paymentStatus).toBe('已全额回款')
    expect(ledgerRows([pn({ expectedPayment: 100, receivedAmount: 0, status: '待回款' })], projects)[0].paymentStatus).toBe('未回款')
  })
  it('不在 projects 的项目跳过', () => {
    expect(ledgerRows([pn({ projectId: 'X' })], projects)).toHaveLength(0)
  })
})

describe('filterLedgerRows', () => {
  const rows = [
    { projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '北京', tier: '100万以上', projectAmount: 100, paymentStatus: '部分回款', delayed: true },
    { projectId: 'P2', projectName: '乙', projectManager: '李', orgL4: '上海', tier: '50万以下', projectAmount: 300, paymentStatus: '未回款', delayed: false },
  ] as any
  it('搜索/区间/状态(进度)/状态(延期)/降序', () => {
    expect(filterLedgerRows(rows, { search: '李', tier: '', status: '' }).map((r) => r.projectId)).toEqual(['P2'])
    expect(filterLedgerRows(rows, { search: '', tier: '100万以上', status: '' }).map((r) => r.projectId)).toEqual(['P1'])
    expect(filterLedgerRows(rows, { search: '', tier: '', status: '未回款' }).map((r) => r.projectId)).toEqual(['P2'])
    expect(filterLedgerRows(rows, { search: '', tier: '', status: '延期' }).map((r) => r.projectId)).toEqual(['P1'])
    expect(filterLedgerRows(rows, { search: '', tier: '', status: '' }).map((r) => r.projectId)).toEqual(['P2', 'P1'])
  })
})

describe('ledgerSummaryPmis/TierStatsPmis/StatusCountsPmis', () => {
  // remainingAmount 故意 ≠ expected-received(550000≠600000),证实待回款取 Σ未收 而非 expected-received
  const rows = [
    { tier: '100万以上', expectedPayment: 1000000, actualPayment: 400000, remainingAmount: 550000, paymentStatus: '部分回款', delayed: true },
    { tier: '50万以下', expectedPayment: 200000, actualPayment: 0, remainingAmount: 200000, paymentStatus: '未回款', delayed: false },
  ] as any
  it('summary 待回款取 ΣremainingAmount', () => {
    const s = ledgerSummaryPmis(rows)
    expect(s).toMatchObject({ projectCount: 2, totalExp: 1200000, totalAct: 400000, totalRem: 750000 })
    expect(s.rate).toBeCloseTo(0.3333)
  })
  it('tier 三档 remWan 取 ΣremainingAmount', () => {
    const t = ledgerTierStatsPmis(rows)
    expect(t.map((x) => x.tier)).toEqual(['100万以上', '50-100万', '50万以下'])
    expect(t[0]).toMatchObject({ count: 1, expWan: 100, remWan: 55 })
  })
  it('statusCounts 四计数含 delayed', () => {
    expect(ledgerStatusCountsPmis(rows)).toMatchObject({ fullPaid: 0, partial: 1, unpaid: 1, delayed: 1 })
  })
})
