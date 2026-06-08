import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import { vActivate } from './src/directives/activate'

// 全局注册自定义指令，使组件测试 mount 时能解析模板里的 v-activate
config.global.directives = { ...(config.global.directives ?? {}), activate: vActivate }

// el-table / el-dialog 等依赖 ResizeObserver（jsdom 无）
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!(globalThis as any).ResizeObserver) {
  ;(globalThis as any).ResizeObserver = ResizeObserverStub
}

// Element Plus 部分组件用 matchMedia（jsdom 无）
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}
