import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDataStore } from './data'

const SAMPLE = {
  meta: { lastUpdate: '2026-06-03 10:00', totalProjects: 2, totalPaymentNodes: 3 },
  displayColumns: {}, followupRecords: {},
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

describe('data store', () => {
  it('loads analysis data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => SAMPLE }))
    const store = useDataStore()
    await store.load()
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.data?.meta.totalProjects).toBe(2)
  })

  it('records error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => null }))
    const store = useDataStore()
    await store.load()
    expect(store.data).toBeNull()
    expect(store.error).toContain('404')
  })

  it('records error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
    const store = useDataStore()
    await store.load()
    expect(store.data).toBeNull()
    expect(store.error).toContain('Network down')
  })
})

describe('useDataStore.clearBusinessData', () => {
  it('清空 projects 列表，保留 meta', () => {
    const s = useDataStore()
    s.data = {
      meta: { lastUpdate: 'x', totalProjects: 1, totalPaymentNodes: 1 },
      projects: [{ projectId: 'P1' }],
      followupRecords: {},
    } as any
    s.clearBusinessData()
    expect((s.data!.projects as any[]).length).toBe(0)
    expect(s.data!.meta.lastUpdate).toBe('x')
  })
  it('data 为空时安全', () => {
    const s = useDataStore()
    expect(() => s.clearBusinessData()).not.toThrow()
  })
})

describe('useDataStore.reload', () => {
  it('强制重拉并更新 data', async () => {
    const s = useDataStore()
    const fresh = { meta: { lastUpdate: 'new' }, projects: [] }
    const spy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => fresh } as any)
    await s.reload()
    expect((s.data as any).meta.lastUpdate).toBe('new')
    spy.mockRestore()
  })
})

describe('useDataStore.reset', () => {
  it('重置 data/error/loading 到初始态(跨账号防泄漏)', () => {
    const s = useDataStore()
    s.data = { meta: { lastUpdate: 'x' }, projects: [{ projectId: 'P1' }] } as any
    s.error = '出错了'
    s.reset()
    expect(s.data).toBeNull()
    expect(s.error).toBeNull()
    expect(s.loading).toBe(false)
  })
})

describe('useDataStore load 防缓存', () => {
  it('load() 拉取 URL 带防缓存参数 ?t=', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock as any)
    const store = useDataStore()
    await store.load()
    const url = (fetchMock.mock.lastCall as unknown as string[])[0]
    expect(url.startsWith('/data/analysis_data.json?t=')).toBe(true)
  })
})
