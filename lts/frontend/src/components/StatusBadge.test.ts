import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from './StatusBadge.vue'

describe('StatusBadge', () => {
  it('渲染 label 并按 tone 给类', () => {
    const w = mount(StatusBadge, { props: { label: '延期', tone: 'warn' } })
    expect(w.text()).toBe('延期')
    expect(w.find('span').classes()).toContain('warn')
  })
  it('tone 缺省为 mut', () => {
    const w = mount(StatusBadge, { props: { label: '未发布' } })
    expect(w.find('span').classes()).toContain('mut')
  })
})
