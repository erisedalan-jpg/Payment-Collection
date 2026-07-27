import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalGrid from './CalGrid.vue'
import SectionTitle from './SectionTitle.vue'
import type { CalDayData } from '@/lib/calendar'

const today = new Date('2026-06-04T00:00:00')
const dateData: Record<string, CalDayData> = {
  '2026-06-10': { total: 2, delayed: 1, pending: 1, partial: 0, warranty: 0, remaining: 140000 },
}

describe('CalGrid', () => {
  it('富日格显示笔数与金额', () => {
    const w = mount(CalGrid, { props: { year: 2026, month: 5, dateData, selectedDate: '', today } })
    expect(w.text()).toContain('2026年6月')
    expect(w.text()).toContain('2笔')
    expect(w.text()).toContain('14万')
    expect(w.find('.has-nodes.st-mixed').exists()).toBe(true)
  })

  it('V4.5.1 月份标题走 SectionTitle 的 section 级(--fs-3/700 收归组件)', () => {
    const w = mount(CalGrid, { props: { year: 2026, month: 5, dateData, selectedDate: '', today } })
    const titles = w.findAllComponents(SectionTitle)
    expect(titles.length).toBe(2) // 双月并排
    for (const t of titles) expect(t.classes()).toContain('st--section')
    expect(titles[0].text()).toBe('2026年6月')
  })

  it('点击有节点的日 emit select', async () => {
    const w = mount(CalGrid, { props: { year: 2026, month: 5, dateData, selectedDate: '', today } })
    const day = w.findAll('.cal-day.has-nodes')[0]
    await day.trigger('click')
    expect(w.emitted('select')?.[0]?.[0]).toBe('2026-06-10')
  })
})
