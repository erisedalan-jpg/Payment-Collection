import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePmisSync } from './usePmisSync'

describe('usePmisSync', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('loads links via GET /api/pmis/links', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ links: { 'a.xlsx': 'u' } }) })) as any)
    const s = usePmisSync()
    await s.loadLinks()
    expect(s.links.value).toEqual({ 'a.xlsx': 'u' })
  })

  it('saves links via POST', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock as any)
    const s = usePmisSync()
    s.links.value = { 'a.xlsx': 'u' }
    await s.saveLinks()
    expect(fetchMock).toHaveBeenCalledWith('/api/pmis/links', expect.objectContaining({ method: 'POST' }))
  })
})
