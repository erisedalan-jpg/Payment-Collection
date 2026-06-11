import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import PayAnalysisView from './PayAnalysisView.vue'
import { useDataStore } from '@/stores/data'

// 路由桩:可变 tab,默认 board(对齐 /panalysis/:tab? 缺省语义)
let routeTab: string | undefined = 'board'
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { tab: routeTab } }),
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
}))

const TAB_STUBS = { BoardView: true, ProjectsOverviewTab: true, TierNodesTab: true, PlanTab: true, RiskTab: true, TierIntegrityTab: true }

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); routeTab = 'board' })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [{ projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 100000, actualPayment: 0, planMonth: '2026-02' }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('PayAnalysisView', () => {
  it('默认 tab 为 board:内嵌 BoardView 且档位控件隐藏', () => {
    seed()
    routeTab = undefined // :tab? 缺省 → board
    const w = mount(PayAnalysisView, { global: { stubs: TAB_STUBS } })
    expect(w.text()).toContain('多维看板')
    expect(w.findComponent({ name: 'BoardView' }).exists()).toBe(true)
    expect(w.text()).not.toContain('档位') // board 自带维度控件,av-ctl 隐藏
  })

  it('projects tab 渲染 tab 条与档位筛选(默认全部)与总览', () => {
    seed()
    routeTab = 'projects'
    const w = mount(PayAnalysisView, { global: { stubs: TAB_STUBS } })
    expect(w.text()).toContain('项目总览')
    expect(w.text()).toContain('档位')
    expect(w.text()).toContain('全部')
    expect(w.findComponent({ name: 'ProjectsOverviewTab' }).exists()).toBe(true)
  })

  it('nodes tab 渲染汇总条', () => {
    seed()
    routeTab = 'nodes'
    const w = mount(PayAnalysisView, { global: { stubs: TAB_STUBS } })
    expect(w.text()).toContain('回款节点数')
    expect(w.findComponent({ name: 'TierNodesTab' }).exists()).toBe(true)
  })

  it('plan / risk / integrity tab 分发到对应组件', () => {
    seed(); routeTab = 'plan'
    expect(mount(PayAnalysisView, { global: { stubs: TAB_STUBS } }).findComponent({ name: 'PlanTab' }).exists()).toBe(true)
    seed(); routeTab = 'risk'
    expect(mount(PayAnalysisView, { global: { stubs: TAB_STUBS } }).findComponent({ name: 'RiskTab' }).exists()).toBe(true)
    seed(); routeTab = 'integrity'
    expect(mount(PayAnalysisView, { global: { stubs: TAB_STUBS } }).findComponent({ name: 'TierIntegrityTab' }).exists()).toBe(true)
  })
})
