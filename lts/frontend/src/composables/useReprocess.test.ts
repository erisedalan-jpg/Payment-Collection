import { describe, it, expect, vi, afterEach } from 'vitest'
import { useReprocess } from './useReprocess'

afterEach(() => vi.unstubAllGlobals())

describe('useReprocess', () => {
  it('start() 命中 /api/reprocess 并在完成时回调 onDone', async () => {
    const enc = new TextEncoder()
    let n = 0
    const reader = { read: vi.fn(async () => {
      n++
      if (n === 1) return { done: false, value: enc.encode('data: {"progress":100,"message":"数据更新完成","running":false}\n\n') }
      return { done: true, value: undefined }
    }) }
    const fetchMock = vi.fn(async () => ({ ok: true, body: { getReader: () => reader } }))
    vi.stubGlobal('fetch', fetchMock as any)
    const onDone = vi.fn()
    const s = useReprocess({ onDone })
    await s.start()
    expect(fetchMock).toHaveBeenCalledWith('/api/reprocess')
    expect(s.progress.value).toBe(100)
    expect(s.running.value).toBe(false)
    expect(onDone).toHaveBeenCalled()
  })

  it('start() 非 ok 响应时设置 message 并重置 running', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })) as any)
    const s = useReprocess()
    await s.start()
    expect(s.message.value).toContain('503')
    expect(s.running.value).toBe(false)
  })

  it('start() 无响应体时重置 running', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: null })) as any)
    const s = useReprocess()
    await s.start()
    expect(s.running.value).toBe(false)
  })
})
