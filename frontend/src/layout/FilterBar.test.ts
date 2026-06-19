import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import FilterBar from './FilterBar.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {}, summary: {},
    rawNodes: [],
    projects: [{ projectId: 'P1', orgL4: '北京服务组', projectManager: '张三' }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('FilterBar', () => {
  it('renders date-range picker', () => {
    seed()
    const wrapper = mount(FilterBar)
    expect(wrapper.find('[data-test="date-range"]').exists()).toBe(true)
  })

  it('renders at least 4 preset buttons', () => {
    seed()
    const wrapper = mount(FilterBar)
    const buttons = wrapper.findAll('.fb-preset')
    expect(buttons.length).toBeGreaterThanOrEqual(4)
  })

  it('preset button "全部" calls setPreset("all") and clears range', async () => {
    seed()
    const f = useFilterStore()
    f.setDateRange('2026-01-01', '2026-12-31')
    const wrapper = mount(FilterBar)
    const allBtn = wrapper.findAll('.fb-preset').find((b) => b.text() === '全部')
    expect(allBtn).toBeTruthy()
    await allBtn!.trigger('click')
    expect(f.dateStart).toBe('')
    expect(f.dateEnd).toBe('')
  })

  it('view select to L4 then choose dept updates store', async () => {
    seed()
    const f = useFilterStore()
    const wrapper = mount(FilterBar)
    await wrapper.get('[data-test="view-mode"]').setValue('l4')
    expect(f.viewMode).toBe('l4')
    await wrapper.get('[data-test="view-l4"]').setValue('北京服务组')
    expect(f.viewL4).toBe('北京服务组')
  })
})
