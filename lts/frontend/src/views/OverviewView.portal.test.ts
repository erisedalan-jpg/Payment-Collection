import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import OverviewView from './OverviewView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { getPortalConfig } from '@/lib/portalApi'

// portalApi 被 portal store 引用;mock 掉网络。默认返回空配置,单测用 mockResolvedValueOnce 覆盖。
// 注意:OverviewView onMounted 会调 portal.load() 覆盖 store,故必须用 mock 返回值驱动可见项,
// 不能直接 seed store.config(会被 load 覆盖)。
vi.mock('@/lib/portalApi', () => ({
  getPortalConfig: vi.fn(async () => ({ version: 1, groups: [], items: [] })),
  savePortalConfig: vi.fn(),
  downloadUrl: (id: string) => '/api/portal/download?id=' + id,
}))

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: OverviewView },
    { path: '/data', component: { template: '<div/>' } },
    { path: '/project/:id', component: { template: '<div/>' } },
  ] })
  // 让 OverviewView 跳过 data.load()
  useDataStore().data = { projects: [], projectPmis: {}, paymentNodes: {}, events: [] } as any
})

async function mountView() {
  await router.push('/'); await router.isReady()
  const w = mount(OverviewView, { global: { plugins: [router] } })
  await flushPromises()
  return w
}

describe('OverviewView 门户装配', () => {
  it('有可见项时渲染 PortalLaunchpad', async () => {
    vi.mocked(getPortalConfig).mockResolvedValueOnce({ version: 1, groups: ['G'], items: [
      { id: 'pl_a', type: 'url', name: 'PMIS', group: 'G', emoji: '', featured: false,
        url: 'https://a.com', file: null, visibility: { mode: 'all' } }] } as any)
    const w = await mountView()
    expect(w.find('[data-test="portal-launchpad"]').exists()).toBe(true)
  })

  it('无可见项且非超管 → 整块不渲染', async () => {
    // 默认 mock 返回空配置
    const w = await mountView()
    expect(w.find('.ov-portal').exists()).toBe(false)
  })

  it('无可见项且超管 → 显配置入口', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'admin', displayName: '超管', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] } as any
    const w = await mountView()
    expect(w.find('.ov-portal').exists()).toBe(true)
    expect(w.text()).toContain('配置')
  })
})
