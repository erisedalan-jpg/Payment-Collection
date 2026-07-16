import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HealthBadge from './HealthBadge.vue'

describe('HealthBadge', () => {
  it.each([
    ['健康', 'ok'],
    ['关注', 'warn'],
    ['风险', 'danger'],
    ['无数据', 'none'],
  ])('overall=%s → class %s', (overall, cls) => {
    const w = mount(HealthBadge, { props: { overall } })
    expect(w.text()).toBe(overall)
    expect(w.find('.health-badge').classes()).toContain(cls)
  })

  it('空字符串显示无数据并用 none 样式', () => {
    const w = mount(HealthBadge, { props: { overall: '' } })
    expect(w.text()).toBe('无数据')
    expect(w.find('.health-badge').classes()).toContain('none')
  })
})
