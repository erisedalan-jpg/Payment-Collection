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
    const fetchMock = vi.fn(async () => ({ ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => reader } }))
    vi.stubGlobal('fetch', fetchMock as any)
    const onDone = vi.fn()
    const s = useReprocess({ onDone })
    await s.start()
    expect(fetchMock).toHaveBeenCalledWith('/api/reprocess')
    expect(s.progress.value).toBe(100)
    expect(s.running.value).toBe(false)
    expect(onDone).toHaveBeenCalled()
  })

  it('忙分支(另一更新在跑):后端回 JSON,显示"已有数据更新正在进行"且不回调 onDone', async () => {
    // 与「下载数据」并发闪退同款:忙时后端回 application/json(非 SSE),旧代码会静默闪退,
    // 现在必须把冲突提示显示出来,且绝不触发 onDone(本次没重算任何数据)。
    const onDone = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ running: true, progress: 30, message: '正在更新数据(预处理)...' }),
    })) as any)
    const s = useReprocess({ onDone })
    await s.start()
    expect(s.message.value).toContain('已有数据更新正在进行')
    expect(s.running.value).toBe(false)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('忙分支(下载/回滚在跑):透传后端提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ running: false, progress: 0, message: '其他数据操作进行中,请稍后再更新' }),
    })) as any)
    const s = useReprocess()
    await s.start()
    expect(s.message.value).toContain('其他数据操作进行中')
    expect(s.running.value).toBe(false)
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
