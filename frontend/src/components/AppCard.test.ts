import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AppCard from './AppCard.vue'

const css = () => readFileSync(resolve(__dirname, 'AppCard.vue'), 'utf-8')
const block = (v: string) => css().match(new RegExp(`\\.ac--${v}\\s*\\{([^}]*)\\}`))![1]

describe('AppCard', () => {
  it('渲染默认插槽', () => {
    expect(mount(AppCard, { slots: { default: '内容' } }).text()).toBe('内容')
  })

  it('variant 默认 default,四个变体各自挂对应 class', () => {
    expect(mount(AppCard, { slots: { default: 'x' } }).classes()).toContain('ac--default')
    for (const v of ['raised', 'flat', 'inset'] as const) {
      expect(mount(AppCard, { props: { variant: v }, slots: { default: 'x' } }).classes()).toContain(`ac--${v}`)
    }
  })

  it('default:r-lg + card-pad + card + shadow-1(17 处主区块的原值)', () => {
    const b = block('default')
    expect(b).toMatch(/border-radius:\s*var\(--r-lg\)/)
    expect(b).toMatch(/padding:\s*var\(--card-pad\)/)
    expect(b).toMatch(/background:\s*var\(--card\)/)
    expect(b).toMatch(/box-shadow:\s*var\(--shadow-1\)/)
  })

  it('raised:r-md + card-pad + card + shadow-1(与 default 只差圆角)', () => {
    const b = block('raised')
    expect(b).toMatch(/border-radius:\s*var\(--r-md\)/)
    expect(b).toMatch(/padding:\s*var\(--card-pad\)/)
    expect(b).toMatch(/background:\s*var\(--card\)/)
    expect(b).toMatch(/box-shadow:\s*var\(--shadow-1\)/)
  })

  it('flat:r-md + card-pad + card + 无阴影(与 raised 只差阴影)', () => {
    const b = block('flat')
    expect(b).toMatch(/border-radius:\s*var\(--r-md\)/)
    expect(b).toMatch(/padding:\s*var\(--card-pad\)/)
    expect(b).toMatch(/background:\s*var\(--card\)/)
    expect(b).not.toMatch(/box-shadow/)
  })

  it('共有取值:四变体共用 1px --line 描边', () => {
    // 补洞:raised/flat 的 background 与这条共用描边原本【无人断言】——
    // 实测把 raised/flat 底色改成 --card2、乃至把 .ac 的 border 整条删掉(44 处卡片
    // 全部丢边框),七个用例竟无一变红。与 V4.4.9 AppButton 漏断言 border 色同一个洞。
    expect(css()).toMatch(/\.ac\s*\{[^}]*border:\s*1px solid var\(--line\)/)
  })

  it('inset:r-sm + sp-2 sp-3 + card2 + 无阴影', () => {
    const b = block('inset')
    expect(b).toMatch(/border-radius:\s*var\(--r-sm\)/)
    expect(b).toMatch(/padding:\s*var\(--sp-2\)\s+var\(--sp-3\)/)
    expect(b).toMatch(/background:\s*var\(--card2\)/)
    expect(b).not.toMatch(/box-shadow/)
  })

  it('只有 variant 一个 prop —— 不得提供 padding/radius/shadow 逐项覆盖', () => {
    // 承重约束:加逐项覆盖 prop 等于把「3 种圆角 × 5 种 padding」的混乱固化成 API,
    // 此后再也收不回来。需要第五种形态时先改 spec 再加变体。
    expect(Object.keys((AppCard as any).props ?? {})).toEqual(['variant'])
  })
})
