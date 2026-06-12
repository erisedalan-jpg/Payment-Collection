import { describe, it, expect } from 'vitest'
import { DEFAULT_OPEN, hasChildren, visibleRows, isRateRow } from './profitTree'
import type { ProfitRow } from '@/types/analysis'

const R = (code: string, name: string, level: number): ProfitRow => ({ code, name, level } as ProfitRow)
const ROWS = [
  R('1', '项目收入', 1),
  R('2', '项目成本', 1),
  R('2.1', '产品、商品成本', 2),
  R('2.1.1', '自有产品成本', 3),
  R('2.2', '外包服务成本', 2),
  R('2.2.2', '交付外包服务成本', 3),
  R('2.3', '人工成本', 2),
  R('2.3.2', '交付部门人工成本', 3),
  R('4', '项目毛利率', 1),
]

describe('profitTree', () => {
  it('hasChildren: 有直接/间接子码', () => {
    expect(hasChildren(ROWS, ROWS[1])).toBe(true)    // 2 → 2.1...
    expect(hasChildren(ROWS, ROWS[2])).toBe(true)    // 2.1 → 2.1.1
    expect(hasChildren(ROWS, ROWS[0])).toBe(false)   // 1
  })

  it('visibleRows: 一二级恒显,三级仅父码展开时显示;默认展开 2.2/2.3', () => {
    const v = visibleRows(ROWS, new Set(DEFAULT_OPEN)).map((r) => r.code)
    expect(v).toContain('2.2.2')
    expect(v).toContain('2.3.2')
    expect(v).not.toContain('2.1.1')   // 2.1 未展开
    expect(v).toContain('2.1')
    expect(v).toContain('4')
  })

  it('visibleRows: 展开 2.1 后 2.1.1 出现', () => {
    const v = visibleRows(ROWS, new Set([...DEFAULT_OPEN, '2.1'])).map((r) => r.code)
    expect(v).toContain('2.1.1')
  })

  it('isRateRow: 名称含率', () => {
    expect(isRateRow(R('4', '项目毛利率', 1))).toBe(true)
    expect(isRateRow(R('1', '项目收入', 1))).toBe(false)
  })
})
