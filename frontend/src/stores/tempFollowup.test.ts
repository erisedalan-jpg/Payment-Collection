import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/tempFollowupApi', () => ({
  tempFollowupApi: {
    get: vi.fn().mockResolvedValue({
      scope: { combinator: 'AND', groups: [] }, current: { P1: { weekProgress: 'x' } }, archives: [],
    }),
    saveScope: vi.fn().mockResolvedValue({ scope: { combinator: 'OR', groups: [] } }),
    update: vi.fn().mockResolvedValue({ record: { weekProgress: 'y', weekProgressEditBy: 'admin' } }),
    archive: vi.fn().mockResolvedValue({ archives: [{ archiveTime: 't', rows: [] }] }),
  },
}))

import { useTempFollowupStore } from './tempFollowup'

describe('useTempFollowupStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load 填充 scope/current/archives', async () => {
    const s = useTempFollowupStore()
    await s.load()
    expect(s.loaded).toBe(true)
    expect(s.current.P1.weekProgress).toBe('x')
  })

  it('saveScope 更新 scope', async () => {
    const s = useTempFollowupStore()
    await s.saveScope({ combinator: 'OR', groups: [] })
    expect(s.scope.combinator).toBe('OR')
  })

  it('update 合并单项目记录', async () => {
    const s = useTempFollowupStore()
    await s.update('P1', 'weekProgress', 'y')
    expect(s.current.P1.weekProgress).toBe('y')
  })

  it('archive 后清空 current', async () => {
    const s = useTempFollowupStore()
    await s.load()
    await s.archive([])
    expect(s.archives).toHaveLength(1)
    expect(s.current).toEqual({})
  })

  it('reset 复位', async () => {
    const s = useTempFollowupStore()
    await s.load()
    s.reset()
    expect(s.loaded).toBe(false)
    expect(s.archives).toEqual([])
  })
})
