import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import AdminView from './AdminView.vue'
import * as adminApi from '@/lib/admin'

vi.mock('@/lib/admin')

// el-select/el-option 在 jsdom 中打开 dialog 时会触发递归更新/注入缺失，stub 掉避免该问题
// 测试以驱动 vm 暴露的方法/响应式状态 + 断言 API 调用为主
const STUBS = {
  teleport: true,
  'el-select': { template: '<div class="el-select-stub"></div>', props: ['modelValue', 'multiple', 'filterable', 'placeholder'] },
  'el-option': { template: '<div />', props: ['label', 'value'] },
}

describe('AdminView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.mocked(adminApi.listAccounts).mockResolvedValue([
      { account: 'boss', displayName: '超管', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] },
      { account: 'liu', displayName: '老刘', isSuper: false, allowedPages: ['projects'], allowedL4: ['北京'] },
    ])
  })

  it('挂载拉取并渲染账号行', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    expect(adminApi.listAccounts).toHaveBeenCalled()
    expect(wrapper.text()).toContain('boss')
    expect(wrapper.text()).toContain('老刘')
  })

  it('点新建打开弹窗', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const btn = wrapper.find('[data-test="admin-create"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).dialogVisible).toBe(true)
  })

  it('提交新建调用 createAccount 并重拉', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'newbie'
    vm.form.password = 'pw12345'
    vm.form.displayName = '新人'
    vm.form.allowedPages = ['projects']
    vm.form.allowedL4 = ['上海']
    await vm.submitForm()
    await flushPromises()
    expect(adminApi.createAccount).toHaveBeenCalledWith(expect.objectContaining({ account: 'newbie', allowedL4: ['上海'] }))
    expect(adminApi.listAccounts).toHaveBeenCalledTimes(2)
  })
})
