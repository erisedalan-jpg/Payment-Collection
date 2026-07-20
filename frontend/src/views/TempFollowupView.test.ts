import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import TempFollowupView from './TempFollowupView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'

vi.mock('@/lib/tempFollowupApi', () => ({
  tempFollowupApi: {
    get: vi.fn().mockResolvedValue({ scope: { combinator: 'AND', groups: [
      { combinator: 'AND', conditions: [{ group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] }] },
    ] }, current: {}, archives: [] }),
    saveScope: vi.fn(), update: vi.fn(), archive: vi.fn(),
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
  beforeEach(() => setActivePinia(createPinia()))

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
  it('挂载时清空 temp-followup 列筛选（菜单=重置）', async () => {
    const cf = useCrossFilterStore()
    cf.setColumnFilter('temp-followup', 'orgL4', ['银行服务组'], 5)
    expect(cf.tableFilters('temp-followup').orgL4).toBeDefined()
    await mountAs(true)
    expect(cf.tableFilters('temp-followup').orgL4).toBeUndefined()
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
    it('立项日期/计划终验/实际终验已登记为可选列', async () => {
      const w = await mountAs(true)
      const cols = (w.vm as any).ALL_COLUMNS as { key: string; label: string }[]
      const byKey = Object.fromEntries(cols.map((c) => [c.key, c]))
      expect(byKey['setupDate']?.label).toBe('立项日期')
      expect(byKey['plannedFinalAcceptDate']?.label).toBe('计划终验时间')
      expect(byKey['actualFinalAcceptDate']?.label).toBe('实际终验时间')
    })

    it('三列默认隐藏(属额外可选列)', async () => {
      const w = await mountAs(true)
      const visible = (w.vm as any).prefs.visibleKeys.value as string[]
      expect(visible).not.toContain('setupDate')
      expect(visible).not.toContain('plannedFinalAcceptDate')
      expect(visible).not.toContain('actualFinalAcceptDate')
    })

    it('三列可筛', async () => {
      const w = await mountAs(true)
      const F = (w.vm as any).FILTERABLE as Set<string>
      expect(F.has('setupDate')).toBe(true)
      expect(F.has('plannedFinalAcceptDate')).toBe(true)
      expect(F.has('actualFinalAcceptDate')).toBe(true)
    })

    it('三列都能排序(withSortable 自动赋予,不需手写)', async () => {
      const w = await mountAs(true)
      const cols = (w.vm as any).ALL_COLUMNS as { key: string; sortable?: boolean }[]
      for (const k of ['setupDate', 'plannedFinalAcceptDate', 'actualFinalAcceptDate']) {
        expect(cols.find((c) => c.key === k)!.sortable).toBe(true)
      }
    })
  })
})
