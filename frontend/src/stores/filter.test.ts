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
  displayColumns: {}, followupRecords: {},
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
  it('defaults: dateStart/dateEnd 本年度, view=global', () => {
    const f = useFilterStore()
    const y = new Date().getFullYear()
    expect(f.dateStart).toBe(`${y}-01-01`)
    expect(f.dateEnd).toBe(`${y}-12-31`)
    expect(f.viewMode).toBe('global')
  })

  it('setDateRange 写值；setDateRange 空清空', () => {
    const f = useFilterStore()
    f.setDateRange('2026-01-01', '2026-12-31')
    expect(f.dateStart).toBe('2026-01-01')
    expect(f.dateEnd).toBe('2026-12-31')
    f.setDateRange('', '')
    expect(f.dateStart).toBe('')
    expect(f.dateEnd).toBe('')
  })

  it('setPreset("all") 清空区间', () => {
    const f = useFilterStore()
    f.setDateRange('2026-01-01', '2026-12-31')
    f.setPreset('all')
    expect(f.dateStart).toBe('')
    expect(f.dateEnd).toBe('')
  })

  it('setPreset("year") 写本年度起止非空', () => {
    const f = useFilterStore()
    f.setPreset('year')
    const y = new Date().getFullYear()
    expect(f.dateStart).toBe(`${y}-01-01`)
    expect(f.dateEnd).toBe(`${y}-12-31`)
  })

  it('l4Options / pmOptions derive distinct values from data', () => {
    const ds = useDataStore()
    ds.data = {
      ...SAMPLE,
      projects: [
        { projectId: 'P1', orgL4: '北京服务组', projectManager: '张三' },
        { projectId: 'P2', orgL4: '上海一服务组', projectManager: '李四' },
      ],
      paymentNodes: {}, projectPmis: {},
    } as any
    const f = useFilterStore()
    expect(f.l4Options.slice().sort()).toEqual(['上海一服务组', '北京服务组'])
    expect(f.pmOptions.slice().sort()).toEqual(['张三', '李四'].slice().sort())
  })

  it('l4Options/pmOptions 取自 projects 去重', () => {
    const ds = useDataStore()
    ds.data = { projects: [
      { projectId: 'P1', orgL4: '北京组', projectManager: '张' },
      { projectId: 'P2', orgL4: '上海组', projectManager: '李' },
      { projectId: 'P3', orgL4: '北京组', projectManager: '张' },
    ], paymentNodes: {}, projectPmis: {} } as any
    const f = useFilterStore()
    expect([...f.l4Options].sort()).toEqual(['上海组', '北京组'])
    expect([...f.pmOptions].sort()).toEqual(['张', '李'].sort())
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
  it('随 viewMode/dateRange 过滤收款阶段节点', () => {
    const ds = useDataStore()
    ds.data = {
      meta: {}, dashboard: {}, summary: {},
      displayColumns: {}, followupRecords: {}, rawNodes: [],
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
    // 默认全部：两个节点都在
    expect(f.filteredPayNodes.length).toBe(2)
    // 视角 l4 过滤
    f.setViewL4('A组')
    expect(f.filteredPayNodes.map((r) => r.projectId)).toEqual(['P1'])
    // 日期范围过滤：2026-Q1 对应 2026-01-01~2026-03-31，只 P1(2026-02) 在内
    f.setViewGlobal()
    f.setDateRange('2026-01-01', '2026-03-31')
    expect(f.filteredPayNodes.map((r) => r.projectId)).toEqual(['P1'])
  })
})
