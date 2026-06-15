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
    rawNodes: [{ projectId: 'P1', orgL4: '北京服务组', projectManager: '张三', planMonth: '2026-02' }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('FilterBar', () => {
  it('year select reflects and updates store', async () => {
    seed()
    const f = useFilterStore()
    const wrapper = mount(FilterBar)
    await wrapper.get('[data-test="year-select"]').setValue('2026')
    expect(f.filterYear).toBe('2026')
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
