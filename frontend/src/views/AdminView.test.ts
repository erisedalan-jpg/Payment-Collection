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
      { account: 'boss', displayName: '超管', isSuper: true, allowedPages: ['*'], allowedL4: ['*'], allowedStaff: [], mustChangePassword: false },
      { account: 'liu', displayName: '老刘', isSuper: false, allowedPages: ['projects'], allowedL4: ['北京'], allowedStaff: ['E001'], mustChangePassword: true },
    ])
    vi.mocked(adminApi.listRoster).mockResolvedValue([
      { id: 'E001', name: '张三', l4: '北京组' },
      { id: 'E002', name: '张三', l4: '上海组' },   // 与 E001 同名 → 消歧
      { id: 'E003', name: '李四', l4: '北京组' },
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

  it('非超管未改密行显示「首次须改密」徽标', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const badge = wrapper.find('.pw-must')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('首次须改密')
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

  it('员工选择器按姓名展示、同名附工号消歧', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const opts = (wrapper.vm as any).staffOptions
    expect(opts).toContainEqual({ value: 'E003', label: '李四' })            // 唯一姓名只显姓名
    expect(opts).toContainEqual({ value: 'E001', label: '张三（E001）' })     // 同名附工号
    expect(opts).toContainEqual({ value: 'E002', label: '张三（E002）' })
  })

  it('可见范围列按姓名展示员工(非工号)', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    expect(wrapper.text()).toContain('张三')      // liu 的 allowedStaff=['E001'] → 显示「张三」
    expect(wrapper.text()).not.toContain('E001')  // 不显示原始工号
  })

  it('提交新建携带 allowedStaff(工号)', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'emp'
    vm.form.password = 'pw12345'
    vm.form.displayName = '员工'
    vm.form.allowedPages = ['yitian']
    vm.form.allowedL4 = []
    vm.form.allowedStaff = ['E001', 'E003']
    await vm.submitForm()
    await flushPromises()
    expect(adminApi.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ allowedStaff: ['E001', 'E003'] }),
    )
  })

  it('分域覆盖:启用域 → 载荷含 domainScopes(商机 staff 强制空)', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'dm'
    vm.form.password = 'pw12345'
    vm.form.displayName = '分域'
    vm.form.allowedPages = ['*']
    vm.form.allowedL4 = ['*']
    vm.form.domainOverrides.yitian = { enabled: true, l4: ['Dx'], staff: ['E001'] }
    vm.form.domainOverrides.opportunity = { enabled: true, l4: ['D2'], staff: ['E001'] }
    await vm.submitForm()
    await flushPromises()
    const payload = vi.mocked(adminApi.createAccount).mock.calls[0][0] as any
    expect(payload.domainScopes).toEqual({
      yitian: { l4: ['Dx'], staff: ['E001'] },
      opportunity: { l4: ['D2'], staff: [] },   // 商机 staff 强制空
    })
    expect(payload.domainScopes.project).toBeUndefined()   // 未启用的域不入载荷
  })
})
