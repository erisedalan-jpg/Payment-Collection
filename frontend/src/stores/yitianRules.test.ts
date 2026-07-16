import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const getMock = vi.fn()
const postMock = vi.fn()
vi.mock('@/lib/yitianApi', () => ({
  getYitianRules: (...a: unknown[]) => getMock(...a),
  saveYitianRules: (...a: unknown[]) => postMock(...a),
}))

import { useYitianRulesStore } from './yitianRules'

describe('yitianRules store', () => {
  beforeEach(() => { setActivePinia(createPinia()); getMock.mockReset(); postMock.mockReset() })

  it('load 拉取并缓存', async () => {
    getMock.mockResolvedValue({ version: 1, checkedTypes: ['项目类'], checks: {} })
    const s = useYitianRulesStore()
    await s.load()
    expect(s.config?.checkedTypes).toEqual(['项目类'])
    await s.load()                         // 已 loaded 不再拉
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('save 回写 config 并返回 problemCount', async () => {
    postMock.mockResolvedValue({ rules: { version: 1, checkedTypes: ['售前类'], checks: {} }, problemCount: 3 })
    const s = useYitianRulesStore()
    const r = await s.save({ version: 1, checkedTypes: ['售前类'], checks: {} } as never)
    expect(r.problemCount).toBe(3)
    expect(s.config?.checkedTypes).toEqual(['售前类'])
  })
})
