import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDataStore } from './data'

const SAMPLE = {
  meta: { lastUpdate: '2026-06-03 10:00', totalProjects: 2, totalPaymentNodes: 3 },
  dashboard: { totalProjectCount: 2, totalPaymentNodes: 3, totalPaidNodes: 1 },
  summary: {}, rawNodes: [{ projectId: 'P1' }, { projectId: 'P2' }],
  projectOverview: { projects: [], columns: [] },
  naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
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
    expect(store.data?.rawNodes.length).toBe(2)
  })

  it('records error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => null }))
    const store = useDataStore()
    await store.load()
    expect(store.data).toBeNull()
    expect(store.error).toContain('404')
  })
})
