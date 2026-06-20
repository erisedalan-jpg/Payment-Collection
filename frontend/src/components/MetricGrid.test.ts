import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
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
})
