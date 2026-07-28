import { describe, it, expect } from 'vitest'
import { TRANSFER_LABELS, LINE_SRC_LABELS, transferLabel, lineSrcLabel } from './derived'

describe('derived 标签', () => {
  it('五档标签下标与后端枚举一一对应', () => {
    expect(TRANSFER_LABELS).toHaveLength(5)
    expect(TRANSFER_LABELS[0]).toBe('客户不可归属')
    expect(TRANSFER_LABELS[4]).toBe('可转移非原厂')
  })

  it('校准状态四档', () => {
    expect(LINE_SRC_LABELS).toHaveLength(4)
    expect(LINE_SRC_LABELS[1]).toBe('已校准')
  })

  it('越界下标返回空串而不是 undefined', () => {
    expect(transferLabel(99)).toBe('')
    expect(lineSrcLabel(-1)).toBe('')
  })
})
