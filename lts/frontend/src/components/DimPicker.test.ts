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

  it('options 含 group 时渲染分组小标题', () => {
    const w = mount(DimPicker, { props: { modelValue: [], options: [
      { value: 'a', label: 'A', group: '风险维度' },
      { value: 'b', label: 'B', group: '项目维度' },
    ] } })
    expect(w.text()).toContain('风险维度')
    expect(w.text()).toContain('项目维度')
    expect(w.findAll('.dp-chip').length).toBe(2)
  })
  it('无 group 时平铺(向后兼容)', () => {
    const w = mount(DimPicker, { props: { modelValue: [], options: [{ value: 'a', label: 'A' }] } })
    expect(w.findAll('.dp-group-label').length).toBe(0)
    expect(w.findAll('.dp-chip').length).toBe(1)
  })

  it('混用有/无 group 项:无 group 项不产生空标题', () => {
    const w = mount(DimPicker, { props: { modelValue: [], options: [
      { value: 'a', label: 'A', group: '风险维度' },
      { value: 'b', label: 'B' },
    ] } })
    // 只有 1 个非空分组标题(风险维度);'' 桶不渲染标签
    expect(w.findAll('.dp-group-label').length).toBe(1)
    expect(w.findAll('.dp-chip').length).toBe(2)  // A,B 两 chip 都在
  })
})
