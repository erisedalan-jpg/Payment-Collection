import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChartTypeSelector from './ChartTypeSelector.vue'

const ALL_TYPES = ['bar', 'line', 'pie']

describe('ChartTypeSelector', () => {
  it('只渲染 available 里的类型', () => {
    const w = mount(ChartTypeSelector, {
      props: { modelValue: ['bar'], available: ['bar', 'line'] },
    })
    const btns = w.findAll('button')
    expect(btns).toHaveLength(2)
    expect(w.text()).toContain('柱状图')
    expect(w.text()).toContain('折线图')
    expect(w.text()).not.toContain('饼图')
  })

  it('当前选中的按钮有 on 样式', () => {
    const w = mount(ChartTypeSelector, {
      props: { modelValue: ['bar', 'line'], available: ALL_TYPES },
    })
    expect(w.get('[data-type="bar"]').classes()).toContain('on')
    expect(w.get('[data-type="line"]').classes()).toContain('on')
    expect(w.get('[data-type="pie"]').classes()).not.toContain('on')
  })

  it('点击未选中项 emit update:modelValue（加入）', async () => {
    const w = mount(ChartTypeSelector, {
      props: { modelValue: ['bar'], available: ALL_TYPES },
    })
    await w.get('[data-type="line"]').trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toContain('bar')
    expect(emitted![0][0]).toContain('line')
  })

  it('点击已选中项 emit update:modelValue（移除）', async () => {
    const w = mount(ChartTypeSelector, {
      props: { modelValue: ['bar', 'line'], available: ALL_TYPES },
    })
    await w.get('[data-type="line"]').trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toContain('bar')
    expect(emitted![0][0]).not.toContain('line')
  })

  it('不允许取消最后一个选中（单选时点击自身不 emit）', async () => {
    const w = mount(ChartTypeSelector, {
      props: { modelValue: ['bar'], available: ALL_TYPES },
    })
    await w.get('[data-type="bar"]').trigger('click')
    // 最后一个不能取消，不应该 emit
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })

  it('所有 available 类型都有对应中文标签', () => {
    const w = mount(ChartTypeSelector, {
      props: { modelValue: ['bar'], available: ALL_TYPES },
    })
    expect(w.text()).toContain('柱状图')
    expect(w.text()).toContain('折线图')
    expect(w.text()).toContain('饼图')
  })
})
