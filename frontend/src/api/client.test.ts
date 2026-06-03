import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiRequestError } from './client'

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok, status, json: async () => body,
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('returns data on success', async () => {
    mockFetchOnce({ success: true, records: [1, 2] })
    const data = await api.get<{ success: boolean; records: number[] }>('/api/x')
    expect(data.records).toEqual([1, 2])
  })

  it('throws ApiRequestError with code on {success:false}', async () => {
    mockFetchOnce({ success: false, code: 'validation_error', message: '缺少必填字段' })
    await expect(api.get('/api/x')).rejects.toMatchObject({
      name: 'ApiRequestError', code: 'validation_error', message: '缺少必填字段',
    })
  })

  it('throws on non-ok HTTP without success flag', async () => {
    mockFetchOnce(null, false, 500)
    await expect(api.get('/api/x')).rejects.toBeInstanceOf(ApiRequestError)
  })

  it('post sends JSON body', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', f)
    await api.post('/api/y', { a: 1 })
    expect(f).toHaveBeenCalledWith('/api/y', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    }))
  })
})
