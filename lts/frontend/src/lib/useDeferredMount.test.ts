import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useDeferredMount } from './useDeferredMount'

describe('useDeferredMount', () => {
  // 关键契约:测试环境(MODE==='test')下 ready 必须挂载即为 true,
  // 否则三页(costdetail/milestone/risk)的同步断言(如 mount 后立即查 ChartBox/DataTable)会全挂。
  it('测试环境下 ready 挂载即为 true(不破坏既有同步断言)', () => {
    const C = defineComponent({
      setup() {
        const { ready } = useDeferredMount()
        return { ready }
      },
      template: '<div>{{ ready }}</div>',
    })
    const w = mount(C)
    expect((w.vm as { ready: boolean }).ready).toBe(true)
    expect(w.text()).toBe('true')
  })
})
