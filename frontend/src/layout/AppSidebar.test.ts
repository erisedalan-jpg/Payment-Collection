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
      { path: '/tier/:tab/:tier', name: 'tier', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('AppSidebar', () => {
  it('renders overview + tier-tab + tool nav labels', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
    const text = wrapper.text()
    expect(text).toContain('看板首页')
    expect(text).toContain('回款台账')
    expect(text).toContain('项目总览')
    expect(text).toContain('数据管理')
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
