import { describe, it, expect } from 'vitest'
import { PLAN_BOARDS, boardStats, planSummaryTotals, planStatusCounts } from './planBoards'

describe('PLAN_BOARDS', () => {
  it('6 看板，状态顺序忠实', () => {
    expect(PLAN_BOARDS.map((b) => b.status)).toEqual([
      '加资源可提前',
      '达到回款条件',
      '已提前回款',
      '已全额回款',
      '延期',
      '正常实施中',
    ])
  })
})

describe('boardStats', () => {
  it('计划/已回款/待回款/完成率', () => {
    const s = boardStats([
      { expectedPayment: 200000, actualPayment: 100000 },
      { expectedPayment: 0, actualPayment: 0 },
    ] as any)
    expect(s.count).toBe(2)
    expect(s.totalExp).toBe(200000)
    expect(s.totalAct).toBe(100000)
    expect(s.remaining).toBe(100000)
    expect(s.rate).toBeCloseTo(0.5)
  })
  it('计划为0时完成率0', () => {
    expect(boardStats([{ expectedPayment: 0, actualPayment: 0 }] as any).rate).toBe(0)
  })
})

describe('planSummaryTotals', () => {
  it('跨看板求和', () => {
    const t = planSummaryTotals([
      [{ expectedPayment: 100, actualPayment: 50 }],
      [{ expectedPayment: 100, actualPayment: 0 }],
    ] as any)
    expect(t.totalExp).toBe(200)
    expect(t.totalAct).toBe(50)
    expect(t.totalRem).toBe(150)
    expect(t.rate).toBeCloseTo(0.25)
  })
})

describe('planStatusCounts', () => {
  it('按 nodeStatus 计数', () => {
    const c = planStatusCounts([
      { nodeStatus: '延期' },
      { nodeStatus: '延期' },
      { nodeStatus: '加资源可提前' },
    ] as any)
    expect(c.delayed).toBe(2)
    expect(c.canAdvance).toBe(1)
    expect(c.onTime).toBe(0)
  })
})
