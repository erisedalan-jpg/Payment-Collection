import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import MetricGrid from './MetricGrid.vue'

describe('MetricGrid', () => {
  it('渲染每项 标签/主值/副标 且应用 cls', () => {
    const w = mount(MetricGrid, { props: { items: [
      { k: '项目总数', v: '624' },
      { k: '正常', v: '331', sub: '53.0%', cls: 'ok' },
    ] } })
    const cards = w.findAll('.mg-card')
    expect(cards).toHaveLength(2)
    expect(w.text()).toContain('项目总数')
    expect(w.text()).toContain('624')
    expect(w.text()).toContain('331')
    expect(w.text()).toContain('53.0%')
    expect(cards[1].find('.mg-v').classes()).toContain('ok')
  })

  it('clickable item 点击 emit item-click 带索引;非 clickable 不 emit', async () => {
    const w = mount(MetricGrid, { props: { items: [
      { k: '总数', v: '10' },
      { k: '超支', v: '3', clickable: true },
    ] } })
    const cards = w.findAll('.mg-card')
    await cards[0].trigger('click')
    expect(w.emitted('item-click')).toBeUndefined()
    await cards[1].trigger('click')
    expect(w.emitted('item-click')).toEqual([[1]])
  })

  it('clickable item 键盘 Enter 激活 emit item-click;非 clickable 不可聚焦', async () => {
    const w = mount(MetricGrid, { props: { items: [
      { k: '总数', v: '10' },
      { k: '超支', v: '3', clickable: true },
    ] } })
    const cards = w.findAll('.mg-card')
    expect(cards[0].attributes('tabindex')).toBeUndefined()
    expect(cards[1].attributes('tabindex')).toBe('0')
    await cards[1].trigger('keydown.enter')
    expect(w.emitted('item-click')).toEqual([[1]])
  })

  it('V4.5.0 卡片改用 AppCard(flat),交互修饰符与之并存', () => {
    const w = mount(MetricGrid, { props: { items: [
      { k: '总数', v: '10' },
      { k: '超支', v: '3', clickable: true },
    ] } })
    const cards = w.findAll('.mg-card')
    expect(cards).toHaveLength(2)
    for (const c of cards) {
      expect(c.classes()).toContain('ac--flat')
      expect(c.classes()).not.toContain('ac--default')
      expect(c.classes()).not.toContain('ac--raised')
      expect(c.classes()).not.toContain('ac--inset')
    }
    // AppCard 只接管卡片外观,cursor/hover 等交互属性仍留在原修饰符类里
    expect(cards[1].classes()).toContain('mg-card--clickable')
    const src = readFileSync(resolve(__dirname, 'MetricGrid.vue'), 'utf-8')
    expect(/^\.mg-card\s*[,{]/m.test(src), '.mg-card 自写卡片外观规则复活了').toBe(false)
  })
})
