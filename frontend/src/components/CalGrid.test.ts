import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalGrid from './CalGrid.vue'

const dateData = {
  '2026-06-10': { total: 2, delayed: 1, onTime: 1, advance: 0, canAdvance: 0, reachedCondition: 0, fullPaid: 0, pending: 0 },
}
const today = new Date('2026-06-04T00:00:00')

function mountGrid(selectedDate = '') {
  return mount(CalGrid, {
    props: { year: 2026, month: 5, dateData, selectedDate, today },
  })
}

describe('CalGrid', () => {
  it('渲染双月 + 命中日角标', () => {
    const w = mountGrid()
    expect(w.text()).toContain('2026年6月')
    expect(w.text()).toContain('2026年7月')
    expect(w.find('.cal-badge').text()).toBe('2')
    expect(w.find('.has-nodes.status-mixed').exists()).toBe(true)
  })
  it('点击有节点的日 emit select(dateStr)', async () => {
    const w = mountGrid()
    await w.find('.has-nodes').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['2026-06-10'])
  })
})
