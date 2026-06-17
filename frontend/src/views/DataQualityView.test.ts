import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DataQualityView from './DataQualityView.vue'
import { useDataStore } from '@/stores/data'

vi.mock('@/lib/exportXlsx', () => ({ exportRows: vi.fn() }))
import { exportRows } from '@/lib/exportXlsx'

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

function seed(over: Record<string, any> = {}) {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: '2026-06-12 09:00', totalProjects: 10, totalPaymentNodes: 50 },
    dashboard: {}, summary: {}, projectOverview: {},
    // yundocsOk 换 projects.length>0(3E-2):非空主域 → 云文档主数据已就绪
    projects: [{ projectId: 'P-1' }],
    rawNodes: [{ projectId: 'P-1', tier: 't', isPaymentRelated: true }],
    dataQuality: {
      summary: { pmisProvided: true, joinRate: 0.95, matchedActive: 8, matchedClosed: 2, unmatched: 1, lastPmisUpdate: '2026-06-11' },
      themes: [{ theme: '成本', coveragePct: 0.9, verdict: 'green' }],
      unmatched: [{ projectId: 'X-1', projectName: '甲', kind: '在建' }],
      backfill: [], conflicts: [], dirty: [],
    },
    projectsQuality: {
      deptProjectCount: 9,
      orgFile: { provided: true, rows: 30, matched: 25, matchRate: 0.83 },
      mappingFile: { provided: true, rows: 5, matched: 5, matchRate: 1 },
      deliveryFile: { provided: true, rows: 40, matched: 38, matchRate: 0.95 },
      milestoneActive: { provided: true, rows: 634, matched: 610, matchRate: 0.96 },
      milestoneClosed: { provided: true, rows: 3914, matched: 217, matchRate: 0.06 },
      paymentRecordsFile: { provided: true, rows: 622, matched: 584, matchRate: 0.94 },
      profitDirectFile: { provided: true, rows: 903, matched: 632, matchRate: 0.7 },
      profitBridgeFile: { provided: true, rows: 285, matched: 276, matchRate: 0.97 },
      budgetFile: { provided: true, rows: 607, matched: 574, matchRate: 0.95 },
      staffNoProject: [], managerNotInOrg: [], presaleTotal: 3, presaleMapped: 3, presaleUnmapped: [],
    },
    ...over,
  } as any
}

const mountView = () => mount(DataQualityView, { global: { stubs: { DataTable: true } } })

describe('DataQualityView', () => {
  it('黄横幅:有未匹配告警', () => {
    seed()
    const w = mountView()
    const banner = w.find('[data-test="banner"]')
    expect(banner.classes()).toContain('yellow')
    expect(banner.text()).toContain('1 类告警需关注')
    expect(banner.text()).toContain('2026-06-12 09:00')
  })

  it('绿横幅:告警清零', () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).dataQuality.unmatched = []
    ;(ds.data as any).dataQuality.summary.unmatched = 0
    const w = mountView()
    expect(w.find('[data-test="banner"]').classes()).toContain('green')
    expect(w.text()).toContain('数据就绪')
  })

  it('红横幅:云文档缺失', () => {
    seed({ projects: [] })
    const w = mountView()
    expect(w.find('[data-test="banner"]').classes()).toContain('red')
  })

  it('九张源卡,缺失源置灰带未提供徽章', () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projectsQuality.orgFile = { provided: false, rows: 0, matched: 0, matchRate: 0 }
    const w = mountView()
    expect(w.findAll('.gov-src')).toHaveLength(9)
    const org = w.find('[data-test="src-org"]')
    expect(org.classes()).toContain('off')
    expect(org.text()).toContain('未提供')
  })

  it('0 条告警置灰且按钮禁用', () => {
    seed()
    const w = mountView()
    const dirty = w.find('[data-test="alert-dirty"]')
    expect(dirty.classes()).toContain('zero')
    expect(dirty.find('button').attributes('disabled')).toBeDefined()
  })

  it('点击展开明细表,缺失类展开为 note 文案', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projectsQuality.mappingFile = { provided: false, rows: 0, matched: 0, matchRate: 0 }
    const w = mountView()
    const un = w.find('[data-test="alert-unmatched"]')
    await un.find('button').trigger('click')
    expect(un.find('data-table-stub').exists()).toBe(true)
    const miss = w.find('[data-test="alert-missing-mapping"]')
    await miss.find('button').trigger('click')
    expect(miss.find('.gov-note').text()).toContain('A.xlsx')
    expect(miss.find('data-table-stub').exists()).toBe(false)
  })

  it('导出按钮调用 exportRows(文件名+行)', async () => {
    seed()
    const w = mountView()
    const un = w.find('[data-test="alert-unmatched"]')
    await un.find('button').trigger('click')
    await un.find('.gov-exp').trigger('click')
    expect(exportRows).toHaveBeenCalledWith('PMIS未匹配清单.xlsx', [{ projectId: 'X-1', projectName: '甲', kind: '在建' }])
  })

  it('未加载空态', () => {
    const ds = useDataStore()
    vi.spyOn(ds, 'load').mockResolvedValue(undefined as never)
    const w = mountView()
    expect(w.text()).toContain('数据加载中或加载失败')
  })
})
