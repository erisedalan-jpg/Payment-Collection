import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOpportunitiesStore } from './opportunities'
import * as apiMod from '@/lib/opportunitiesApi'

beforeEach(() => setActivePinia(createPinia()))

describe('opportunities store', () => {
  it('load 拉取 rows', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [{ id: 'opp-1', l4: '小金融服务组' }] } as any)
    const s = useOpportunitiesStore(); await s.load()
    expect(s.rows).toHaveLength(1); expect(s.loaded).toBe(true)
  })
  it('create 追加返回行', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [] } as any)
    vi.spyOn(apiMod.opportunitiesApi, 'create').mockResolvedValue({ row: { id: 'opp-9' } } as any)
    const s = useOpportunitiesStore(); await s.load(); await s.create()
    expect(s.rows.map((r) => r.id)).toContain('opp-9')
  })
  it('update 用返回行替换本地', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [{ id: 'opp-1', customer: '' }] } as any)
    vi.spyOn(apiMod.opportunitiesApi, 'update').mockResolvedValue({ row: { id: 'opp-1', customer: '甲', lastUpdate: 't' } } as any)
    const s = useOpportunitiesStore(); await s.load(); await s.update('opp-1', { customer: '甲' })
    expect(s.rows[0].customer).toBe('甲')
  })
  it('remove 用返回全量替换', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [{ id: 'opp-1' }, { id: 'opp-2' }] } as any)
    vi.spyOn(apiMod.opportunitiesApi, 'remove').mockResolvedValue({ rows: [{ id: 'opp-2' }] } as any)
    const s = useOpportunitiesStore(); await s.load(); await s.remove(['opp-1'])
    expect(s.rows.map((r) => r.id)).toEqual(['opp-2'])
  })
  it('reset 清空', async () => {
    vi.spyOn(apiMod.opportunitiesApi, 'list').mockResolvedValue({ rows: [{ id: 'opp-1' }] } as any)
    const s = useOpportunitiesStore(); await s.load(); s.reset()
    expect(s.rows).toEqual([]); expect(s.loaded).toBe(false)
  })
})
