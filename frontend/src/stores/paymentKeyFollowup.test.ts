import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/paymentKeyFollowupApi', () => ({
  paymentKeyFollowupApi: {
    get: vi.fn().mockResolvedValue({
      scope: { combinator: 'AND', groups: [] }, current: { P1: { followAction: 'x' } }, archives: [],
    }),
    saveScope: vi.fn().mockResolvedValue({ scope: { combinator: 'OR', groups: [] } }),
    update: vi.fn().mockResolvedValue({ record: { followAction: 'y', followActionEditBy: 'admin' } }),
    archive: vi.fn().mockResolvedValue({ archives: [{ archiveTime: 't', rows: [] }] }),
    deleteArchive: vi.fn().mockResolvedValue({ archives: [] }),
  },
}))

import { usePaymentKeyFollowupStore } from './paymentKeyFollowup'

describe('usePaymentKeyFollowupStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load 填充 scope/current/archives', async () => {
    const s = usePaymentKeyFollowupStore()
    await s.load()
    expect(s.loaded).toBe(true)
    expect(s.scope.combinator).toBe('AND')
    expect(s.current.P1.followAction).toBe('x')
    expect(s.archives).toEqual([])
  })

  it('saveScope 更新 scope', async () => {
    const s = usePaymentKeyFollowupStore()
    await s.saveScope({ combinator: 'OR', groups: [] })
    expect(s.scope.combinator).toBe('OR')
  })

  it('update 合并单项目记录', async () => {
    const s = usePaymentKeyFollowupStore()
    await s.update('P1', 'followAction', 'y')
    expect(s.current.P1.followAction).toBe('y')
    expect(s.current.P1.followActionEditBy).toBe('admin')
  })

  it('archive 后 current 保持不变(不清空)', async () => {
    const s = usePaymentKeyFollowupStore()
    await s.load()
    expect(s.current.P1.followAction).toBe('x')
    await s.archive([])
    expect(s.archives).toHaveLength(1)
    expect(s.current.P1.followAction).toBe('x')
    expect(s.current).not.toEqual({})
  })

  it('deleteArchive 更新 archives', async () => {
    const s = usePaymentKeyFollowupStore()
    await s.load()
    await s.deleteArchive(0)
    expect(s.archives).toEqual([])
  })

  it('reset 复位', async () => {
    const s = usePaymentKeyFollowupStore()
    await s.load()
    s.reset()
    expect(s.loaded).toBe(false)
    expect(s.current).toEqual({})
    expect(s.archives).toEqual([])
  })
})
