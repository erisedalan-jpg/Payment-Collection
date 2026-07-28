import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HeatmapTable from './HeatmapTable.vue'

const M = {
  rows: ['甲组', '乙组'], cols: ['终端安全', '天眼'],
  cells: [[30, 10], [0, 60]],
  rowTotals: [40, 60], colTotals: [30, 70], total: 100,
}

describe('HeatmapTable', () => {
  it('hours 模式只显示工时', () => {
    const w = mount(HeatmapTable, { props: { matrix: M, rowLabel: 'L4 组织', displayMode: 'hours' } })
    const t = w.text()
    expect(t).toContain('30')
    expect(t).not.toContain('%')
  })

  it('pct 模式只显示比例,分母是总计', () => {
    const w = mount(HeatmapTable, { props: { matrix: M, rowLabel: 'L4 组织', displayMode: 'pct' } })
    expect(w.text()).toContain('30%')
  })

  it('both 模式两者都有', () => {
    const w = mount(HeatmapTable, { props: { matrix: M, rowLabel: 'L4 组织', displayMode: 'both' } })
    const t = w.text()
    expect(t).toContain('30')
    expect(t).toContain('%')
  })

  it('零值单元格不上色也不显示 0(留白比满屏 0 可读)', () => {
    const w = mount(HeatmapTable, { props: { matrix: M, rowLabel: 'L4 组织', displayMode: 'hours' } })
    const cells = w.findAll('[data-test="hm-cell"]')
    const zero = cells.find((c) => c.attributes('data-v') === '0')
    expect(zero?.text().trim()).toBe('')
  })

  it('空矩阵不炸', () => {
    const w = mount(HeatmapTable, {
      props: { matrix: { rows: [], cols: [], cells: [], rowTotals: [], colTotals: [], total: 0 },
               rowLabel: 'L4 组织', displayMode: 'both' },
    })
    expect(w.exists()).toBe(true)
  })
})
