import { describe, it, expect } from 'vitest'
import { dashboardSignals } from './dashboardSignals'
import type { RawNode } from '@/types/analysis'

const TODAY = '2026-06-09'

function n(p: Record<string, any>): RawNode {
  return { projectId: 'P', tier: '100万以上', isPaymentRelated: true, ...p } as any
}

describe('dashboardSignals', () => {
  it('空数组 → 全 0', () => {
    const s = dashboardSignals([], TODAY)
    expect(s).toEqual({ monthDue: 0, due7Count: 0, delayed: 0, toFollowupCount: 0 })
  })

  it('综合用例：本月需回款/临期/延期/待跟进', () => {
    const nodes = [
      n({ planMonth: '2026-06', planDate: '2026-06-20', nodeStatus: '正常实施中', expectedPayment: 100000, actualPayment: 30000, followupRecords: [] }),
      n({ planMonth: '2026-06', planDate: '2026-06-12', nodeStatus: '正常实施中', expectedPayment: 50000, actualPayment: 0, followupRecords: [{ '跟进状态': '跟进中' }] }),
      n({ planMonth: '2026-05', planDate: '2026-05-01', nodeStatus: '延期', expectedPayment: 80000, actualPayment: 0, followupRecords: [] }),
      n({ planMonth: '2026-06', planDate: '2026-06-15', nodeStatus: '已全额回款', expectedPayment: 40000, actualPayment: 40000, followupRecords: [] }),
    ]
    const s = dashboardSignals(nodes, TODAY)
    expect(s.monthDue).toBe(120000)
    expect(s.due7Count).toBe(1)
    expect(s.delayed).toBe(80000)
    expect(s.toFollowupCount).toBe(1)
  })

  it('7天边界：恰好第 7 天计入，第 8 天不计入', () => {
    const nodes = [
      n({ planDate: '2026-06-16', expectedPayment: 10000, actualPayment: 0, followupRecords: [] }),
      n({ planDate: '2026-06-17', expectedPayment: 10000, actualPayment: 0, followupRecords: [] }),
    ]
    const s = dashboardSignals(nodes, TODAY)
    expect(s.due7Count).toBe(1)
  })

  it('今天当天的临期节点计入 due7', () => {
    const s = dashboardSignals([n({ planDate: '2026-06-09', expectedPayment: 10000, actualPayment: 0, followupRecords: [] })], TODAY)
    expect(s.due7Count).toBe(1)
  })
})
