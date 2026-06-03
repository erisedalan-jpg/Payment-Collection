import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFilterStore } from './filter'
import { useDataStore } from './data'

const SAMPLE = {
  meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
  dashboard: {}, summary: {},
  rawNodes: [
    { projectId: 'P1', orgL4: '北京服务组', projectManager: '张三', planMonth: '2026-02' },
    { projectId: 'P2', orgL4: '上海一服务组', projectManager: '李四', planMonth: '2027-05' },
  ],
  projectOverview: { projects: [], columns: [] },
  naguanMap: {}, naguanExclude: { P2: true }, displayColumns: {}, followupRecords: {},
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function withData() {
  const ds = useDataStore()
  ds.data = SAMPLE as any
  return useFilterStore()
}

describe('filter store', () => {
  it('defaults: year=all, view=global, naguan on', () => {
    const f = useFilterStore()
    expect(f.filterYear).toBe('all')
    expect(f.viewMode).toBe('global')
    expect(f.naguanOn).toBe(true)
  })

  it('filteredNodes applies year filter over dataStore rawNodes', () => {
    const f = withData()
    f.naguanOn = false
    f.setYear('2026')
    expect(f.filteredNodes.map((n: any) => n.projectId)).toEqual(['P1'])
  })

  it('naguan on excludes flagged ids', () => {
    const f = withData()
    expect(f.filteredNodes.map((n: any) => n.projectId)).toEqual(['P1'])
  })

  it('toggleNaguan persists to localStorage', () => {
    const f = useFilterStore()
    f.toggleNaguan(false)
    expect(f.naguanOn).toBe(false)
    expect(localStorage.getItem('naguan_on')).toBe('false')
  })

  it('yearOptions include all + current year', () => {
    const f = useFilterStore()
    const keys = f.yearOptions.map((o) => o.key)
    expect(keys).toContain('all')
    expect(keys).toContain(String(new Date().getFullYear()))
  })

  it('l4Options / pmOptions derive distinct values from data', () => {
    const f = withData()
    expect(f.l4Options.slice().sort()).toEqual(['上海一服务组', '北京服务组'])
    expect(f.pmOptions.slice().sort()).toEqual(['张三', '李四'].slice().sort())
  })
})
