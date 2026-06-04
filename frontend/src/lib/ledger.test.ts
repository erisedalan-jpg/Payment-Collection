import { describe, it, expect } from 'vitest'
import {
  naguanFilter,
  filterLedgerProjects,
  ledgerSummary,
  ledgerTierStats,
  ledgerStatusCounts,
} from './ledger'

describe('naguanFilter', () => {
  const nodes = [{ projectId: 'P1' }, { projectId: 'P2' }] as any[]
  it('关闭时返回全部', () => {
    expect(naguanFilter(nodes, false, { P1: true })).toHaveLength(2)
  })
  it('开启时排除 naguanExclude 命中的项目', () => {
    expect(naguanFilter(nodes, true, { P1: true }).map((n: any) => n.projectId)).toEqual(['P2'])
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
