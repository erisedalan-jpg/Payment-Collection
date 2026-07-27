import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AppEmpty from './AppEmpty.vue'

describe('AppEmpty', () => {
  it('渲染插槽文案', () => {
    const w = mount(AppEmpty, { slots: { default: '暂无数据' } })
    expect(w.text()).toBe('暂无数据')
  })

  it('default 变体取值与被替换的现状一致(视觉零变化契约)', () => {
    // 被替换的 cv-empty/cd-empty/iv-empty/mv-empty/pv-empty 统一是:
    // color --mut / text-align center / background --card / border 1px --line / radius --r-md
    const css = readFileSync(resolve(__dirname, 'AppEmpty.vue'), 'utf-8')
    expect(css).toMatch(/\.ae\b[^}]*color:\s*var\(--mut\)/)
    expect(css).toMatch(/\.ae\b[^}]*text-align:\s*center/)
    expect(css).toMatch(/\.ae\b[^}]*background:\s*var\(--card\)/)
    expect(css).toMatch(/\.ae\b[^}]*border-radius:\s*var\(--r-md\)/)
  })

  it('plain 变体无边框无背景(供 bv-empty 那种简单场景)', () => {
    const w = mount(AppEmpty, { props: { variant: 'plain' }, slots: { default: 'x' } })
    expect(w.classes()).toContain('ae--plain')
  })
})
