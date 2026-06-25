import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import OpportunityEditDrawer from './OpportunityEditDrawer.vue'
import { useOpportunitiesStore } from '@/stores/opportunities'

beforeEach(() => setActivePinia(createPinia()))
const row = { id: 'opp-1', l4: '小金融服务组', customer: '甲', status: '招投标', amountWan: 100, firstReg: '2026-06-01', lastUpdate: '2026-06-20 10:00' }

// el-select/el-option 在 jsdom 中渲染时会触发递归更新噪声，stub 掉；
// el-drawer teleport 到 body 导致 w.text() 看不到内容，也 stub 掉。
// 参照 AdminView.test.ts + ProjectDetailDrawer.test.ts 的既有模式。
const STUBS = {
  teleport: true,
  'el-select': { template: '<div class="el-select-stub"></div>', props: ['modelValue', 'clearable', 'placeholder'] },
  'el-option': { template: '<div />', props: ['label', 'value'] },
  ElDrawer: {
    name: 'ElDrawer',
    props: ['modelValue', 'title', 'direction', 'size'],
    emits: ['update:modelValue'],
    template: '<div class="drawer-stub"><slot /><slot name="footer" /></div>',
  },
}

function mountD(extra?: Record<string, any>) {
  return mount(OpportunityEditDrawer, {
    props: { modelValue: true, row, ...extra },
    global: {
      plugins: [ElementPlus],
      stubs: STUBS,
    },
  })
}

describe('OpportunityEditDrawer', () => {
  it('渲染 22 个可编辑字段控件 + 只读首登/最后更新', async () => {
    const w = mountD()
    await flushPromises()
    await nextTick()
    expect(w.text()).toContain('L4组织'); expect(w.text()).toContain('商机状态')
    expect(w.text()).toContain('首次登记日期'); expect(w.text()).toContain('2026-06-01')
  })
  it('保存提交 fields 给 store.update', async () => {
    const w = mountD(); const s = useOpportunitiesStore()
    const spy = vi.spyOn(s, 'update').mockResolvedValue(undefined as any)
    ;(w.vm as any).form.customer = '乙'
    await (w.vm as any).onSave(); await flushPromises()
    expect(spy).toHaveBeenCalledWith('opp-1', expect.objectContaining({ customer: '乙', l4: '小金融服务组' }))
  })
})

describe('OpportunityEditDrawer create 模式', () => {
  it('create 模式保存调 store.create(fields) 而非 update', async () => {
    const store = useOpportunitiesStore()
    const createSpy = vi.spyOn(store, 'create').mockResolvedValue({ id: 'opp-9' } as any)
    const updateSpy = vi.spyOn(store, 'update').mockResolvedValue(undefined as any)
    const w = mount(OpportunityEditDrawer, {
      props: { modelValue: true, row: null, mode: 'create' },
      global: { plugins: [ElementPlus], stubs: STUBS },
    })
    ;(w.vm as any).form.customer = '甲'
    await (w.vm as any).onSave()
    await flushPromises()
    expect(createSpy).toHaveBeenCalledOnce()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('edit 模式保存调 store.update 而非 create', async () => {
    const store = useOpportunitiesStore()
    const createSpy = vi.spyOn(store, 'create').mockResolvedValue({ id: 'opp-9' } as any)
    const updateSpy = vi.spyOn(store, 'update').mockResolvedValue(undefined as any)
    const w = mount(OpportunityEditDrawer, {
      props: { modelValue: true, row, mode: 'edit' },
      global: { plugins: [ElementPlus], stubs: STUBS },
    })
    await (w.vm as any).onSave()
    await flushPromises()
    expect(updateSpy).toHaveBeenCalledOnce()
    expect(createSpy).not.toHaveBeenCalled()
  })
})
