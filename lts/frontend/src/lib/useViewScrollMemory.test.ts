import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useViewScrollMemory } from './useViewScrollMemory'

let mainEl: HTMLElement

beforeEach(() => {
  mainEl = document.createElement('div')
  mainEl.className = 'app-main'
  document.body.appendChild(mainEl)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
})
afterEach(() => {
  mainEl.remove()
  vi.unstubAllGlobals()
})

const A = defineComponent({ name: 'A', setup() { useViewScrollMemory(); return () => h('div', 'A') } })
const B = defineComponent({ name: 'B', setup() { return () => h('div', 'B') } })

function makeHost() {
  const which = ref<'A' | 'B'>('A')
  const Host = defineComponent({
    setup() {
      return () => h(KeepAlive, null, { default: () => h(which.value === 'A' ? A : B) })
    },
  })
  mount(Host, { attachTo: document.body })
  return { which }
}

describe('useViewScrollMemory', () => {
  it('下钻返回（停用→再激活）恢复 .app-main scrollTop', async () => {
    const { which } = makeHost()
    await nextTick()
    mainEl.scrollTop = 240
    mainEl.dispatchEvent(new Event('scroll')) // 激活期滚动被监听记录(saved=240)
    which.value = 'B'          // A 被 keep-alive 停用（移除监听，saved 保留 240）
    await nextTick()
    mainEl.scrollTop = 0       // 切走后容器被较矮内容归零
    which.value = 'A'          // A 再激活（恢复到记录的 240）
    await flushPromises()
    expect(mainEl.scrollTop).toBe(240)
  })

  it('首次进入（新实例）不改动 scrollTop', async () => {
    mainEl.scrollTop = 55
    makeHost()                 // A 首挂载+首激活(fresh) → 不恢复
    await flushPromises()
    expect(mainEl.scrollTop).toBe(55)
  })
})
