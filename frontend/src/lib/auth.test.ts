import { describe, it, expect } from 'vitest'
import { authenticate } from './auth'

describe('authenticate(SP-1 桩)', () => {
  it('恒返回失败 + 提示文案(占位,SP-2 替换)', async () => {
    const r = await authenticate('admin', 'wxtnb')
    expect(r.ok).toBe(false)
    expect(typeof r.message).toBe('string')
    expect(r.message).toBeTruthy()
  })
})
