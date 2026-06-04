import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadFuData,
  followupDeptStats,
  followupTotals,
  followupQuarters,
  cycleLabel,
} from './followup'

const NOW = new Date('2026-06-04T00:00:00')

const NODES: any[] = [
  { orgL4: 'A', projectId: 'P1', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-08', actualPaymentRatio: 0.5, expectedPayment: 100000, actualPayment: 50000 },
  { orgL4: 'A', projectId: 'P2', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-20', actualPaymentRatio: 0, expectedPayment: 100000, actualPayment: 0 },
  { orgL4: 'A', projectId: 'P3', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-05-01', actualPaymentRatio: 0, expectedPayment: 100000, actualPayment: 0 },
  { orgL4: 'B', projectId: 'P4', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-15', actualPaymentRatio: 0, expectedPayment: 100000, actualPayment: 0 },
]

describe('followupDeptStats', () => {
  it('按部门统计各档位 + 排序(delay 优先)', () => {
    const s = followupDeptStats(NODES, {}, NOW)
    expect(s.map((d) => d.name)).toEqual(['A', 'B'])
    const a = s.find((d) => d.name === 'A')!
    expect(a.total).toBe(3)
    expect(a.d7).toBe(1)
    expect(a.d30).toBe(1)
    expect(a.delay).toBe(1)
    const b = s.find((d) => d.name === 'B')!
    expect(b.d15).toBe(1)
  })
  it('fuData 标记驱动 flw 计数', () => {
    const s = followupDeptStats(NODES, { P3: { flw: true } }, NOW)
    const a = s.find((d) => d.name === 'A')!
    expect(a.delayFlw).toBe(1)
    expect(a.flw).toBe(1)
  })
})

describe('followupTotals', () => {
  it('汇总各档位与待跟进', () => {
    const t = followupTotals(followupDeptStats(NODES, {}, NOW))
    expect(t.urgent).toBe(1)
    expect(t.d15).toBe(1)
    expect(t.d30).toBe(1)
    expect(t.delayed).toBe(1)
    expect(t.totalFlw).toBe(0)
    expect(t.totalNotFlw).toBe(4)
  })
})

describe('followupQuarters', () => {
  it('按 planDate 月份分季度，项目去重', () => {
    const q = followupQuarters(NODES)
    expect(q).toHaveLength(4)
    expect(q[1].quarter).toBe(2)
    expect(q[1].nodeCount).toBe(4)
    expect(q[1].projectCount).toBe(4)
    expect(q[1].expected).toBe(400000)
    expect(q[1].actual).toBe(50000)
    expect(q[0].nodeCount).toBe(0)
  })
})

describe('cycleLabel', () => {
  it('主分支映射', () => {
    expect(cycleLabel('all', 2026)).toBe('全部')
    expect(cycleLabel('2026', 2026)).toBe('本年度')
    expect(cycleLabel('2027', 2026)).toBe('下一年度')
    expect(cycleLabel('upto2026', 2026)).toBe('至本年度')
    expect(cycleLabel('2026-Q1', 2026)).toBe('本年度')
    expect(cycleLabel('upto2026-Q1', 2026)).toBe('至本年度') // upto+季度取父年度
  })
})

describe('loadFuData', () => {
  beforeEach(() => localStorage.clear())
  it('读取 localStorage fu_data，异常返回空', () => {
    expect(loadFuData()).toEqual({})
    localStorage.setItem('fu_data', JSON.stringify({ P1: { flw: true } }))
    expect(loadFuData().P1.flw).toBe(true)
  })
})
