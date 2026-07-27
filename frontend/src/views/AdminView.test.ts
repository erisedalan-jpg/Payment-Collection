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

  it('例外只写 pageScopes(商机 staff 恒空),不再有域目标', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'pp'; vm.form.password = 'pw12345'; vm.form.displayName = 'P'
    vm.form.allowedPages = ['*']; vm.form.allowedL4 = ['*']
    vm.form.overrides = [
      { target: 'temp-followup', l4: ['Dp'], staff: [] },
      { target: 'opportunities-progress', l4: ['Do'], staff: ['E9'] },
    ]
    await vm.submitForm(); await flushPromises()
    const p = vi.mocked(adminApi.createAccount).mock.calls[0][0] as any
    expect(p.domainScopes).toBeUndefined()
    expect(p.pageScopes['temp-followup']).toEqual({ l4: ['Dp'], staff: [] })
    expect(p.pageScopes['opportunities-progress']).toEqual({ l4: ['Do'], staff: [] })
  })

  it('例外目标下拉只列已勾选、有数据域、非 governance 的页', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.allowedPages = ['insight-costdetail', 'budget', 'governance']
    const vals = vm.overrideTargets.map((t: any) => t.value)
    expect(vals).toEqual(['insight-costdetail'])   // budget 无数据域;governance 沿既有语义排除
  })

  it('孤儿例外在提交时被丢弃(取消勾选该页后)', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'o'; vm.form.password = 'pw12345'; vm.form.displayName = 'O'
    vm.form.allowedPages = ['projects']
    vm.form.overrides = [
      { target: 'projects', l4: ['D1'], staff: [] },
      { target: 'temp-followup', l4: ['D2'], staff: [] },   // 未勾选 → 孤儿
    ]
    await vm.submitForm(); await flushPromises()
    const p = vi.mocked(adminApi.createAccount).mock.calls[0][0] as any
    expect(Object.keys(p.pageScopes)).toEqual(['projects'])
  })

  it('编辑存量账号:pageScopes 非空则高级区强制展开', async () => {
    // 直接给 openEdit 传字面量,不经 accounts —— 若写成 `vm.accounts?.[0] ?? {兜底对象}`,
    // accounts 没加载时会退到兜底对象、测试照样绿,等于什么都没验证。
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    expect(vm.advancedOpen).toBe(false)          // 新建默认折叠
    vm.openEdit({
      account: 'x', displayName: 'X', isSuper: false, allowedPages: ['projects'],
      allowedL4: ['北京'], allowedStaff: [], pageScopes: { projects: { l4: ['D1'], staff: [] } },
    })
    expect(vm.advancedOpen).toBe(true)           // 有存量例外 → 展开
    expect(vm.form.overrides).toEqual([{ target: 'projects', l4: ['D1'], staff: [] }])

    vm.openEdit({                                 // 反向:无例外 → 保持折叠
      account: 'y', displayName: 'Y', isSuper: false, allowedPages: ['projects'],
      allowedL4: ['北京'], allowedStaff: [], pageScopes: {},
    })
    expect(vm.advancedOpen).toBe(false)
  })

  it('空范围提示:已勾有数据域的页但范围为空 → 列出该页', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.allowedPages = ['projects', 'budget']
    vm.form.allowedL4 = []
    vm.form.allowedStaff = []
    expect(vm.emptyScopePages).toContain('在建项目')
    expect(vm.emptyScopePages).not.toContain('概算工具')   // 无数据域,不该被拦
  })

  it('组级选页:勾选一组写入该组全部 pageKey', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    // V4.4.7:组 key 由大写常量(PAYMENT)改为 NAV_SECTIONS 的 section id(payment),与侧栏同源。
    vm.toggleGroup('payment', true)
    expect(vm.form.allowedPages).toEqual(expect.arrayContaining(['payment', 'payment-projects', 'payment-nodes']))
  })

  it('组级选页:勾选「项目」组连带写入 4 个 tab 页(承重点① —— 展开容器入口)', async () => {
    // sectionPageLinks 把「项目分析」容器入口展开成其下 4 个 tab 页;
    // 若 NAV_GROUPS 改回按侧栏 NavLink 派生,这 4 页会在配置界面整个消失、无法勾选。
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.toggleGroup('project', true)
    expect(vm.form.allowedPages).toEqual(expect.arrayContaining([
      'overview', 'projects', 'projects-closed', 'activity',
      'insight', 'insight-milestone', 'insight-costdetail', 'insight-risk',
    ]))
  })

  it('单页勾选:只加该页,不带出同组其它页(用户诉求「只看成本分析」)', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.togglePage('insight-costdetail', true)
    expect(vm.form.allowedPages).toEqual(['insight-costdetail'])
  })

  it('组复选框三态:空 / 半选 / 全选', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    expect(vm.groupChecked('project')).toBe(false)
    expect(vm.groupIndeterminate('project')).toBe(false)

    vm.togglePage('insight-costdetail', true)          // 半选
    expect(vm.groupChecked('project')).toBe(false)
    expect(vm.groupIndeterminate('project')).toBe(true)

    vm.toggleGroup('project', true)                    // 全选
    expect(vm.groupChecked('project')).toBe(true)
    expect(vm.groupIndeterminate('project')).toBe(false)
  })

  it('单页取消:整组已选时取消一页 → 组变半选', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.toggleGroup('payment', true)
    vm.togglePage('payment-nodes', false)
    expect(vm.groupChecked('payment')).toBe(false)
    expect(vm.groupIndeterminate('payment')).toBe(true)
    expect(vm.form.allowedPages).not.toContain('payment-nodes')
  })

  it('模板渲染出组内单页复选框(不止 7 个组标题)', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    await flushPromises()
    // 30 个页面 + 6 个组标题 + 1 个「全部页面」= 37;断言下界防「只渲染组标题」的回退。
    // 这条专防「函数写了但模板没接线」—— 光有 togglePage 而模板仍只渲染 7 个组标题时,
    // 上面三条 vm 层测试全绿,只有这条会红。
    expect(wrapper.findAll('.el-checkbox').length).toBeGreaterThanOrEqual(30)
  })
})

describe('V4.4.8 页头', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(adminApi.listAccounts).mockResolvedValue([])
    vi.mocked(adminApi.listRoster).mockResolvedValue([])
  })

  it('渲染页头标题', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    expect(wrapper.find('.ph-title').text()).toBe('账号管理')
  })

  it('「新建账号」留在原地,页头 #actions 为空', async () => {
    // 本页操作按钮本期不搬(见 plan Task 7 对照表)。
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    expect(wrapper.find('.ph-actions').text()).toBe('')
    expect(wrapper.find('.admin-head [data-test="admin-create"]').exists()).toBe(true)
  })
})
