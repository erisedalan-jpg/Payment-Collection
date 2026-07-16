import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalYearHeat from './CalYearHeat.vue'
import type { CalYearHeatCell } from '@/lib/calendar'

const CELLS: CalYearHeatCell[] = Array.from({ length: 12 }, (_, m) => ({ month: m, remaining: m === 5 ? 130000 : 0, count: m === 5 ? 2 : 0 }))

describe('CalYearHeat', () => {
  it('渲染 12 个月格', () => {
    const w = mount(CalYearHeat, { props: { cells: CELLS, activeMonth: 5 } })
    expect(w.findAll('.cyh-cell').length).toBe(12)
    expect(w.text()).toContain('6月')
    expect(w.find('.cyh-cell.active').exists()).toBe(true)
  })

  it('点有金额的月 emit select', async () => {
    const w = mount(CalYearHeat, { props: { cells: CELLS, activeMonth: 0 } })
    await w.findAll('.cyh-cell')[5].trigger('click')
    expect(w.emitted('select')?.[0]?.[0]).toBe(5)
  })
})
