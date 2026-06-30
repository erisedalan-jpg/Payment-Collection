import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RatioRing from './RatioRing.vue'

describe('RatioRing', () => {
  it('ratio=0.509 → 显示 50.9% 且环为 conic 填充', () => {
    const w = mount(RatioRing, { props: { ratio: 0.509, label: '回款达成率' } })
    expect(w.find('.ratio-ring-val').text()).toBe('50.9%')
    expect(w.text()).toContain('回款达成率')
    expect(w.find('.ratio-ring').attributes('style') || '').toContain('conic-gradient')
  })

  it('ratio=null → 显示 - 且无 conic(置灰)', () => {
    const w = mount(RatioRing, { props: { ratio: null } })
    expect(w.find('.ratio-ring-val').text()).toBe('-')
    expect(w.find('.ratio-ring').attributes('style') || '').not.toContain('conic-gradient')
  })

  it('整数比例不留小数', () => {
    const w = mount(RatioRing, { props: { ratio: 0.5 } })
    expect(w.find('.ratio-ring-val').text()).toBe('50%')
  })
})
