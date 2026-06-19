import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashboardView from './DashboardView.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  useFilterStore().setPreset('all')
})
afterEach(() => vi.unstubAllGlobals())

const stubs = {
  DashMetrics: { template: '<div class="dash-metrics"></div>' },
  PaymentL4Table: { template: '<div class="pl4"><h3 class="pl4-title">回款数据（按 L4 服务组）</h3></div>' },
  TrendCard: { template: '<div class="trend-card"></div>' },
  OrgRanking: { template: '<div class="org-ranking"></div>' },
}

function seedData() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {}, summary: {},
    rawNodes: [],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    projects: [],
    projectPmis: {},
    paymentNodes: {},
    paymentRecords: {},
  } as any
}

describe('DashboardView', () => {
  it('渲染指标 + 回款数据表格 + 趋势 + 排名', async () => {
    seedData()
    const w = mount(DashboardView, { global: { stubs } })
    await flushPromises()
    expect(w.find('.dash-metrics').exists()).toBe(true)
    expect(w.find('.pl4').exists()).toBe(true)
    expect(w.text()).toContain('回款数据（按 L4')
    expect(w.find('.trend-card').exists()).toBe(true)
    expect(w.find('.org-ranking').exists()).toBe(true)
  })

  it('不含 TierStrip（金额档位组件不出现）', async () => {
    seedData()
    const w = mount(DashboardView, { global: { stubs } })
    await flushPromises()
    expect(w.find('.tier-strip').exists()).toBe(false)
    expect(w.text()).not.toContain('金额档位')
    expect(w.text()).not.toContain('100万以上')
    expect(w.text()).not.toContain('万以下')
  })

  it('TrendCard 与 OrgRanking 同在 .dash-grid 下', async () => {
    seedData()
    const w = mount(DashboardView, { global: { stubs } })
    await flushPromises()
    const grid = w.find('.dash-grid')
    expect(grid.exists()).toBe(true)
    expect(grid.find('.trend-card').exists()).toBe(true)
    expect(grid.find('.org-ranking').exists()).toBe(true)
  })

  it('PaymentL4Table 在 .dash-block 区块内（整宽独占）', async () => {
    seedData()
    const w = mount(DashboardView, { global: { stubs } })
    await flushPromises()
    const block = w.find('.dash-block')
    expect(block.exists()).toBe(true)
    expect(block.find('.pl4').exists()).toBe(true)
  })

  it('渲染加载态', () => {
    const ds = useDataStore()
    ds.loading = true
    const w = mount(DashboardView, { global: { stubs } })
    expect(w.text()).toContain('加载中')
  })

  it('加载失败渲染错误态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }))
    const w = mount(DashboardView, { global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('数据加载失败')
  })
})
