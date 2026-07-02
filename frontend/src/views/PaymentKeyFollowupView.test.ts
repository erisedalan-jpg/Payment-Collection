import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import PaymentKeyFollowupView from './PaymentKeyFollowupView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { usePaymentKeyFollowupStore } from '@/stores/paymentKeyFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'

vi.mock('@/lib/paymentKeyFollowupApi', () => ({
  paymentKeyFollowupApi: {
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
    { path: '/payment/key', component: PaymentKeyFollowupView },
    { path: '/project/:id', component: { template: '<div/>' } },
  ] })
}

async function mountAs(isSuper: boolean) {
  const data = useDataStore()
  data.data = { projects, projectPmis, paymentNodes: {}, projectMilestones: {} } as any
  const auth = useAuthStore()
  auth.user = { account: isSuper ? 'admin' : 'u1', isSuper, allowedPages: ['*'], allowedL4: ['*'] } as any
  await usePaymentKeyFollowupStore().load()
  const router = makeRouter(); router.push('/payment/key'); await router.isReady()
  const w = mount(PaymentKeyFollowupView, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  return w
}

describe('PaymentKeyFollowupView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('按范围命中只显示符合项目(P1 银行服务组),P2 不在范围', async () => {
    const w = await mountAs(true)
    expect(w.text()).toContain('项目甲')
    expect(w.text()).not.toContain('项目乙')
  })

  it('默认列含 9 列(含跟进动作/rev结论/下次rev时间),默认隐藏回款完成率(额外列)', async () => {
    const w = await mountAs(true)
    expect(w.text()).toContain('项目编号')
    expect(w.text()).toContain('项目名称')
    expect(w.text()).toContain('项目经理')
    expect(w.text()).toContain('L4组织')
    expect(w.text()).toContain('项目级别')
    expect(w.text()).toContain('合同金额(万)')
    expect(w.text()).toContain('跟进动作')
    expect(w.text()).toContain('rev结论')
    expect(w.text()).toContain('下次rev时间')
    expect(w.text()).not.toContain('回款完成率')
  })

  it('无范围(空 scope)时空态文案', async () => {
    const { paymentKeyFollowupApi } = await import('@/lib/paymentKeyFollowupApi')
    vi.mocked(paymentKeyFollowupApi.get).mockResolvedValueOnce({ scope: { combinator: 'AND', groups: [] }, current: {}, archives: [] } as any)
    const w = await mountAs(true)
    expect(w.text()).toContain('请点击「范围设置」定义回款重点跟进范围。')
  })

  it('普通管理员空 scope 空态文案不同', async () => {
    const { paymentKeyFollowupApi } = await import('@/lib/paymentKeyFollowupApi')
    vi.mocked(paymentKeyFollowupApi.get).mockResolvedValueOnce({ scope: { combinator: 'AND', groups: [] }, current: {}, archives: [] } as any)
    const w = await mountAs(false)
    expect(w.text()).toContain('暂无回款重点跟进项目。')
  })

  it('超管见 范围设置/归档（留存跟进）/导出 入口', async () => {
    const w = await mountAs(true)
    expect(w.text()).toContain('范围设置')
    expect(w.text()).toContain('归档（留存跟进）')
    expect(w.text()).toContain('导出')
  })

  it('普通管理员无 范围设置/归档/导出 入口', async () => {
    const w = await mountAs(false)
    expect(w.text()).not.toContain('范围设置')
    expect(w.text()).not.toContain('归档（留存跟进）')
    expect(w.text()).not.toContain('导出')
  })

  it('行点击跳转项目详情', async () => {
    const w = await mountAs(true)
    const router = (w.vm as any).$router
    const pushSpy = vi.spyOn(router, 'push')
    await w.find('tbody tr').trigger('click')
    expect(pushSpy).toHaveBeenCalledWith('/project/P1')
  })

  // 下钻返回保持视图状态(V2.5.9)：菜单进入(新挂载)应清空本表残留列筛选
  it('挂载时清空 payment-key 列筛选（菜单=重置）', async () => {
    const cf = useCrossFilterStore()
    cf.setColumnFilter('payment-key', 'orgL4', ['银行服务组'], 5)
    expect(cf.tableFilters('payment-key').orgL4).toBeDefined()
    await mountAs(true)
    expect(cf.tableFilters('payment-key').orgL4).toBeUndefined()
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
    await usePaymentKeyFollowupStore().load()
    const router = makeRouter(); router.push('/payment/key'); await router.isReady()
    const w = mount(PaymentKeyFollowupView, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.text()).toContain('共 51 条')
    expect(w.find('.el-pagination').exists()).toBe(true)
    expect(w.findAll('.el-table__body-wrapper tbody tr').length).toBeLessThanOrEqual(50)
  }, 20000) // 渲染满页(51行)重表,并行争用下放宽超时
})
