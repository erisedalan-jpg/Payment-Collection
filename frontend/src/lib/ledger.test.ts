import { describe, it, expect } from 'vitest'
import {
  ledgerRows, filterLedgerRows, ledgerSummaryPmis, ledgerTierStatsPmis, ledgerStatusCountsPmis,
} from './ledger'
import type { PayNodeRow } from './paymentPmis'

function pn(p: Partial<PayNodeRow>): PayNodeRow {
  return { projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-01', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0,
    projectManager: '张三', status: '待回款', dept: 'A组', orgL3: '', projStage: '', tier: '100万以上', progress: '部分回款', ...p }
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
