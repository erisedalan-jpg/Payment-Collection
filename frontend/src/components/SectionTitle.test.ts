import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import SectionTitle from './SectionTitle.vue'

const css = () => readFileSync(resolve(__dirname, 'SectionTitle.vue'), 'utf-8')
const block = (v: string) => css().match(new RegExp(`\\.st--${v}\\s*\\{([^}]*)\\}`))![1]

describe('SectionTitle', () => {
  it('渲染插槽文案', () => {
    expect(mount(SectionTitle, { slots: { default: '成本构成' } }).text()).toBe('成本构成')
  })

  it('level 默认 section,两级各挂对应 class', () => {
    expect(mount(SectionTitle, { slots: { default: 'x' } }).classes()).toContain('st--section')
    expect(mount(SectionTitle, { props: { level: 'card' }, slots: { default: 'x' } }).classes()).toContain('st--card')
  })

  it('card 级:--fs-4 / 700 / --txt(15 处卡片主标题的原值)', () => {
    const b = block('card')
    expect(b).toMatch(/font-size:\s*var\(--fs-4\)/)
    expect(b).toMatch(/font-weight:\s*700/)
    expect(b).toMatch(/color:\s*var\(--txt\)/)
  })

  it('section 级:--fs-3 / 700 / --txt(10 处卡内小节标题的原值)', () => {
    const b = block('section')
    expect(b).toMatch(/font-size:\s*var\(--fs-3\)/)
    expect(b).toMatch(/font-weight:\s*700/)
    expect(b).toMatch(/color:\s*var\(--txt\)/)
  })

  it('共有取值:两级共用 margin 0 + --lh-dense 行高', () => {
    // 补洞(plan 未列此条,依 V4.5.0 教训补):.st 共用块原本【无人断言】——
    // 删掉 margin:0 会让全站 31 处标题一起吃回浏览器 h3 的默认外边距,
    // 而 plan 的七个用例无一变红。与 AppCard 漏断言 .ac 描边是同一个洞。
    expect(css()).toMatch(/\.st\s*\{[^}]*margin:\s*0/)
    expect(css()).toMatch(/\.st\s*\{[^}]*line-height:\s*var\(--lh-dense\)/)
  })

  it('两级字号必须不同 —— 压成一级正是 V4.4.9 的错', () => {
    expect(block('card')).not.toEqual(block('section'))
    expect(block('card')).toMatch(/--fs-4/)
    expect(block('section')).toMatch(/--fs-3/)
  })

  it('只有 level 一个 prop —— 不提供字号/字重逐项覆盖', () => {
    expect(Object.keys((SectionTitle as any).props ?? {})).toEqual(['level'])
  })

  it('渲染为 h3(语义标题,而非 div)', () => {
    expect(mount(SectionTitle, { slots: { default: 'x' } }).element.tagName).toBe('H3')
  })
})
