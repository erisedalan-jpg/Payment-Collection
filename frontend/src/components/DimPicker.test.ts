import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DimPicker from './DimPicker.vue'

const OPTS = [
  { value: 'orgL4', label: '服务组' },
  { value: 'tier', label: '档位' },
]

describe('DimPicker', () => {
  it('点未选项追加到末尾', async () => {
    const w = mount(DimPicker, { props: { modelValue: ['orgL4'], options: OPTS } })
    await w.get('[data-test="dim-tier"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]?.[0]).toEqual(['orgL4', 'tier'])
  })

  it('点已选项移除', async () => {
    const w = mount(DimPicker, { props: { modelValue: ['orgL4', 'tier'], options: OPTS } })
    await w.get('[data-test="dim-orgL4"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]?.[0]).toEqual(['tier'])
  })

  it('选中项显示序号且高亮', () => {
    const w = mount(DimPicker, { props: { modelValue: ['tier', 'orgL4'], options: OPTS } })
    expect(w.get('[data-test="dim-tier"]').classes()).toContain('on')
    expect(w.get('[data-test="dim-tier"]').text()).toContain('1')
    expect(w.get('[data-test="dim-orgL4"]').text()).toContain('2')
  })
})
