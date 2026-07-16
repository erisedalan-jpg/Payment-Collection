import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SegToggle from './SegToggle.vue'

const OPTS = [
  { value: 'a', label: '甲' },
  { value: 'b', label: '乙' },
]

describe('SegToggle', () => {
  it('高亮当前值、渲染选项', () => {
    const w = mount(SegToggle, { props: { modelValue: 'a', options: OPTS } })
    expect(w.get('[data-test="seg-a"]').classes()).toContain('on')
    expect(w.get('[data-test="seg-b"]').classes()).not.toContain('on')
    expect(w.text()).toContain('甲')
  })

  it('点击选项 emit update:modelValue', async () => {
    const w = mount(SegToggle, { props: { modelValue: 'a', options: OPTS } })
    await w.get('[data-test="seg-b"]').trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([['b']])
  })
})
