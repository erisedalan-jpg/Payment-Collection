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

  it('streams progress and calls onDone, resets running', async () => {
    const enc = new TextEncoder()
    let read = 0
    const reader = {
      read: vi.fn(async () => {
        read++
        if (read === 1) return { done: false, value: enc.encode('data: {"progress":100,"message":"done","running":false}\n\n') }
        return { done: true, value: undefined }
      }),
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/pmis/download') return { ok: true, body: { getReader: () => reader } }
      return { ok: true, json: async () => ({ ok: true }) }
    }) as any)
    const onDone = vi.fn()
    const s = usePmisSync({ onDone })
    await s.download()
    expect(s.progress.value).toBe(100)
    expect(s.running.value).toBe(false)
    expect(onDone).toHaveBeenCalled()
  })

  it('resets running on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/pmis/download') throw new Error('network error')
      return { ok: true, json: async () => ({ ok: true }) }
    }) as any)
    const s = usePmisSync()
    await expect(s.download()).rejects.toThrow('network error')
    expect(s.running.value).toBe(false)
  })

  it('sets message on non-ok download response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/pmis/download') return { ok: false, status: 503 }
      return { ok: true, json: async () => ({ ok: true }) }
    }) as any)
    const s = usePmisSync()
    await s.download()
    expect(s.message.value).toBe('下载失败 (503)')
    expect(s.running.value).toBe(false)
  })
})
