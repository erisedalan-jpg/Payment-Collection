import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import PageTabs from './PageTabs.vue'
import { useAuthStore } from '@/stores/auth'
import type { TabGroupId } from '@/nav'

const Stub = { template: '<div />' }
let router: Router

function newRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insight', component: Stub }, { path: '/insight/milestone', component: Stub },
      { path: '/insight/costdetail', component: Stub }, { path: '/insight/risk', component: Stub },
      { path: '/payment/board', component: Stub }, { path: '/payment/calendar', component: Stub },
    ],
  })
}

function mountAt(group: TabGroupId, path: string) {
  return mount(PageTabs, { props: { group }, global: { plugins: [router] } })
}

describe('PageTabs', () => {
  beforeEach(() => { setActivePinia(createPinia()); router = newRouter() })

  it('超管:渲染该组全部 tab', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'a', isSuper: true, allowedPages: ['*'] } as any
    await router.push('/insight')
    const w = mountAt('project-analysis', '/insight')
    expect(w.findAll('.pt-tab').map((b) => b.text())).toEqual(['多维分析', '里程碑管理', '成本分析', '风险看板'])
  })

  it('按 pageKey 过滤:只授予两页则只渲染两个 tab', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'b', isSuper: false, allowedPages: ['insight', 'insight-risk'] } as any
    await router.push('/insight')
    const w = mountAt('project-analysis', '/insight')
    expect(w.findAll('.pt-tab').map((b) => b.text())).toEqual(['多维分析', '风险看板'])
  })

  it('过滤后仅剩 1 个 tab → 整条不渲染(单 tab 无切换意义)', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'c', isSuper: false, allowedPages: ['insight-milestone'] } as any
    await router.push('/insight/milestone')
    const w = mountAt('project-analysis', '/insight/milestone')
    expect(w.find('.pt-bar').exists()).toBe(false)
  })

  it('当前路由对应的 tab 高亮', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'd', isSuper: true, allowedPages: ['*'] } as any
    await router.push('/insight/costdetail')
    const w = mountAt('project-analysis', '/insight/costdetail')
    const on = w.findAll('.pt-tab').filter((b) => b.classes().includes('on'))
    expect(on).toHaveLength(1)
    expect(on[0].text()).toBe('成本分析')
  })

  it('切 tab 保留当前 query(下钻参数不丢)', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'e', isSuper: true, allowedPages: ['*'] } as any
    await router.push('/payment/board?dim=orgL4')
    const w = mountAt('payment-analysis', '/payment/board')
    await w.findAll('.pt-tab')[1].trigger('click')
    // router.push 是异步导航;router.isReady() 在首次 push 后即已 resolve,等它等不到本次跳转
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/payment/calendar')
    expect(router.currentRoute.value.query).toEqual({ dim: 'orgL4' })
  })
})
