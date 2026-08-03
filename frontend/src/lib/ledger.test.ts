import { describe, it, expect } from 'vitest'
import {
  ledgerRows, filterLedgerRows, ledgerSummaryPmis, ledgerTierStatsPmis, ledgerStatusCountsPmis,
} from './ledger'
import type { PayNodeRow } from './paymentPmis'

function pn(p: Partial<PayNodeRow>): PayNodeRow {
  return { projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-01', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0,
    projectManager: '张三', status: '待回款', dept: 'A组', orgL3_1: '', projStage: '', tier: '100万以上', progress: '部分回款', ...p }
}

describe('ledgerRows', () => {
  const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }] as any

  // paymentRecords 流水口径: P1 有两笔, 合计 600000
  const paymentRecords = {
    P1: { records: [
      { amount: 400000, date: '2026-02-01' },
      { amount: 200000, date: '2026-03-15' },
    ]},
  } as any

  it('按项目聚合金额(流水口径) + 派生 progress/延期 + join 维度', () => {
    const rows = ledgerRows([
      pn({ expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' }),
      pn({ expectedPayment: 500000, receivedAmount: 0, unpaidAmount: 500000, status: '延期' }),
    ], projects, paymentRecords)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.expectedPayment).toBe(1500000)
    // actualPayment 取流水 Σ = 600000
    expect(r.actualPayment).toBe(600000)
    // remainingAmount 仍取 Σ节点.unpaidAmount
    expect(r.remainingAmount).toBe(900000)
    // 分母改为合同总额 contract=2000000：600000/2000000=0.3
    expect(r.paymentRatio).toBeCloseTo(0.3)
    expect(r.paymentStatus).toBe('部分回款')
    expect(r.delayed).toBe(true)
    expect(r.orgL4).toBe('A组')
    expect(r.tier).toBe('100万以上')
    expect(r.projectAmount).toBe(2000000)
    expect(r.nodes).toHaveLength(2)
  })

  it('区间过滤流水: start/end 限定后只取区间内流水', () => {
    // 只取 2026-02 的流水: 400000
    const rows = ledgerRows([
      pn({ expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000 }),
    ], projects, paymentRecords, '2026-02-01', '2026-02-28')
    expect(rows[0].actualPayment).toBe(400000)
  })

  it('无 paymentRecords 时 actualPayment=0 (全量兼容, 默认后两参=空=全部)', () => {
    // 不传 paymentRecords, actualPayment=0
    const rows = ledgerRows([pn({ expectedPayment: 500000, receivedAmount: 300000, unpaidAmount: 200000 })], projects)
    expect(rows[0].actualPayment).toBe(0)
    expect(rows[0].paymentStatus).toBe('未回款')
  })

  it('全部不变式: 全量(无区间限定) actualPayment=Σ流水, expected/remaining=Σ节点', () => {
    const rows = ledgerRows([
      pn({ expectedPayment: 1000000, receivedAmount: 999, unpaidAmount: 400000 }),
      pn({ expectedPayment: 500000, receivedAmount: 999, unpaidAmount: 500000 }),
    ], projects, paymentRecords, '', '')
    const r = rows[0]
    // 流水 Σ = 400000+200000=600000, 与 receivedAmount 无关
    expect(r.actualPayment).toBe(600000)
    expect(r.expectedPayment).toBe(1500000)
    expect(r.remainingAmount).toBe(900000)
  })

  it('全额→已全额回款 / 零→未回款', () => {
    // 合同 contract=2000000；流水需 ≥contract 才触发已全额回款（ratio≥0.999）
    const fullRec = { P1: { records: [{ amount: 2000000, date: '2026-01-01' }] } } as any
    expect(ledgerRows([pn({ expectedPayment: 2000000, receivedAmount: 2000000, status: '已回款' })], projects, fullRec)[0].paymentStatus).toBe('已全额回款')
    expect(ledgerRows([pn({ expectedPayment: 100, receivedAmount: 0, status: '待回款' })], projects)[0].paymentStatus).toBe('未回款')
  })
  it('不在 projects 的项目跳过', () => {
    expect(ledgerRows([pn({ projectId: 'X' })], projects)).toHaveLength(0)
  })

  // 全站口径:合同≤0 → 比率 null(前端 fmtRatio 显 '-')。返回 0 会被渲染成 "0.0%",
  // 那是「一分没收」的确定结论,而真相是分母缺失、算不出结论。
  it('合同=0 → paymentRatio null + 状态未知(哪怕已有流水入账)', () => {
    const noContract = [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 0 } }] as any
    const rows = ledgerRows([pn({ expectedPayment: 100, receivedAmount: 0, unpaidAmount: 100 })], noContract, paymentRecords)
    expect(rows[0].actualPayment).toBe(600000)  // 确有流水,更不能说成 0%/未回款
    expect(rows[0].paymentRatio).toBeNull()
    expect(rows[0].paymentStatus).toBe('未知')  // 与 /payment/projects 的 deriveProgress 同结论
  })

  it('合同字段缺失 / 合同为负 同样 null + 未知', () => {
    const missing = [{ projectId: 'P1', projectName: '甲', orgL4: 'A组' }] as any
    const rm = ledgerRows([pn({})], missing, paymentRecords)[0]
    expect(rm.paymentRatio).toBeNull()
    expect(rm.paymentStatus).toBe('未知')
    const neg = [{ projectId: 'P1', projectName: '甲', orgL4: 'A组', paymentPmis: { contract: -100 } }] as any
    const rn = ledgerRows([pn({})], neg, paymentRecords)[0]
    expect(rn.paymentRatio).toBeNull()
    expect(rn.paymentStatus).toBe('未知')
  })

  it('合同>0 时比率与三态判定不变(回归安全网:这几条变红说明口径被误改)', () => {
    const rows = ledgerRows([pn({ expectedPayment: 1000000, receivedAmount: 0, unpaidAmount: 400000 })], projects, paymentRecords)
    expect(rows[0].paymentRatio).toBeCloseTo(0.3)
    expect(rows[0].paymentStatus).toBe('部分回款')
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
  // projectAmount = paymentPmis.contract（合同总额），作为 ledgerSummaryPmis rate 分母
  const rows = [
    { tier: '100万以上', expectedPayment: 1000000, actualPayment: 400000, remainingAmount: 550000, paymentStatus: '部分回款', delayed: true, projectAmount: 1500000 },
    { tier: '50万以下', expectedPayment: 200000, actualPayment: 0, remainingAmount: 200000, paymentStatus: '未回款', delayed: false, projectAmount: 300000 },
  ] as any
  it('summary 待回款取 ΣremainingAmount；rate=Σactual/ΣprojectAmount（合同）', () => {
    const s = ledgerSummaryPmis(rows)
    expect(s).toMatchObject({ projectCount: 2, totalExp: 1200000, totalAct: 400000, totalRem: 750000 })
    // 分母改为 ΣprojectAmount=1500000+300000=1800000：400000/1800000≈0.2222
    expect(s.rate).toBeCloseTo(400000 / 1800000)
  })
  it('Σ合同≤0 → rate null(同行级口径,不用 0 冒充)', () => {
    const noCon = [
      { tier: '100万以上', expectedPayment: 100, actualPayment: 50, remainingAmount: 50, paymentStatus: '未知', delayed: false, projectAmount: 0 },
    ] as any
    expect(ledgerSummaryPmis(noCon).rate).toBeNull()
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
