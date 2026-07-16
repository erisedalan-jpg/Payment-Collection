import { describe, it, expect } from 'vitest'
import { sumDistinctContractWan } from './followupTotals'

describe('sumDistinctContractWan', () => {
  it('三页形态：每行唯一 projectId + contractWan，正常求和、跳过 null', () => {
    const rows = [
      { projectId: 'A', contractWan: 100 },
      { projectId: 'B', contractWan: 200.5 },
      { projectId: 'C', contractWan: null },
    ]
    expect(sumDistinctContractWan(rows, 'contractWan')).toBeCloseTo(300.5)
  })

  it('risk 形态：同一 projectId 多行，每项目只计一次；valueKey=项目金额', () => {
    const rows = [
      { projectId: 'A', '项目金额': 100 },   // 项目 A 两条风险
      { projectId: 'A', '项目金额': 100 },
      { projectId: 'B', '项目金额': 50 },
    ]
    expect(sumDistinctContractWan(rows, '项目金额')).toBe(150) // 100 + 50，A 不重复计
  })

  it('空集=0', () => {
    expect(sumDistinctContractWan([], 'contractWan')).toBe(0)
  })

  it('无 projectId 的行各自独立计入', () => {
    const rows = [{ contractWan: 10 }, { contractWan: 20 }]
    expect(sumDistinctContractWan(rows, 'contractWan')).toBe(30)
  })
})
