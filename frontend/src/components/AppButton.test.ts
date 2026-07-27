import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AppButton from './AppButton.vue'

describe('AppButton', () => {
  it('渲染插槽文案并透传 click', async () => {
    const w = mount(AppButton, { slots: { default: '导出Excel' } })
    expect(w.text()).toBe('导出Excel')
    await w.trigger('click')
    expect(w.emitted('click')).toBeTruthy()
  })

  it('透传原生属性(data-test / disabled)', () => {
    const w = mount(AppButton, { attrs: { 'data-test': 'x-export', disabled: true }, slots: { default: 'x' } })
    expect(w.attributes('data-test')).toBe('x-export')
    expect(w.attributes('disabled')).toBeDefined()
  })

  it('共有取值:圆角与内边距(两变体一致)', () => {
    const css = readFileSync(resolve(__dirname, 'AppButton.vue'), 'utf-8')
    expect(css).toMatch(/\.ab\s*\{[^}]*border-radius:\s*var\(--r-sm\)/)
    expect(css).toMatch(/\.ab\s*\{[^}]*padding:\s*var\(--sp-1\)\s+var\(--sp-3\)/)
  })

  it('default 变体四项取值与原 .av-export / .dv-btn 一族一致', () => {
    const css = readFileSync(resolve(__dirname, 'AppButton.vue'), 'utf-8')
    const b = css.match(/\.ab--default\s*\{([^}]*)\}/)![1]
    expect(b).toMatch(/background:\s*var\(--card\)/)
    expect(b).toMatch(/border:\s*1px solid var\(--line\)/)
    expect(b).toMatch(/font-size:\s*var\(--fs-2\)/)
    expect(b).toMatch(/color:\s*var\(--txt\)/)
  })

  it('subtle 变体四项取值与原 .cd-btn 一族(7 处)一致', () => {
    // 初版契约只断言 radius/padding/background 三项,漏了 border 色/字号/字色 ——
    // 结果 7 处次级按钮被误换成 default 变体(灰底 12px 变白底 14px)而【无一条测试变红】。
    // 这四项必须逐条锁死。
    const css = readFileSync(resolve(__dirname, 'AppButton.vue'), 'utf-8')
    const b = css.match(/\.ab--subtle\s*\{([^}]*)\}/)![1]
    expect(b).toMatch(/background:\s*var\(--card2\)/)
    expect(b).toMatch(/border:\s*1px solid var\(--line2\)/)
    expect(b).toMatch(/font-size:\s*var\(--fs-1\)/)
    expect(b).toMatch(/color:\s*var\(--sub\)/)
  })

  it('subtle 的 hover 沿用原 .cd-btn 写法(变底色 + 转主色字),不是 --hover-tint', () => {
    const css = readFileSync(resolve(__dirname, 'AppButton.vue'), 'utf-8')
    expect(css).toMatch(/\.ab--subtle:hover[^{]*\{[^}]*background:\s*var\(--bg\)[^}]*color:\s*var\(--accent\)/)
  })

  it('variant 默认为 default,可切 subtle', () => {
    expect(mount(AppButton, { slots: { default: 'x' } }).classes()).toContain('ab--default')
    expect(mount(AppButton, { props: { variant: 'subtle' }, slots: { default: 'x' } }).classes()).toContain('ab--subtle')
  })

  it('挂 .u-press(按下回弹,与全站自绘按钮一致)', () => {
    const w = mount(AppButton, { slots: { default: 'x' } })
    expect(w.classes()).toContain('u-press')
  })
})
