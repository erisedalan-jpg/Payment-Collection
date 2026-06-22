import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import CalendarView from './CalendarView.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  useFilterStore().setPreset('all')
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {},
    summary: {},
    rawNodes: [],
    displayColumns: {},
    followupRecords: {},
    projects: [
      { projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: 'A组', orgL3_1: '三部一组', paymentPmis: { contract: 1000000 } },
    ],
    projectPmis: {},
    paymentNodes: {
      P1: [
        { stage: '到货款', planDate: '2026-02-10', actualDate: '', payRatio: 0.5, actualRatio: 0, expectedPayment: 500000, receivedAmount: 0, unpaidAmount: 500000, status: '待回款' },
      ],
    },
  } as any
}

describe('CalendarView', () => {
  it('渲染标题/仪表卡/筛选条/网格', () => {
    seed()
    const w = mount(CalendarView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('回款日历')
    expect(w.text()).toContain('当月待回款(万)')
    expect(w.text()).toContain('7天内到期')
    expect(w.findComponent({ name: 'CalGrid' }).exists()).toBe(true)
    expect(w.text()).toContain('即将到期回款节点')
  })

  it('切到议程列表视图渲染 CalAgenda', async () => {
    seed()
    const w = mount(CalendarView, { global: { plugins: [ElementPlus] } })
    await w.get('[data-test="seg-agenda"]').trigger('click')
    expect(w.find('.cag').exists()).toBe(true)
    expect(w.find('.cal-grid-row').exists()).toBe(false)
  })

  it('点击年度热力条某月聚焦该月', async () => {
    seed()
    const w = mount(CalendarView, { global: { plugins: [ElementPlus] } })
    expect(w.find('.cyh').exists()).toBe(true)
    await w.findAll('.cyh-cell')[5].trigger('click')
    expect(w.findComponent({ name: 'CalGrid' }).props('month')).toBe(5)
  })
})
