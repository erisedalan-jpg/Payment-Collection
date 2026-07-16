import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/portalApi', () => ({
  getPortalConfig: vi.fn(async () => ({ version: 1, groups: ['G'], items: [] })),
  savePortalConfig: vi.fn(async (c: any) => c),
}))

import { usePortalStore } from './portal'
import { getPortalConfig, savePortalConfig } from '@/lib/portalApi'

describe('portal store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load 拉取并置 loaded', async () => {
    const s = usePortalStore()
    expect(s.loaded).toBe(false)
    await s.load()
    expect(getPortalConfig).toHaveBeenCalled()
    expect(s.config.groups).toEqual(['G'])
    expect(s.loaded).toBe(true)
  })

  it('save 写回并刷新 config', async () => {
    const s = usePortalStore()
    const next = { version: 1, groups: ['X'], items: [] }
    await s.save(next)
    expect(savePortalConfig).toHaveBeenCalledWith(next)
    expect(s.config.groups).toEqual(['X'])
  })

  it('reset 归零', async () => {
    const s = usePortalStore()
    await s.load()
    s.reset()
    expect(s.config).toEqual({ version: 1, groups: [], items: [] })
    expect(s.loaded).toBe(false)
  })
})
