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

describe('useDataStore 协商缓存', () => {
  // 旧实现拼 '?t=' + Date.now():每次请求都是全新 URL,ETag/Last-Modified 永远无从命中,
  // 17MB 快照每次全量重传。现在改为原始 URL + cache:'no-cache'(强制条件请求、但不禁用缓存),
  // 未变则 304 复用本地副本,变了才传全量 —— 「更新数据后立刻拿到新数据」的诉求仍然成立。
  function stubFetch() {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock as any)
    return fetchMock
  }
  function lastCall(fetchMock: ReturnType<typeof stubFetch>) {
    return fetchMock.mock.lastCall as unknown as [string, RequestInit | undefined]
  }

  it('load() 用原始 URL(不带任何时间戳查询参数)且强制协商', async () => {
    const fetchMock = stubFetch()
    await useDataStore().load()
    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/data/analysis_data.json')
    expect(url).not.toContain('?')   // 钉死:再拼回 ?t= 就红
    expect(init?.cache).toBe('no-cache')
  })

  it('reload() 同样不带时间戳,且用 no-cache 而非 reload(保留 304 收益)', async () => {
    const fetchMock = stubFetch()
    await useDataStore().reload()
    const [url, init] = lastCall(fetchMock)
    expect(url).toBe('/data/analysis_data.json')
    expect(url).not.toContain('?')
    expect(init?.cache).toBe('no-cache')
  })
})
