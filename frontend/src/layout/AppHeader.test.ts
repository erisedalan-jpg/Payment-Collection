import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AppHeader from './AppHeader.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

describe('AppHeader', () => {
  it('renders title and data update time from store', () => {
    const store = useDataStore()
    store.data = { meta: { lastUpdate: '2026-06-03 10:00', totalProjects: 1, totalPaymentNodes: 1 } } as any
    const wrapper = mount(AppHeader)
    expect(wrapper.text()).toContain('项目回款跟踪与管控平台')
    expect(wrapper.text()).toContain('2026-06-03 10:00')
  })

  it('stop button calls /api/stop after confirm', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'stopping' }) })
    vi.stubGlobal('fetch', f)
    const wrapper = mount(AppHeader)
    await wrapper.get('[data-test="stop-server"]').trigger('click')
    expect(f).toHaveBeenCalledWith('/api/stop')
  })
})
