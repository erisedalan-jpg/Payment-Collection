import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import TempFollowupView from './TempFollowupView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'

// V4.0.2:store 现在要的是多实例形状 {instances: [...]}(不再是单实例 {scope,current,archives})。
// 固定 id('inst-t1'/'inst-t2')便于测试断言按实例隔离的持久化 key。
vi.mock('@/lib/tempFollowupApi', () => ({
  tempFollowupApi: {
    get: vi.fn().mockResolvedValue({
      instances: [
        { id: 'inst-t1', name: '事项一', scope: { combinator: 'AND', groups: [
          { combinator: 'AND', conditions: [{ group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] }] },
        ] }, current: {}, archives: [] },
        { id: 'inst-t2', name: '事项二', scope: { combinator: 'AND', groups: [] }, current: {}, archives: [] },
      ],
    }),
    saveScope: vi.fn(), update: vi.fn(), archive: vi.fn(),
    createInstance: vi.fn(), renameInstance: vi.fn(), deleteInstance: vi.fn(),
  },
}))

const projects = [
  { projectId: 'P1', projectName: '项目甲', projectManager: '张三', orgL4: '银行服务组', top1000: '是',
    paymentPmis: { contract: 2_000_000 }, payment: { paymentRatio: 0.4 }, quadrant: 'A' },
  { projectId: 'P2', projectName: '项目乙', projectManager: '李四', orgL4: '小金融服务组', top1000: '否',
    paymentPmis: { contract: 500_000 }, payment: { paymentRatio: 0.1 }, quadrant: 'B' },
]
const projectPmis = {
  P1: { status: { 项目级别: 'P1' }, progress: { 里程碑进度状态: '正常' }, risk: {}, cost: {}, customer: { 最终客户: '客甲' }, team: { AR: 'a', SR: 's' } },
  P2: { status: {}, progress: {}, risk: {}, cost: {}, customer: { 最终客户: '客乙' }, team: {} },
}

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects/temp', component: TempFollowupView },
    { path: '/project/:id', component: { template: '<div/>' } },
  ] })
}

async function mountAs(isSuper: boolean) {
  const data = useDataStore()
  data.data = { projects, projectPmis, paymentNodes: {}, projectMilestones: {} } as any
  const auth = useAuthStore()
  auth.user = { account: isSuper ? 'admin' : 'u1', isSuper, allowedPages: ['*'], allowedL4: ['*'] } as any
  await useTempFollowupStore().load()
  const router = makeRouter(); router.push('/projects/temp'); await router.isReady()
  const w = mount(TempFollowupView, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  return w
}

describe('TempFollowupView', () => {
  // localStorage 在同一测试文件内的多个 it 之间不会自动清空(jsdom 环境按文件复用)，
  // 而新增的迁移/隔离用例互相依赖 colprefs/colsort 的干净起点，故每条用例前清空。
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('按范围命中只显示符合项目(P1 银行服务组),P2 不在范围', async () => {
    const w = await mountAs(true)
    expect(w.text()).toContain('项目甲')
    expect(w.text()).not.toContain('项目乙')
  })

  it('超管见 范围设置/更新/导出 入口', async () => {
    const w = await mountAs(true)
    expect(w.text()).toContain('范围设置')
    expect(w.text()).toContain('更新（归档+清空）')
    expect(w.text()).toContain('导出')
  })

  it('普通管理员无 范围设置/更新/导出 入口', async () => {
    const w = await mountAs(false)
    expect(w.text()).not.toContain('范围设置')
    expect(w.text()).not.toContain('更新（归档+清空）')
    expect(w.text()).not.toContain('导出')
  })

  it('默认列含项目编号,默认隐藏 健康度(额外列)', async () => {
    const w = await mountAs(true)
    expect(w.text()).toContain('项目编号')
    expect(w.text()).not.toContain('健康度')
  })

  // 下钻返回保持视图状态(V2.5.9)：菜单进入(新挂载)应清空本表残留列筛选
  // V4.0.2:表 key 带上实例 id('temp-followup:{instanceId}')，故按当前激活实例(mock 固定为 inst-t1)的 key 断言。
  it('挂载时清空 temp-followup:{instanceId} 列筛选（菜单=重置）', async () => {
    const cf = useCrossFilterStore()
    cf.setColumnFilter('temp-followup:inst-t1', 'orgL4', ['银行服务组'], 5)
    expect(cf.tableFilters('temp-followup:inst-t1').orgL4).toBeDefined()
    await mountAs(true)
    expect(cf.tableFilters('temp-followup:inst-t1').orgL4).toBeUndefined()
  })

  // V2.6.3:分页 + 总数(同 /projects)
  it('S1:>50 行触发分页,总数与渲染行数受控', async () => {
    const data = useDataStore()
    const many = Array.from({ length: 51 }, (_, i) => ({
      projectId: `P${i}`, projectName: `项目${i}`, projectManager: '张三', orgL4: '银行服务组', top1000: '是',
      paymentPmis: { contract: 2_000_000 }, payment: { paymentRatio: 0.4 }, quadrant: 'A',
    }))
    const manyPmis = Object.fromEntries(many.map((p) => [p.projectId,
      { status: {}, progress: {}, risk: {}, cost: {}, customer: { 最终客户: '客' }, team: {} }]))
    data.data = { projects: many, projectPmis: manyPmis, paymentNodes: {}, projectMilestones: {} } as any
    const auth = useAuthStore()
    auth.user = { account: 'admin', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] } as any
    await useTempFollowupStore().load()
    const router = makeRouter(); router.push('/projects/temp'); await router.isReady()
    const w = mount(TempFollowupView, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.text()).toContain('共 51 条')
    expect(w.text()).toContain('合同金额合计')
    expect(w.find('.el-pagination').exists()).toBe(true)
    expect(w.findAll('.el-table__body-wrapper tbody tr').length).toBeLessThanOrEqual(50)
  })

  describe('V4.0.1 三个日期列', () => {
    // V4.0.2:ALL_COLUMNS/prefs/FILTERABLE 随表格区一起抽进了 TempInstancePanel 子组件，
    // 父组件 defineExpose 不再暴露它们 —— 断言改到子组件实例上找，不削弱断言本身。
    it('立项日期/计划终验/实际终验已登记为可选列', async () => {
      const w = await mountAs(true)
      const panel = w.findComponent({ name: 'TempInstancePanel' })
      const cols = (panel.vm as any).ALL_COLUMNS as { key: string; label: string }[]
      const byKey = Object.fromEntries(cols.map((c) => [c.key, c]))
      expect(byKey['setupDate']?.label).toBe('立项日期')
      expect(byKey['plannedFinalAcceptDate']?.label).toBe('计划终验时间')
      expect(byKey['actualFinalAcceptDate']?.label).toBe('实际终验时间')
    })

    it('三列默认隐藏(属额外可选列)', async () => {
      const w = await mountAs(true)
      const panel = w.findComponent({ name: 'TempInstancePanel' })
      const visible = (panel.vm as any).prefs.visibleKeys.value as string[]
      expect(visible).not.toContain('setupDate')
      expect(visible).not.toContain('plannedFinalAcceptDate')
      expect(visible).not.toContain('actualFinalAcceptDate')
    })

    it('三列可筛', async () => {
      const w = await mountAs(true)
      const panel = w.findComponent({ name: 'TempInstancePanel' })
      const F = (panel.vm as any).FILTERABLE as Set<string>
      expect(F.has('setupDate')).toBe(true)
      expect(F.has('plannedFinalAcceptDate')).toBe(true)
      expect(F.has('actualFinalAcceptDate')).toBe(true)
    })

    it('三列都能排序(withSortable 自动赋予,不需手写)', async () => {
      const w = await mountAs(true)
      const panel = w.findComponent({ name: 'TempInstancePanel' })
      const cols = (panel.vm as any).ALL_COLUMNS as { key: string; sortable?: boolean }[]
      for (const k of ['setupDate', 'plannedFinalAcceptDate', 'actualFinalAcceptDate']) {
        expect(cols.find((c) => c.key === k)!.sortable).toBe(true)
      }
    })
  })

  describe('V4.0.2 多实例', () => {
    it('渲染实例选项卡,点击可切换', async () => {
      const w = await mountAs(true)
      const tabs = w.findAll('[data-test="temp-inst-tab"]')
      expect(tabs.length).toBeGreaterThanOrEqual(2)
      await tabs[1].trigger('click')
      const store = useTempFollowupStore()
      expect(store.activeId).toBe(store.instances[1].id)
    })

    it('新建/重命名/删除入口仅超管可见', async () => {
      const wSuper = await mountAs(true)
      expect(wSuper.find('[data-test="temp-inst-new"]').exists()).toBe(true)
      const wNormal = await mountAs(false)
      expect(wNormal.find('[data-test="temp-inst-new"]').exists()).toBe(false)
    })

    it('切换实例会重建面板 —— 这是列配置按实例隔离的前提', async () => {
      const w = await mountAs(true)
      const uidBefore = w.findComponent({ name: 'TempInstancePanel' }).vm.$.uid
      await w.findAll('[data-test="temp-inst-tab"]')[1].trigger('click')
      await nextTick()
      const uidAfter = w.findComponent({ name: 'TempInstancePanel' }).vm.$.uid
      expect(uidAfter).not.toBe(uidBefore)   // 组件实例确实换了,不是复用
    })

    it('列配置按实例隔离:在 A 实例改列不写到 B 的 key', async () => {
      const w = await mountAs(true)
      const store = useTempFollowupStore()
      const a = store.instances[0].id
      const b = store.instances[1].id
      expect(a).not.toBe(b)
      const panel = w.findComponent({ name: 'TempInstancePanel' })
      ;(panel.vm as any).prefs.toggle('setupDate')
      expect(localStorage.getItem(`colprefs:admin:temp-followup:${a}`)).toBeTruthy()
      expect(localStorage.getItem(`colprefs:admin:temp-followup:${b}`)).toBeNull()
    })

    it('升级路径:旧 key 的选列/排序迁移到第一个实例', async () => {
      // 预置 V4.0.1 及以前的持久化(不带 instanceId)。mountAs(true) 下 account 固定为 'admin'
      // (见文件顶部 mountAs：isSuper ? 'admin' : 'u1')，userScopedKey 据此拼 key，故用 'admin' 而非 'anon'。
      localStorage.setItem('colprefs:admin:temp-followup', JSON.stringify(['projectId', 'customer', 'setupDate']))
      localStorage.setItem('colsort:admin:temp-followup', JSON.stringify({ prop: 'contractWan', order: 'descending' }))
      const w = await mountAs(true)
      const store = useTempFollowupStore()
      const first = store.instances[0].id
      expect(JSON.parse(localStorage.getItem(`colprefs:admin:temp-followup:${first}`)!))
        .toEqual(['projectId', 'customer', 'setupDate'])
      const panel = w.findComponent({ name: 'TempInstancePanel' })
      expect((panel.vm as any).prefs.visibleKeys.value).toContain('setupDate')
    })

    it('迁移只跑一次:标记位存在后不再覆盖用户新改的配置', async () => {
      localStorage.setItem('colprefs:admin:temp-followup', JSON.stringify(['projectId']))
      await mountAs(true)
      const store = useTempFollowupStore()
      const first = store.instances[0].id
      // 用户之后自己改了列
      localStorage.setItem(`colprefs:admin:temp-followup:${first}`, JSON.stringify(['projectName', 'orgL4']))
      await mountAs(true)
      expect(JSON.parse(localStorage.getItem(`colprefs:admin:temp-followup:${first}`)!))
        .toEqual(['projectName', 'orgL4'])
    })
  })
})
