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
  PaymentL4Table: { template: '<div class="pl4"><h3 class="pl4-title">回款数据</h3></div>' },
  NoStageProjectsTable: { template: '<div class="nsp">无回款阶段数据项目</div>' },
}

function seedData() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {}, summary: {},
    rawNodes: [],
    displayColumns: {}, followupRecords: {},
    projects: [],
    projectPmis: {},
    paymentNodes: {},
    paymentRecords: {},
  } as any
}

describe('DashboardView', () => {
  it('渲染指标 + 回款数据表格 + 无回款阶段数据项目清单', async () => {
    seedData()
    const w = mount(DashboardView, { global: { stubs } })
    await flushPromises()
    expect(w.find('.dash-metrics').exists()).toBe(true)
    expect(w.find('.pl4').exists()).toBe(true)
    expect(w.text()).toContain('回款数据')
    expect(w.find('.nsp').exists()).toBe(true)
    expect(w.text()).toContain('无回款阶段数据项目')
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

  it('删除 TrendCard/OrgRanking 两卡与 .dash-grid 两列容器', async () => {
    seedData()
    const w = mount(DashboardView, { global: { stubs } })
    await flushPromises()
    expect(w.find('.dash-grid').exists()).toBe(false)
    expect(w.find('.trend-card').exists()).toBe(false)
    expect(w.find('.org-ranking').exists()).toBe(false)
    expect(w.text()).not.toContain('服务组达成排名')
    expect(w.text()).not.toContain('待回款金额')
  })

  it('PaymentL4Table 标题改为「回款数据」（不含「按 L4 服务组」）', async () => {
    seedData()
    const w = mount(DashboardView, { global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('回款数据')
    expect(w.text()).not.toContain('回款数据（按 L4 服务组）')
  })

  it('PaymentL4Table 与 NoStageProjectsTable 均在各自 .dash-block 区块内（整宽独占）', async () => {
    seedData()
    const w = mount(DashboardView, { global: { stubs } })
    await flushPromises()
    const blocks = w.findAll('.dash-block')
    expect(blocks.length).toBe(2)
    expect(blocks[0].find('.pl4').exists()).toBe(true)
    expect(blocks[1].find('.nsp').exists()).toBe(true)
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
