import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFilterStore } from './filter'
import { useDataStore } from './data'
import { useProjectTagsStore } from '@/stores/projectTags'

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
  it('defaults: year=all, view=global', () => {
    const f = useFilterStore()
    expect(f.filterYear).toBe('all')
    expect(f.viewMode).toBe('global')
  })

  it('filteredNodes applies year filter over dataStore rawNodes', () => {
    const f = withData()
    f.setYear('2026')
    expect(f.filteredNodes.map((n: any) => n.projectId)).toEqual(['P1'])
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

describe('filter excludedIds（按标签全局排除）', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
  it('excludeOn 关 → 空；开+选标签 → 命中项目集', () => {
    const tags = useProjectTagsStore()
    tags.assignments = { A: ['框架合同'], B: ['BH项目'], C: ['框架合同', 'BH项目'] } as any
    const f = useFilterStore()
    expect(f.excludedIds).toEqual({})
    f.setExclude(true, ['框架合同'])
    expect(f.excludedIds).toEqual({ A: true, C: true })
    expect(f.excludeOn).toBe(true)
    expect(f.excludeTags).toEqual(['框架合同'])
  })
  it('开但未选标签 → 空（不误排除）', () => {
    const f = useFilterStore()
    f.setExclude(true, [])
    expect(f.excludedIds).toEqual({})
  })
})

describe('filteredPayNodes(3B)', () => {
  it('随 viewMode/filterYear 过滤收款阶段节点', () => {
    const ds = useDataStore()
    ds.data = {
      meta: {}, dashboard: {}, summary: {}, projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {}, rawNodes: [],
      projects: [
        { projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } },
        { projectId: 'P2', projectName: '乙', projectManager: '李四', orgL4: 'B组', paymentPmis: { contract: 100000 } },
      ],
      projectPmis: {},
      paymentNodes: {
        P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.7, expectedPayment: 700000, receivedAmount: 0, unpaidAmount: 700000, status: '待回款' }],
        P2: [{ stage: '预付款', planDate: '2026-08-01', actualDate: '', payRatio: 1, expectedPayment: 100000, receivedAmount: 0, unpaidAmount: 100000, status: '待回款' }],
      },
    } as any
    const f = useFilterStore()
    expect(f.filteredPayNodes.length).toBe(2)
    f.setViewL4('A组')
    expect(f.filteredPayNodes.map((r) => r.projectId)).toEqual(['P1'])
    f.setViewGlobal()
    f.setYear('2026-Q1')
    expect(f.filteredPayNodes.map((r) => r.projectId)).toEqual(['P1'])
  })
})
