import { describe, it, expect, vi, afterEach } from 'vitest'
import { pingAgent, fetchPmisCookie } from './cookieAgent'

afterEach(() => { vi.restoreAllMocks() })

describe('cookieAgent', () => {
  it('pingAgent 连通返回 true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await pingAgent()).toBe(true)
  })

  it('pingAgent 连不上返回 false（不抛）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('conn refused')))
    expect(await pingAgent()).toBe(false)
  })

  it('fetchPmisCookie 透传代理 JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true, cookie: 'SESSION=z', names: ['SESSION'], hasSession: true, error: '' }),
    }))
    const r = await fetchPmisCookie()
    expect(r.ok).toBe(true)
    expect(r.hasSession).toBe(true)
    expect(r.cookie).toBe('SESSION=z')
  })

  it('fetchPmisCookie 代理未运行返回中文错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('failed')))
    const r = await fetchPmisCookie()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('本机代理')
  })
})
