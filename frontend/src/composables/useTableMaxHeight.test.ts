import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { computeMaxHeight, useTableMaxHeight } from './useTableMaxHeight'

describe('computeMaxHeight', () => {
  it('可用高度 = 视口高 − 表格顶部 − 底部留白', () => {
    expect(computeMaxHeight(200, 900, 24, 200)).toBe(676) // 900-200-24
  })
  it('不低于最小高度(内容被挤到很矮时兜底)', () => {
    expect(computeMaxHeight(800, 900, 24, 200)).toBe(200) // 900-800-24=76 < 200
  })
  it('表格贴近视口顶部时给出接近满屏的高度', () => {
    expect(computeMaxHeight(0, 768, 24, 200)).toBe(744)
  })
})

describe('computeMaxHeight 负 rectTop', () => {
  // rect.top 为负 = 表格顶部已滚出视口上沿。此时 innerHeight − 负数 会算出【比视口还高】
  // 的表体,表头随页面滚走、冻结表头当场失效。recompute 在 rows 变化与 keep-alive 激活时
  // 都用当时的滚动位置测量,这条路径是可达的(useViewScrollMemory 从下钻页返回会恢复滚动)。
  it('按贴顶算,不会算出比视口还高的表', () => {
    expect(computeMaxHeight(-150, 900, 24, 440)).toBe(876) // 900-0-24,不是 900+150-24=1026
  })
  it('clamp 只影响负值,正常正数 top 一字不动', () => {
    expect(computeMaxHeight(200, 900, 24, 440)).toBe(676)
  })
})

describe('useTableMaxHeight 默认兜底地板', () => {
  // 【这条为什么必须走真实路径】上面 computeMaxHeight 的用例都把 min 当【显式入参】喂进去,
  // 改 useTableMaxHeight 里的默认值它们一条都不会红。这条不传 opts.min,才真正钉住默认值。
  it('表格在折叠线以下(测量失效)时给出 440 ≈ 10 行,而不是塌缩成 4 行', async () => {
    const realInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { value: 900, writable: true, configurable: true })

    let w: ReturnType<typeof mount> | null = null
    try {
      const el = document.createElement('div')
      // rect.top = 10000:表格远在视口下方,900 - 10000 - 24 为负 → 只能吃默认地板
      el.getBoundingClientRect = () => ({ top: 10000 }) as DOMRect

      let mh: { value: number } | null = null
      const C = defineComponent({
        setup() {
          mh = useTableMaxHeight(() => el).maxHeight
          return () => h('div')
        },
      })
      w = mount(C)
      await nextTick()
      await nextTick() // useTableMaxHeight 在 onMounted 里 nextTick(recompute)

      expect(mh!.value).toBe(440)
    } finally {
      // 本文件正是今后新增 computeMaxHeight 用例最自然的落点,不还原会让后续用例继承
      // innerHeight = 900(V4.5.7 已为同形态 —— prefs.toggle 漏还原 —— 付过一次学费)。
      w?.unmount()
      Object.defineProperty(window, 'innerHeight', { value: realInnerHeight, writable: true, configurable: true })
    }
  })
})
