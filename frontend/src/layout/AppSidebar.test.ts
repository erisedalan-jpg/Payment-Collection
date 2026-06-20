import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import { useUiStore } from '@/stores/ui'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div/>' } },
      { path: '/projects', component: { template: '<div/>' } },
      { path: '/projects/closed', component: { template: '<div/>' } },
      { path: '/activity', component: { template: '<div/>' } },
      { path: '/insight', component: { template: '<div/>' } },
      { path: '/insight/milestone', component: { template: '<div/>' } },
      { path: '/insight/costdetail', component: { template: '<div/>' } },
      { path: '/insight/board', component: { template: '<div/>' } },
      { path: '/insight/calendar', component: { template: '<div/>' } },
      { path: '/payment', component: { template: '<div/>' } },
      { path: '/payment/projects', component: { template: '<div/>' } },
      { path: '/payment/nodes', component: { template: '<div/>' } },
      { path: '/payment/plan', component: { template: '<div/>' } },
      { path: '/payment/risk', component: { template: '<div/>' } },
      { path: '/ledger', name: 'ledger', component: { template: '<div/>' } },
      { path: '/data', component: { template: '<div/>' } },
      { path: '/governance', component: { template: '<div/>' } },
      { path: '/about', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('AppSidebar', () => {
  it('renders 项目/项目分析/回款/工具 四段分组', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
    const text = wrapper.text()
    expect(text).toContain('项目总览')        // 项目组（P4 新首页）
    expect(text).toContain('在建项目')        // 项目组（在建）
    expect(text).toContain('已关闭项目')      // 项目组（已关闭）
    expect(text).toContain('项目动态')
    expect(text).toContain('项目分析')        // 项目分析分区标题
    expect(text).toContain('项目多维分析')    // 项目分析组：现 InsightView
    expect(text).toContain('里程碑管理')      // 项目分析组：SP-B 新页
    expect(text).toContain('成本分析')        // 项目分析组：SP-C 新页
    expect(text).toContain('回款多维分析')    // 项目分析组：迁自 /payment/board
    expect(text).toContain('回款日历')        // 项目分析组：迁自 /calendar
    expect(text).toContain('回款总览')        // 回款组
    expect(text).toContain('回款项目')
    expect(text).toContain('回款节点')
    expect(text).toContain('回款进度')
    expect(text).toContain('风险项目')
    expect(text).toContain('回款台账')
    expect(text).toContain('数据管理')        // 工具组
    expect(text).not.toContain('看板首页')    // 旧 label 退场
    expect(text).not.toContain('回款分析')    // SP4 拆分后单入口退场
    expect(text).not.toContain('多维看板')    // 迁移后更名为「回款多维分析」
    // 项目分析(5) + 回款子域(6) 均为 .nav-sub 二级呈现 = 11
    expect(wrapper.findAll('.nav-sub').length).toBe(11)
  })

  it('toggle button flips uiStore collapsed', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const ui = useUiStore()
    const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
    expect(ui.sidebarCollapsed).toBe(false)
    await wrapper.get('[data-test="sidebar-toggle"]').trigger('click')
    expect(ui.sidebarCollapsed).toBe(true)
  })
})
