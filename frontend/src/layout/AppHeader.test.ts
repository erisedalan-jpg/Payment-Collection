import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AppHeader from './AppHeader.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'

const pushSpy = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => { vi.unstubAllGlobals(); pushSpy.mockReset() })

describe('AppHeader', () => {
  it('renders title and data update time from store', () => {
    const store = useDataStore()
    store.data = { meta: { lastUpdate: '2026-06-03 10:00', totalProjects: 1, totalPaymentNodes: 1 } } as any
    const wrapper = mount(AppHeader)
    expect(wrapper.text()).toContain('项目管理平台')
    expect(wrapper.text()).toContain('2026-06-03 10:00')
  })

  it('stop button calls /api/stop after confirm', async () => {
    const { ElMessageBox } = await import('element-plus')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'stopping' }) })
    vi.stubGlobal('fetch', f)
    const wrapper = mount(AppHeader)
    await wrapper.get('[data-test="stop-server"]').trigger('click')
    await flushPromises()
    expect(f).toHaveBeenCalled()
    expect(f.mock.calls[0][0]).toBe('/api/stop')
    confirmSpy.mockRestore()
  })

  it('stop button does not call /api/stop when confirm is cancelled', async () => {
    const { ElMessageBox } = await import('element-plus')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'stopping' }) })
    vi.stubGlobal('fetch', f)
    const wrapper = mount(AppHeader)
    await wrapper.get('[data-test="stop-server"]').trigger('click')
    await flushPromises()
    expect(f).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

describe('AppHeader 登录态', () => {
  it('登录后显示 displayName + 登出按钮,点击调 logout 并跳 /login', async () => {
    const a = useAuthStore()
    a.user = { account: 'admin', displayName: '超级管理员', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }
    const logoutSpy = vi.spyOn(a, 'logout').mockResolvedValue()
    const w = mount(AppHeader)
    expect(w.text()).toContain('超级管理员')
    await w.get('[data-test="logout"]').trigger('click')
    expect(logoutSpy).toHaveBeenCalled()
    await flushPromises()
    expect(pushSpy).toHaveBeenCalledWith('/login')
  })
  it('未登录不显示登出按钮', () => {
    const w = mount(AppHeader)
    expect(w.find('[data-test="logout"]').exists()).toBe(false)
  })
})
