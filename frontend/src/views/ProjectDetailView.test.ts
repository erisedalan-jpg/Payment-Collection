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
    projectMilestones: {
      'P-1': [
        { name: '到货', planDate: '2026-06-19', actualDate: '', payStage: '到货款1，70.00%', pct: null, priority: 'high' },
        { name: '终验', planDate: '2026-07-01', actualDate: '', payStage: '', pct: null, priority: 'high' },
        { name: '项目关闭', planDate: '2026-08-01', actualDate: '', payStage: '', pct: null, priority: 'mid' },
      ],
      'OLD-9': [
        { name: '服务完成', planDate: '2024-01-01', actualDate: '2024-01-02', payStage: '', pct: null, priority: 'high' },
      ],
    },
    paymentRecords: {
      'P-1': { total: 3250, count: 2, lastDate: '2026-06-04', records: [
        { type: '实际回款', serial: 'BANK-1', payer: '某公司', amount: 2250, date: '2026-06-04', claimer: '马春艳', orderNo: 'N-1', currency: 'CNY', rate: 1, note: '' },
        { type: '实际回款', serial: 'BANK-2', payer: '某公司', amount: 1000, date: '2026-05-27', claimer: '赵岩', orderNo: 'N-2', currency: 'USD', rate: 7.1, note: '' },
      ] },
    },
    projectProfit: {
      'P-1': { summary: { 预算收入: 1000000, 预算成本: 600000, 实际成本: 200000, 成本消耗率: 0.33, 预算毛利: 400000, 实际毛利: 100000, 预算毛利率: 0.4, 剩余预算: 400000 },
        rows: [
          { code: '1', name: '项目收入', level: 1, budget: 1000000, estimate: 900000, final: 950000, actual: 0, remaining: 1000000, rate: 0 },
          { code: '2.1', name: '产品、商品成本', level: 2, budget: 100000, estimate: null, final: null, actual: 50000, remaining: 50000, rate: 0.5 },
          { code: '2.1.1', name: '自有产品成本', level: 3, budget: 80000, estimate: null, final: null, actual: 40000, remaining: 40000, rate: 0.5 },
          { code: '2.3', name: '人工成本', level: 2, budget: 200000, estimate: null, final: null, actual: 0, remaining: 200000, rate: 0 },
          { code: '2.3.2', name: '交付部门人工成本', level: 3, budget: 150000, estimate: null, final: null, actual: 0, remaining: 150000, rate: 0 },
        ], bridge: null },
      'P-2': { summary: { 预算收入: null, 预算成本: null, 实际成本: null, 成本消耗率: null, 预算毛利: null, 实际毛利: null, 预算毛利率: null, 剩余预算: null },
        rows: [], bridge: { ssId: 'OLD-9', summary: { 预算收入: 500000, 预算成本: 300000, 预算毛利: 200000, 预算毛利率: 0.4, 实际成本: 250000 },
          rows: [{ code: '1', name: '项目收入', level: 1, budget: 500000, estimate: null, final: null, actual: 0, remaining: 500000, rate: 0 }] } },
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

  it('进度里程碑 tab:项目里程碑三色表+回款里程碑保留(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '进度里程碑')!.trigger('click')
    expect(w.text()).toContain('初验款')
    expect(w.text()).toContain('未到期')
    expect(w.text()).toContain('2026-03-01')
    expect(w.text()).toContain('项目里程碑')
    expect(w.text()).toContain('到货款1，70.00%')
    expect(w.text()).toContain('回款里程碑')
  })

  it('回款数据 tab:流水汇总 chips+明细表+非 CNY 汇率(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '回款数据')!.trigger('click')
    expect(w.text()).toContain('累计回款(万)')
    expect(w.text()).toContain('BANK-1')
    expect(w.text()).toContain('马春艳')
    expect(w.text()).toContain('USD(汇率 7.1)')
  })

  it('回款数据 tab:无流水显示未提供空态(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    await w.findAll('.pd-tab').find((b) => b.text() === '回款数据')!.trigger('click')
    expect(w.text()).toContain('未提供回款流水数据')
  })

  it('预算核算 tab:全预算汇总+科目树(默认展开 2.3 折叠 2.1)+PMIS/delivery 保留(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '预算核算')!.trigger('click')
    expect(w.text()).toContain('预算收入(万)')
    expect(w.text()).toContain('交付部门人工成本')      // 2.3.2 默认可见
    expect(w.text()).not.toContain('自有产品成本')       // 2.1.1 默认折叠
    expect(w.text()).toContain('概算')
    expect(w.text()).toContain('内部人员成本')           // delivery 明细保留
    expect(w.text()).toContain('总预算(万)')             // PMIS 汇总保留
  })

  it('售前项目预算核算 tab:桥接原项目块(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    await w.findAll('.pd-tab').find((b) => b.text() === '预算核算')!.trigger('click')
    expect(w.text()).toContain('原项目预算核算')
    expect(w.text()).toContain('OLD-9')
    expect(w.text()).toContain('不计入当前汇总')
  })

  it('售前原项目 tab:原项目里程碑块(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    await w.findAll('.pd-tab').find((b) => b.text() === '原项目')!.trigger('click')
    expect(w.text()).toContain('原项目里程碑')
    expect(w.text()).toContain('服务完成')
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

  it('头部超支徽章:总体超支>5000 红', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].overspendAmount = 60000
    const w = await mountAt('/project/P-1')
    const badge = w.find('.pd-badge.over-danger')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('总体预算超支')
    expect(badge.text()).toContain('6万')
  })

  it('头部超支徽章:总体超支≤5000 黄', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].overspendAmount = 3000
    const w = await mountAt('/project/P-1')
    expect(w.find('.pd-badge.over-warn').exists()).toBe(true)
    expect(w.find('.pd-badge.over-danger').exists()).toBe(false)
    expect(w.text()).toContain('总体预算超支')
  })

  it('头部超支徽章:未超支(负/缺)不显示总体徽章', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].overspendAmount = -500
    const w = await mountAt('/project/P-1')
    expect(w.find('.pd-badge.over-danger').exists()).toBe(false)
    expect(w.find('.pd-badge.over-warn').exists()).toBe(false)
    expect(w.text()).not.toContain('总体预算超支')
  })

  it('头部超支徽章:两类交付超支按白名单出标签,非白名单不出', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].deliveryCosts = [
      { 类别: '交付外包服务成本', 预算金额: 100, 实际发生: 200, 剩余预算: -100, 消耗率: 2 },
      { 类别: '交付部门人工成本', 预算金额: 100, 实际发生: 150, 剩余预算: -50, 消耗率: 1.5 },
      { 类别: '差旅费', 预算金额: 100, 实际发生: 300, 剩余预算: -200, 消耗率: 3 },
    ]
    const w = await mountAt('/project/P-1')
    expect(w.text()).toContain('交付外包服务成本超支')
    expect(w.text()).toContain('交付部门人工成本超支')
    expect(w.text()).not.toContain('差旅费超支')
  })

  it('头部超支徽章:基线项目(无超支金额+无交付超支)不渲染任何超支徽章', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    expect(w.find('.pd-badge.over-danger').exists()).toBe(false)
    expect(w.find('.pd-badge.over-warn').exists()).toBe(false)
  })

  it('回款 tab:PMIS 回款摘要与节点表(2A)', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].paymentPmis = {
      contract: 1000000, actualTotal: 700000, paymentCount: 2, paymentRatio: 0.7,
      expectedTotal: 1000000, nodeCount: 2, reachedCount: 1, delayedCount: 1,
      lastPaymentDate: '2026-06-04', fromOrigin: false,
    }
    ;(ds.data as any).paymentNodes = { 'P-1': [
      { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-02', payRatio: 0.7,
        expectedPayment: 700000, reached: true, status: '已达成' },
      { stage: '终验', planDate: '2020-01-01', actualDate: '', payRatio: 0.3,
        expectedPayment: 300000, reached: false, status: '延期' },
    ] }
    const w = await mountAt('/project/P-1')
    expect(w.text()).toContain('PMIS 回款')
    expect(w.text()).toContain('到货')
    expect(w.text()).toContain('已达成')
    expect(w.text()).toContain('延期')
  })
})
