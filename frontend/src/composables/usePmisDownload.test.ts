import { describe, it, expect, vi, afterEach } from 'vitest'
import { usePmisDownload } from './usePmisDownload'

afterEach(() => vi.unstubAllGlobals())

/** 造一个 SSE 响应(带 text/event-stream 头 + 逐帧 reader)。 */
function sseRes(frames: string[]) {
  const enc = new TextEncoder()
  let n = 0
  const reader = {
    read: vi.fn(async () => {
      if (n < frames.length) return { done: false, value: enc.encode(frames[n++]) }
      return { done: true, value: undefined }
    }),
  }
  return { ok: true, headers: { get: () => 'text/event-stream' }, body: { getReader: () => reader } }
}

describe('usePmisDownload', () => {
  it('SSE 正常流:progress/running 更新并回调 onDone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseRes([
      'data: {"progress":100,"message":"下载完成，请点更新数据生效","running":false}\n\n',
    ])) as any)
    const onDone = vi.fn()
    const s = usePmisDownload({ onDone })
    await s.start()
    expect(s.progress.value).toBe(100)
    expect(s.message.value).toContain('下载完成')
    expect(s.running.value).toBe(false)
    expect(onDone).toHaveBeenCalled()
  })

  it('忙分支(另一下载在跑):后端回 JSON,显示"已有下载正在进行"且不回调 onDone', async () => {
    // 这是本次修复的核心:忙时后端回 application/json(非 SSE)。旧代码会静默闪退,
    // 现在必须把冲突提示显示出来,且绝不触发 onDone(本次没下载任何数据)。
    const onDone = vi.fn()
    // ★ mock 用 ok:false / status:400 —— 生产真实形态(server.py 的 _send_sse_busy)。
    // 忙响应状态码已从 200 改为 400;若前端仍先判 res.ok 再分流 content-type,
    // 这里就会显示成「下载失败 (400)」。本用例钉死这个顺序。
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: false, code: 'busy', message: '已有下载正在进行,请等其完成后再试',
        running: true, progress: 45, currentMessage: '下载 项目风险数据 表...',
      }),
    })) as any)
    const s = usePmisDownload({ onDone })
    await s.start()
    expect(s.message.value).toContain('已有下载正在进行')
    expect(s.message.value).not.toContain('下载失败')
    expect(s.message.value).toContain('项目风险数据')
    expect(s.running.value).toBe(false)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('忙分支(其他数据操作在跑):透传后端提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({
        success: false, code: 'busy', message: '其他数据操作进行中,请稍后再下载',
        running: false, progress: 0, currentMessage: '',
      }),
    })) as any)
    const s = usePmisDownload()
    await s.start()
    expect(s.message.value).toContain('其他数据操作进行中')
    expect(s.message.value).not.toContain('下载失败')
    expect(s.running.value).toBe(false)
  })

  it('忙分支 JSON 解析失败:用兜底文案而非空消息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => { throw new Error('bad json') },
    })) as any)
    const s = usePmisDownload()
    await s.start()
    expect(s.message.value).toContain('正在进行')
    expect(s.running.value).toBe(false)
  })

  it('非 ok 响应:设置 message 并重置 running', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })) as any)
    const s = usePmisDownload()
    await s.start()
    expect(s.message.value).toContain('503')
    expect(s.running.value).toBe(false)
  })
})
