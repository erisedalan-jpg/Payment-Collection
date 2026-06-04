import { describe, it, expect, vi } from 'vitest'
import { useCloudSync } from './useCloudSync'

class FakeES {
  url: string
  onmessage: ((e: any) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  static last: FakeES | null = null
  constructor(url: string) {
    this.url = url
    FakeES.last = this
  }
  close() {
    this.closed = true
  }
}

describe('useCloudSync', () => {
  it('url 为空 → 错误态，不创建 ES', () => {
    FakeES.last = null
    const s = useCloudSync({ eventSourceCtor: FakeES as any })
    s.start('  ')
    expect(s.phase.value).toBe('error')
    expect(FakeES.last).toBeNull()
  })
  it('正常流：onmessage 更新进度，100→完成+onDone', () => {
    const onDone = vi.fn()
    const s = useCloudSync({ eventSourceCtor: FakeES as any, onDone })
    s.start('http://doc')
    expect(s.phase.value).toBe('syncing')
    expect(FakeES.last!.url).toContain('/api/sync?url=')
    FakeES.last!.onmessage!({ data: JSON.stringify({ progress: 50, message: '抓取中' }) })
    expect(s.progress.value).toBe(50)
    FakeES.last!.onmessage!({ data: JSON.stringify({ progress: 100, message: '完成' }) })
    expect(s.phase.value).toBe('done')
    expect(FakeES.last!.closed).toBe(true)
    expect(onDone).toHaveBeenCalled()
  })
  it('onerror → 错误态', () => {
    const s = useCloudSync({ eventSourceCtor: FakeES as any })
    s.start('http://doc')
    FakeES.last!.onerror!()
    expect(s.phase.value).toBe('error')
  })
  it('stop → 停止态 + 调 stop-sync', () => {
    const fetchFn = vi.fn().mockResolvedValue({})
    const s = useCloudSync({ eventSourceCtor: FakeES as any, fetchFn: fetchFn as any })
    s.start('http://doc')
    s.stop()
    expect(s.phase.value).toBe('stopped')
    expect(fetchFn).toHaveBeenCalledWith('/api/stop-sync')
  })
})
