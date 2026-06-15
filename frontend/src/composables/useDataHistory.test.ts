import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDataHistory } from './useDataHistory'

beforeEach(() => { vi.restoreAllMocks() })

describe('useDataHistory', () => {
  it('load 拉取版本与 preRollback', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ versions: [{ id: '20260615-101010', projectCount: 5 }], preRollback: null }),
    }) as any
    const h = useDataHistory()
    await h.load()
    expect(h.versions.value.length).toBe(1)
    expect(h.versions.value[0].projectCount).toBe(5)
    expect(h.preRollback.value).toBeNull()
  })

  it('rollback 调 POST 并触发 onChange + 重载', async () => {
    const calls: string[] = []
    global.fetch = vi.fn().mockImplementation((url: string) => {
      calls.push(url)
      const body = url.includes('rollback') ? { success: true } : { versions: [], preRollback: null }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
    }) as any
    const onChange = vi.fn()
    const h = useDataHistory({ onChange })
    await h.rollback('20260615-101010')
    expect(calls.some((u) => u.includes('/api/data-history/rollback'))).toBe(true)
    expect(onChange).toHaveBeenCalled()
  })
})
