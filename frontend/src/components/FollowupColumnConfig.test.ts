import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'

vi.mock('@/lib/followupColumns', () => ({ followupColumnsApi: {} }))
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import FollowupColumnConfig from '@/components/FollowupColumnConfig.vue'

// el-drawer 内容默认 teleport 到 body、且延迟到过渡结束才渲染，导致 w.text()/w.get()
// 找不到内容；el-select 在 jsdom 中会触发递归更新噪声 —— 两者都 stub 掉，
// 参照 ProjectDetailDrawer.test.ts / AdminView.test.ts 的既有模式。
const DrawerStub = {
  name: 'ElDrawer',
  props: ['modelValue', 'title', 'size', 'appendToBody'],
  template: '<div class="drawer-stub"><slot /></div>',
}
const STUBS = {
  ElDrawer: DrawerStub,
  'el-select': { template: '<div class="el-select-stub"></div>', props: ['modelValue'] },
  'el-option': { template: '<div />', props: ['label', 'value'] },
}
function mountIt(table: 'temp' | 'risk' | 'payment_key' | 'opportunity' = 'risk') {
  return mount(FollowupColumnConfig, {
    props: { modelValue: true, table },
    global: { plugins: [ElementPlus], stubs: STUBS },
  })
}

describe('FollowupColumnConfig', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const s = useFollowupColumnsStore()
    s.configs = { temp: [], payment_key: [], opportunity: [],
      risk: [{ key: 'cf-a', label: '责任人', type: 'text', clearOnArchive: false }] } as any
    s.loaded = true
  })

  it('渲染现有列', () => {
    const w = mountIt()
    // 列名走 el-input 的 :model-value 呈现为 DOM property 而非 textContent/attribute，
    // w.text() 断言不了；改为直接读该行 input 的 value（计划原断言在此组件下必假败）。
    const input = w.get('[data-test="fcc-col"] input')
    expect((input.element as HTMLInputElement).value).toBe('责任人')
  })

  it('新增列调用 store.add', async () => {
    const s = useFollowupColumnsStore()
    const spy = vi.spyOn(s, 'add').mockResolvedValue({ key: 'cf-b', label: '截止', type: 'date', clearOnArchive: true })
    const w = mountIt()
    await w.get('[data-test="fcc-new-label"]').setValue('截止')
    await w.get('[data-test="fcc-add"]').trigger('click')
    expect(spy).toHaveBeenCalledWith('risk', '截止', expect.any(String), expect.any(Boolean))
  })
})
