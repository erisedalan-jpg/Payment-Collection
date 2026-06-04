import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFollowupSync } from './useFollowupSync'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useFollowupSync', () => {
  it('本地 message → local toast，4s 后消失', () => {
    const { toasts, notify } = useFollowupSync()
    notify('跟进记录已保存（仅本地保存）', '')
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].status).toBe('local')
    vi.advanceTimersByTime(4000)
    expect(toasts.value).toHaveLength(0)
  })

  it('云 message → 轮询至 success 后绿并消失', async () => {
    const syncStatusFn = vi.fn().mockResolvedValue({ state: { status: 'success', message: 'ok' } })
    const { toasts, notify } = useFollowupSync({ pollMs: 1000, syncStatusFn })
    notify('跟进记录已保存，正在同步到云文档', 'FU-1')
    expect(toasts.value[0].status).toBe('syncing')
    await vi.advanceTimersByTimeAsync(1000)
    expect(syncStatusFn).toHaveBeenCalledWith('FU-1')
    expect(toasts.value[0].status).toBe('success')
    await vi.advanceTimersByTimeAsync(5000)
    expect(toasts.value).toHaveLength(0)
  })

  it('云 message → 轮询 failed 后红', async () => {
    const syncStatusFn = vi.fn().mockResolvedValue({ state: { status: 'failed', message: 'x' } })
    const { toasts, notify } = useFollowupSync({ pollMs: 1000, syncStatusFn })
    notify('正在同步到云文档', 'FU-2')
    await vi.advanceTimersByTimeAsync(1000)
    expect(toasts.value[0].status).toBe('failed')
  })
})
