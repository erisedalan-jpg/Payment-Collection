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
      { path: '/ledger', name: 'ledger', component: { template: '<div/>' } },
      { path: '/analysis/:tab', name: 'analysis', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('AppSidebar', () => {
  it('renders 项目/回款/工具 三段分组', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
    const text = wrapper.text()
    expect(text).toContain('项目总览')        // 项目组（P4 新首页）
    expect(text).toContain('项目清单')        // 项目组（新）
    expect(text).toContain('项目动态')
    expect(text).toContain('项目分析')        // 项目组（P5 新）
    expect(text).toContain('回款总览')        // 回款组：旧首页收编更名
    expect(text).toContain('回款日历')
    expect(text).toContain('多维看板')
    expect(text).toContain('回款分析')        // 业务分析 5 链接的子组标题
    expect(text).toContain('数据管理')        // 工具组
    expect(text).not.toContain('看板首页')    // 旧 label 退场
    // 回款组为低一级呈现（缩进样式类存在）
    expect(wrapper.findAll('.nav-sub').length).toBeGreaterThanOrEqual(5)
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
