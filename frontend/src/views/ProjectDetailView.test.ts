import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ProjectDetailView from './ProjectDetailView.vue'
import { useDataStore } from '@/stores/data'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/projects', component: { template: '<div />' } },
      { path: '/project/:id', component: ProjectDetailView },
    ],
  })
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    rawNodes: [
      { projectId: 'P-1', nodeName: '初验款', planDate: '2026-03-31', expectedPayment: 500000, actualPayment: 0, nodeStatus: '延期', delayDays: 30, tier: '50-100万', isPaymentRelated: true, expectedMilestoneDate: '2026-03-01', isMilestoneAchieved: '否', completionStatus: '未到期' },
      { projectId: 'OLD-9', nodeName: '终验款', planDate: '2024-01-01', expectedPayment: 200000, actualPayment: 200000, nodeStatus: '已全额回款', tier: '50万以下', isPaymentRelated: true },
    ],
    projects: [
      { projectId: 'P-1', projectName: '终端安全项目', projectManager: '何平', orgL4: 'A组', isPresale: false, relatedClosedId: '',
        payment: { relatedNodeCount: 1, expectedTotal: 500000, actualTotal: 0, remainingTotal: 500000, paymentRatio: 0, delayedCount: 1 },
        deliveryCosts: [{ 类别: '内部人员成本', 预算金额: 122641.51, 实际发生: 0.0, 剩余预算: 122641.51, 消耗率: 0.0 }],
        health: { overall: '风险' } },
      { projectId: 'P-2', projectName: '售前服务-某局', projectManager: '李四', orgL4: 'B组', isPresale: true, relatedClosedId: 'OLD-9',
        payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '关注' } },
    ],
    projectPmis: {
      'P-1': {
        progress: { 完工进展: 0.2, 里程碑进度状态: '延期', 项目阶段: '项目执行', 计划终验: '2028-01-31' },
        status: { 项目状态: '实施中', 是否暂停: true, 评级: 'C' },
        cost: { 总预算: 654051.9, 核算: 208745.13, 剩余预算: 445306.77, 消耗比: 0.319, 超支: false, 成本状态: '正常' },
        risk: { 未关闭风险数: 1, 风险记录数: 2, 最高等级: '中', 闭环率: 0.5 },
        customer: { 最终客户: '海聚博源', 合同总额: 5276000.0 },
        riskRecords: [
          { 风险编码: 'FX-1', 风险名称: '工期风险', 风险等级: '中', 风险状态: '已识别', 风险大类: '进度', 识别日期: '2025-09-19T00:00:00', 计划应对完成日期: '2025-10-01T00:00:00', 实际应对完成日期: null, 是否超期: '否', 责任人: '何平' },
        ],
      },
      'OLD-9': { source: '已关闭', team: { 项目名称: '某局一期', 项目经理: '王五' }, customer: { 最终客户: '某局', 合同总额: 1000000 }, status: { 项目状态: '已验收' }, progress: { 项目阶段: '项目收尾', 完工进展: 1 } },
    },
    events: [
      { date: '2026-06-11', type: '到账', domain: 'payment', projectId: 'P-1', projectName: '终端安全项目', summary: '「初验款」到账 25 万' },
      { date: '2026-06-10', type: '阶段变更', domain: 'project', projectId: 'P-9', projectName: '他人项目', summary: '不应出现' },
    ],
  } as any
}

async function mountAt(path: string) {
  await router.push(path)
  await router.isReady()
  const w = mount(ProjectDetailView, {
    global: { plugins: [ElementPlus, router], stubs: { FollowupRecords: true } },
  })
  await flushPromises()
  return w
}

describe('ProjectDetailView', () => {
  it('头部+指标条+默认回款 tab(节点表/汇总/跟进记录)', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    expect(w.text()).toContain('终端安全项目')
    expect(w.text()).toContain('海聚博源')
    expect(w.text()).toContain('已暂停')      // 是否暂停=true 徽章
    expect(w.text()).toContain('评级 C')
    expect(w.text()).toContain('项目执行')
    expect(w.find('.health-badge').text()).toBe('风险')
    expect(w.text()).toContain('初验款')       // 节点明细
    expect(w.text()).toContain('延期节点')     // 回款汇总 chip
    expect(w.findComponent({ name: 'FollowupRecords' }).exists()).toBe(true)
  })

  it('进度里程碑 tab:指标chips+里程碑明细表(P5.5)', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '进度里程碑')!.trigger('click')
    expect(w.text()).toContain('里程碑明细')
    expect(w.text()).toContain('初验款')
    expect(w.text()).toContain('未到期')
    expect(w.text()).toContain('2026-03-01')
  })

  it('切风险 tab 显示聚合与明细行', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '风险')!.trigger('click')
    expect(w.text()).toContain('工期风险')
    expect(w.text()).toContain('2025-09-19') // fmtDateCell 截断
    expect(w.text()).toContain('未关闭风险')
  })

  it('切预算核算 tab 显示成本汇总与明细', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '预算核算')!.trigger('click')
    expect(w.text()).toContain('内部人员成本')
    expect(w.text()).toContain('总预算(万)')
  })

  it('售前整合项目：原项目 tab 展示已关闭信息与原项目回款节点', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    const originTab = w.findAll('.pd-tab').find((b) => b.text() === '原项目')
    expect(originTab).toBeTruthy()
    await originTab!.trigger('click')
    expect(w.text()).toContain('某局一期')
    expect(w.text()).toContain('OLD-9')
    expect(w.text()).toContain('终验款')
    expect(w.text()).toContain('不计入当前')
  })

  it('非售前项目不显示原项目 tab', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    expect(w.findAll('.pd-tab').some((b) => b.text() === '原项目')).toBe(false)
  })

  it('路由参数变化(同组件复用) → tab 重置为回款', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    await w.findAll('.pd-tab').find((b) => b.text() === '原项目')!.trigger('click')
    expect(w.find('.pd-tab.active').text()).toBe('原项目')
    await router.push('/project/P-1')
    await flushPromises()
    expect(w.find('.pd-tab.active').text()).toBe('回款')
    expect(w.text()).toContain('初验款')
  })

  it('未知 id → 404 空态 + 返回清单链接', async () => {
    seed()
    const w = await mountAt('/project/NOPE')
    expect(w.text()).toContain('未找到该项目')
    const link = w.find('a[href="/projects"]')
    expect(link.exists()).toBe(true)
  })

  it('右栏只显示本项目动态', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    expect(w.find('.pd-aside').exists()).toBe(true)
    expect(w.text()).toContain('「初验款」到账 25 万')
    expect(w.text()).not.toContain('不应出现')
  })

  it('本项目无事件 → 右栏空态', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    expect(w.find('.pd-aside').text()).toContain('暂无该项目动态')
  })
})
