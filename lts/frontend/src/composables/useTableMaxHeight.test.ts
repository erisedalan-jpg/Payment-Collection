import { describe, it, expect } from 'vitest'
import { computeMaxHeight } from './useTableMaxHeight'

describe('computeMaxHeight', () => {
  it('可用高度 = 视口高 − 表格顶部 − 底部留白', () => {
    expect(computeMaxHeight(200, 900, 24, 200)).toBe(676) // 900-200-24
  })
  it('不低于最小高度(内容被挤到很矮时兜底)', () => {
    expect(computeMaxHeight(800, 900, 24, 200)).toBe(200) // 900-800-24=76 < 200
  })
  it('表格贴近视口顶部时给出接近满屏的高度', () => {
    expect(computeMaxHeight(0, 768, 24, 200)).toBe(744)
  })
})
