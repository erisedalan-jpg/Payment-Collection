import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/followupColumns', () => ({
  followupColumnsApi: {
    getAll: vi.fn().mockResolvedValue({
      temp: [], risk: [{ key: 'cf-a', label: '责任人', type: 'text', clearOnArchive: false }],
      payment_key: [], opportunity: [],
    }),
    add: vi.fn().mockResolvedValue({ key: 'cf-b', label: '截止', type: 'date', clearOnArchive: true }),
    remove: vi.fn().mockResolvedValue({ affectedRows: 3 }),
  },
}))

import { useFollowupColumnsStore } from '@/stores/followupColumns'

describe('followupColumns store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load 后 columnsFor 返回该表列', async () => {
    const s = useFollowupColumnsStore()
    await s.load()
    expect(s.loaded).toBe(true)
    expect(s.columnsFor('risk').map((c) => c.label)).toEqual(['责任人'])
    expect(s.columnsFor('temp')).toEqual([])
  })

  it('add 后本地追加', async () => {
    const s = useFollowupColumnsStore()
    await s.load()
    await s.add('risk', '截止', 'date', true)
    expect(s.columnsFor('risk').map((c) => c.key)).toContain('cf-b')
  })

  it('remove 后本地移除并返回影响行数', async () => {
    const s = useFollowupColumnsStore()
    await s.load()
    const r = await s.remove('risk', 'cf-a')
    expect(r.affectedRows).toBe(3)
    expect(s.columnsFor('risk')).toEqual([])
  })
})
