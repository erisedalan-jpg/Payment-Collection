import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent, h, KeepAlive } from 'vue'
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

describe('AppLayout fullscreen 分支', () => {
  it('fullscreen 路由只渲染裸 router-view(无 header/sidebar)', async () => {
    const router = makeRouter([
      { path: '/', component: Blank, meta: {} },
      { path: '/login', component: { template: '<div class="routed-login">LOGIN</div>' }, meta: { fullscreen: true } },
    ])
    router.push('/login'); await router.isReady()
    const w = mount(AppLayout, {
      global: { plugins: [createPinia(), router], stubs: { AppHeader: true, AppSidebar: true, ProjectDetailDrawer: true } },
    })
    expect(w.find('.routed-login').exists()).toBe(true)
    expect(w.find('.app-layout').exists()).toBe(false)   // 全屏分支不渲染外壳(Header/Sidebar 均在 .app-layout 内)
  })
})

// V2.5.9 任务5:keep-alive 包裹改造后的结构不变量——组件 name 需与 KEEPALIVE_COMPONENTS 对齐(ProjectsView)才能验证 include 生效路径不受影响
const KAProjectsView = defineComponent({ name: 'ProjectsView', setup: () => () => h('div', { class: 'normal-page' }, 'N') })
const KALoginView = defineComponent({ name: 'LoginView', setup: () => () => h('div', { class: 'full-page' }, 'F') })

function makeKeepAliveRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', name: 'projects', component: KAProjectsView, meta: { hideFilter: true } },
      { path: '/login', name: 'login', component: KALoginView, meta: { fullscreen: true } },
    ],
  })
}

const keepAliveStubs = { AppHeader: true, AppSidebar: true, FilterBar: true, ProjectDetailDrawer: true }

describe('AppLayout keep-alive 包裹', () => {
  it('普通路由渲染 .app-main 布局', async () => {
    const router = makeKeepAliveRouter()
    router.push('/projects'); await router.isReady()
    const w = mount(AppLayout, { global: { plugins: [router], stubs: keepAliveStubs } })
    await flushPromises()
    expect(w.find('.app-main').exists()).toBe(true)
    expect(w.find('.normal-page').exists()).toBe(true)
  })

  // V2.6.6 性能护栏:菜单进入 bump token 产生的旧实例是永不可复用的死缓存,
  // 返回判定只有单一 armed 槽 → 最多只需最近 1 个缓存实例;max=2(留 1 余量)防死实例囤积
  it('keep-alive 缓存上限为 2(防死实例累积)', async () => {
    const router = makeKeepAliveRouter()
    router.push('/projects'); await router.isReady()
    const w = mount(AppLayout, { global: { plugins: [router], stubs: keepAliveStubs } })
    await flushPromises()
    const ka = w.findComponent(KeepAlive)
    expect(ka.exists()).toBe(true)
    expect(Number(ka.props('max'))).toBe(2)
  })

  it('全屏路由裸渲染、无 .app-main', async () => {
    const router = makeKeepAliveRouter()
    router.push('/login'); await router.isReady()
    const w = mount(AppLayout, { global: { plugins: [router], stubs: keepAliveStubs } })
    await flushPromises()
    expect(w.find('.app-main').exists()).toBe(false)
    expect(w.find('.full-page').exists()).toBe(true)
  })
})
