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

const TAB_STUBS = { BoardView: true, PayProjectsView: true, PayNodesView: true, PayPlanView: true, PayRiskView: true }

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); routeTab = 'board' })

function seed() {
  const ds = useDataStore()
  ds.data = {
    projects: [], paymentNodes: {}, projectPmis: {}, naguanExclude: {},
  } as any
}

describe('PayAnalysisView', () => {
  it('默认 tab 为 board:内嵌 BoardView 且维度选择器隐藏', () => {
    seed()
    routeTab = undefined // :tab? 缺省 → board
    const w = mount(PayAnalysisView, { global: { stubs: TAB_STUBS } })
    expect(w.text()).toContain('多维看板')
    expect(w.findComponent({ name: 'BoardView' }).exists()).toBe(true)
    expect(w.text()).not.toContain('金额档') // board 自带维度控件,av-ctl 维度选择器隐藏
  })

  it('tab 条不含数据质检', () => {
    seed()
    routeTab = 'board'
    const w = mount(PayAnalysisView, { global: { stubs: TAB_STUBS } })
    expect(w.text()).not.toContain('数据质检')
    expect(w.text()).toContain('回款进度') // plan tab 文案
  })

  it('projects tab 渲染共享维度选择器(部门/阶段/金额档/进度态)与总览', () => {
    seed()
    routeTab = 'projects'
    const w = mount(PayAnalysisView, { global: { stubs: TAB_STUBS } })
    expect(w.text()).toContain('项目总览')
    expect(w.text()).toContain('部门')
    expect(w.text()).toContain('金额档')
    expect(w.text()).toContain('进度态')
    expect(w.findComponent({ name: 'PayProjectsView' }).exists()).toBe(true)
  })

  it('nodes tab 分发 TierNodesTab 且维度选择器显示', () => {
    seed()
    routeTab = 'nodes'
    const w = mount(PayAnalysisView, { global: { stubs: TAB_STUBS } })
    expect(w.findComponent({ name: 'PayNodesView' }).exists()).toBe(true)
    expect(w.text()).toContain('维度')
  })

  it('plan / risk tab 分发到对应组件', () => {
    seed(); routeTab = 'plan'
    expect(mount(PayAnalysisView, { global: { stubs: TAB_STUBS } }).findComponent({ name: 'PayPlanView' }).exists()).toBe(true)
    seed(); routeTab = 'risk'
    expect(mount(PayAnalysisView, { global: { stubs: TAB_STUBS } }).findComponent({ name: 'PayRiskView' }).exists()).toBe(true)
  })
})
