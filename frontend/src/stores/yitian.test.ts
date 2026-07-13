import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import { useYitianStore } from './yitian'
import { useYitianViewStore } from './yitianView'

const FAKE = { meta: { rows: 1 }, roster: [], days: [], dims: {}, entries: [], issues: [] }

describe('useYitianStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getSpy.mockReset()
    getSpy.mockResolvedValue(FAKE)
  })

  it('惰性加载:load 后有数据', async () => {
    const s = useYitianStore()
    expect(s.data).toBeNull()
    await s.load()
    expect(s.data).toEqual(FAKE)
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('已加载则不重拉', async () => {
    const s = useYitianStore()
    await s.load()
    await s.load()
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('force 强制重拉', async () => {
    const s = useYitianStore()
    await s.load()
    await s.load(true)
    expect(getSpy).toHaveBeenCalledTimes(2)
  })

  it('失败落 error 不抛', async () => {
    getSpy.mockRejectedValue(new Error('403'))
    const s = useYitianStore()
    await s.load()
    expect(s.data).toBeNull()
    expect(s.error).toBe('403')
  })

  it('reset 清空', async () => {
    const s = useYitianStore()
    await s.load()
    s.reset()
    expect(s.data).toBeNull()
  })
})

describe('useYitianViewStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('默认周口径为倚天计算周', () => {
    expect(useYitianViewStore().weekMode).toBe('calc')
  })

  it('ensureRange 用数据跨度兜底空区间', () => {
    const v = useYitianViewStore()
    v.ensureRange('2026-06-01', '2026-06-30')
    expect(v.start).toBe('2026-06-01')
    expect(v.end).toBe('2026-06-30')
  })

  it('ensureRange 把越界区间钳回数据跨度', () => {
    const v = useYitianViewStore()
    v.start = '2020-01-01'
    v.end = '2099-01-01'
    v.ensureRange('2026-06-01', '2026-06-30')
    expect(v.start).toBe('2026-06-01')
    expect(v.end).toBe('2026-06-30')
  })

  it('hydrate 后改动会持久化', async () => {
    const v = useYitianViewStore()
    v.hydrate()
    v.weekMode = 'iso'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('anon:yitian_view')).toContain('iso')
  })
})
