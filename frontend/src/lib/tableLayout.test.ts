import { describe, it, expect } from 'vitest'
import { DETAIL_TABLE_MAX_H } from './tableLayout'

describe('DETAIL_TABLE_MAX_H', () => {
  // 【为什么单独钉这个数】三个 tab 的测试断言的是 `toBe(DETAIL_TABLE_MAX_H)`,
  // 常量和断言会一起移动 —— 只有这条把字面量 640 钉死,改常量才有测试变红。
  it('值为 640(≈15 行:表头 41 + 行高 41,(640-41)/41≈14.6),且不会大到在 768 高的视口撑出屏幕', () => {
    expect(DETAIL_TABLE_MAX_H).toBe(640)
    expect(DETAIL_TABLE_MAX_H).toBeLessThan(768 - 24)
  })
})
