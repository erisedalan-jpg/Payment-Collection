import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashMetrics from './DashMetrics.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); useFilterStore().setPreset('all'); push.mockReset() })

describe('DashMetrics', () => {
  it('渲染六个指标含延期数(流水口径)', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], displayColumns: {}, followupRecords: {},
      projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }],
      projectPmis: {},
      paymentNodes: { P1: [
        { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.6, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
      ] },
      // 流水: P1 实收 800000 (与节点 receivedAmount=600000 刻意不同, 验证流水口径)
      paymentRecords: {
        P1: { total: 800000, count: 1, records: [{ date: '2026-02-10', amount: 800000 }] },
      },
    } as any
    const w = mount(DashMetrics)
    const cards = w.findAll('.dm-card')
    expect(cards.length).toBe(6)
    const text = w.text()
    expect(text).toContain('项目数')
    expect(text).toContain('回款节点')
    expect(text).toContain('延期')
    // 流水口径: totalActual=800000, totalContract=2000000(paymentPmis.contract), rate=40%
    // 分母改为合同总额（非计划 totalExpected=1000000），与节点口径(60%)和旧流水口径(80%)均不同
    expect(text).toContain('40%')
  })

  it('无流水时已回款=0, 完成率=0%', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], displayColumns: {}, followupRecords: {},
      projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }],
      projectPmis: {},
      paymentNodes: { P1: [
        { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.6, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
      ] },
      // 无 paymentRecords => 流水=0
      paymentRecords: {},
    } as any
    const w = mount(DashMetrics)
    const text = w.text()
    expect(text).toContain('0%')
  })

  it('项目数卡=totalAll 且副字含无回款阶段数; 三处下钻正确', async () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], displayColumns: {}, followupRecords: {},
      projects: [
        { projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } },
        { projectId: 'P2', projectName: '乙', projectManager: '李四', orgL4: 'B组', paymentPmis: { contract: 1000000 } },
      ],
      projectPmis: {},
      paymentNodes: {
        P1: [
          { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.6, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
        ],
        P2: [],
      },
      paymentRecords: {
        P1: { total: 800000, count: 1, records: [{ date: '2026-02-10', amount: 800000 }] },
      },
    } as any
    const w = mount(DashMetrics)

    const projectCard = w.findAll('.dm-card').find((c) => c.text().includes('项目数'))
    expect(projectCard).toBeTruthy()
    expect(projectCard!.find('.dm-v').text()).toBe('2') // totalAll

    const sub = projectCard!.find('.dm-sub')
    expect(sub.exists()).toBe(true)
    expect(sub.text()).toContain('无回款阶段')
    expect(sub.text()).toContain('1') // noStageCount

    await w.find('[data-test="pay-projects-card"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/projects')

    await w.find('[data-test="pay-delayed-card"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/projects?riskCategory=回款延期')

    await w.find('[data-test="pay-nodes-card"]').trigger('click')
    expect(push).toHaveBeenCalledWith('/payment/nodes')
  })

  it('可点卡片键盘可达: role/tabindex 齐全, Enter/Space 触发 onCard 下钻', async () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], displayColumns: {}, followupRecords: {},
      projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }],
      projectPmis: {},
      paymentNodes: { P1: [
        { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.6, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
      ] },
      paymentRecords: {
        P1: { total: 800000, count: 1, records: [{ date: '2026-02-10', amount: 800000 }] },
      },
    } as any
    const w = mount(DashMetrics)

    const projectsCard = w.get('[data-test="pay-projects-card"]')
    expect(projectsCard.attributes('role')).toBe('button')
    expect(projectsCard.attributes('tabindex')).toBe('0')

    await projectsCard.trigger('keydown', { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/projects')

    push.mockReset()
    const delayedCard = w.get('[data-test="pay-delayed-card"]')
    await delayedCard.trigger('keydown', { key: ' ' })
    expect(push).toHaveBeenCalledWith('/projects?riskCategory=回款延期')

    // 无 action 的卡片(如「已回款」)不应被赋予 role=button/tabindex
    const paidCard = w.findAll('.dm-card').find((c) => c.text().includes('已回款'))
    expect(paidCard).toBeTruthy()
    expect(paidCard!.attributes('role')).toBeUndefined()
    expect(paidCard!.attributes('tabindex')).toBeUndefined()
  })
})
