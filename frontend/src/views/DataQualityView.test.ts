import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
    dashboard: {}, summary: {},
    // yundocsOk 换 projects.length>0(3E-2):非空主域 → 主域数据已就绪
    // (卡名 2026-09-01 由「云文档」订正为「主域数据」—— 云文档 V1.16.2 就移除了)
    projects: [{ projectId: 'P-1', orgL4: 'A组' }],
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
      collectionStagesFile: { provided: true, rows: 1601, matched: 1215, matchRate: 0.76 },
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

  it('红横幅:主域数据缺失', () => {
    seed({ projects: [] })
    const w = mountView()
    expect(w.find('[data-test="banner"]').classes()).toContain('red')
  })

  it('十张源卡,缺失源置灰带未提供徽章', () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projectsQuality.orgFile = { provided: false, rows: 0, matched: 0, matchRate: 0 }
    const w = mountView()
    expect(w.findAll('.gov-src')).toHaveLength(10)
    const org = w.find('[data-test="src-org"]')
    expect(org.classes()).toContain('off')
    expect(org.text()).toContain('未提供')
  })

  it('V4.5.0 源卡改用 AppCard(raised 变体);同页的 .gov-alert 属非目标,不得被换掉', () => {
    seed()
    const w = mountView()
    const cards = w.findAll('.gov-src')
    expect(cards).toHaveLength(10)
    expect(cards.every((c) => c.classes().includes('ac--raised'))).toBe(true)
    // 告警条是提示条不是卡片(spec §3.3 非目标),不应挂上 AppCard 的类
    const alerts = w.findAll('.gov-alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts.every((a) => !a.classes().includes('ac'))).toBe(true)
  })

  it('V4.5.1 横幅标题归 card 级、告警小标题归 section 级 —— 同页两个级别不可混', () => {
    seed()
    const w = mountView()
    // 体检横幅标题:原值 --fs-4 → card
    const banner = w.find('.gov-banner-title')
    expect(banner.exists()).toBe(true)
    expect(banner.element.tagName).toBe('H3')
    expect(banner.classes()).toContain('st--card')
    expect(banner.classes()).not.toContain('st--section')
    // 告警小标题:原值 --fs-3 → section。.gov-h 类已整条移除,故按级别类定位
    const sections = w.findAll('.st--section')
    expect(sections).toHaveLength(1)
    expect(sections[0].element.tagName).toBe('H3')
    expect(sections[0].text()).toContain('告警')

    const src = readFileSync(resolve(__dirname, 'DataQualityView.vue'), 'utf-8')
    // .gov-banner-title 自身规则(只有字号字重)已删,类名留着是给下面三条上色规则用的
    expect(src, '.gov-banner-title 不应再自写字号字重').not.toMatch(/^\.gov-banner-title\s*\{/m)
    expect(src).toContain('.gov-banner.green .gov-banner-title { color: var(--ok-text); }')
    // .gov-h 原本除三属性外只剩 margin: 0,与组件同值,故整条移除
    expect(src, '.gov-h 规则应整条移除').not.toMatch(/^\.gov-h\s*\{/m)
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

  it('未加载空态改用 AppEmpty(default 变体)', () => {
    const ds = useDataStore()
    vi.spyOn(ds, 'load').mockResolvedValue(undefined as never)
    const w = mountView()
    const empty = w.find('.ae')
    expect(empty.exists()).toBe(true)
    expect(empty.classes()).toContain('ae--default')
    expect(empty.text()).toContain('数据加载中或加载失败')
  })
})

describe('V4.4.8 页头', () => {
  it('渲染页头标题', () => {
    seed()
    const w = mountView()
    expect(w.find('.ph-title').text()).toBe('数据治理')
  })
})
