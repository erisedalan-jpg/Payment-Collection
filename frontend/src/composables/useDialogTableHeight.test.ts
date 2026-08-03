import { describe, it, expect, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useDialogTableHeight } from './useDialogTableHeight'
import { dialogTableMaxHeight } from '@/lib/tableLayout'

const ORIGINAL = window.innerHeight
function setViewport(h: number) {
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}
afterEach(() => setViewport(ORIGINAL))

describe('useDialogTableHeight', () => {
  it('初值取当前视口', () => {
    setViewport(900)
    expect(useDialogTableHeight(ref(false)).value).toBe(dialogTableMaxHeight(900))
  })

  it('弹窗打开时按当时的视口重算（组件常驻，setup 不会重跑）', async () => {
    setViewport(900)
    const open = ref(false)
    const h = useDialogTableHeight(open)
    const before = h.value

    setViewport(640)          // 用户把窗口拉小 / 切到笔记本屏
    expect(h.value).toBe(before)   // 还没打开,不该动

    open.value = true
    await nextTick()
    expect(h.value).toBe(dialogTableMaxHeight(640))
    expect(h.value).not.toBe(before)
  })

  it('关闭时不重算（省掉一次无意义的读取，也避免关闭动画中的抖动）', async () => {
    setViewport(900)
    const open = ref(true)
    const h = useDialogTableHeight(open)
    setViewport(400)
    open.value = false
    await nextTick()
    expect(h.value).toBe(dialogTableMaxHeight(900))
  })
})
