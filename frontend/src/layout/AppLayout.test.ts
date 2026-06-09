import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppLayout from './AppLayout.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('AppLayout', () => {
  it('renders header, sidebar and routed content', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'dashboard', component: { template: '<div class="routed">ROUTED</div>' } },
        { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
      ],
    })
    router.push('/')
    await router.isReady()
    const wrapper = mount(AppLayout, { global: { plugins: [router] } })
    expect(wrapper.find('.app-header').exists()).toBe(true)
    expect(wrapper.find('.sidebar').exists()).toBe(true)
    expect(wrapper.find('.routed').exists()).toBe(true)
    expect(wrapper.find('.filter-bar').exists()).toBe(true)
  })
})

const Blank = { template: '<div/>' }
function makeRouter(routes: any[]) {
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('AppLayout FilterBar 按路由', () => {
  it('hideFilter 路由不渲染 FilterBar', async () => {
    const router = makeRouter([
      { path: '/', component: Blank, meta: {} },
      { path: '/data', component: Blank, meta: { hideFilter: true } },
    ])
    router.push('/data'); await router.isReady()
    const w = mount(AppLayout, {
      global: {
        plugins: [createPinia(), router],
        stubs: { AppHeader: true, AppSidebar: true, ProjectDetailDrawer: true },
      },
    })
    expect(w.find('.filter-bar').exists()).toBe(false)
  })
  it('普通路由渲染 FilterBar', async () => {
    const router = makeRouter([{ path: '/', component: Blank, meta: {} }])
    router.push('/'); await router.isReady()
    const w = mount(AppLayout, {
      global: {
        plugins: [createPinia(), router],
        stubs: { AppHeader: true, AppSidebar: true, ProjectDetailDrawer: true },
      },
    })
    expect(w.find('.filter-bar').exists()).toBe(true)
  })
})
