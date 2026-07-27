import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import RiskBoardView from './RiskBoardView.vue'
import DataTable from '@/components/DataTable.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()   // 视图状态持久化会写 localStorage,逐条清空避免用例间串档
})

const rec = (lvl: string, status: string) => ({ 风险等级: lvl, 风险状态: status })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    projects: [
      { projectId: 'P1', projectName: '甲', orgL4: '北京', projectManager: '张三' },
      { projectId: 'P2', projectName: '乙', orgL4: '上海', projectManager: '李四' },
      { projectId: 'P3', projectName: '丙', orgL4: '北京', projectManager: '张三' },
    ],
    projectPmis: {
      P1: { status: { 项目级别: 'A级' }, customer: { 行业: '金融', 合同总额: 1000000 }, riskRecords: [rec('高', '未关闭')] },
      P2: { status: { 项目级别: 'B级' }, customer: { 行业: '政务', 合同总额: 500000 }, riskRecords: [rec('中', '处理中')] },
      P3: { status: { 项目级别: 'A级' }, customer: { 行业: '金融', 合同总额: 300000 }, riskRecords: [rec('高', '已关闭')] },  // 风险全已关闭 → riskLevel 派生为「无风险」
    },
    displayColumns: {}, followupRecords: {},
  } as any
}

const opts = { global: { plugins: [ElementPlus] } }

describe('RiskBoardView', () => {
  it('渲染 4 卡片:健康度 33.3% / 高1 / 中1 / 低0', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    const t = w.text()
    expect(t).toContain('项目健康度')
    expect(t).toContain('无风险 1 / 全量 3')   // P3 全部已关闭 → 无风险
    expect(t).toContain('高风险项目')
    expect(t).toContain('中风险项目')
    expect(t).toContain('低风险项目')
  })
  it('排名维度与统计选项存在', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    expect(w.find('[data-test="seg-riskLevel"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-orgL4"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-projectCount"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-contractAmount"]').exists()).toBe(true)
  })
  it('风险概览为透视:DimPicker 选行列维 + PivotTable 渲染', async () => {
    seed()
    const w = mount(RiskBoardView, opts)
    await flushPromises()
    expect(w.find('.pv').exists()).toBe(true)       // PivotTable 表
    expect(w.findAll('[data-test^="dim-"]').length).toBeGreaterThan(0)  // DimPicker chips
  })
  it('点透视格打开下钻弹窗', async () => {
    seed()
    const w = mount(RiskBoardView, opts)
    await flushPromises()
    const cell = w.find('.pv .pv-click')
    expect(cell.exists()).toBe(true)   // 当前 fixture 必有非空透视格;无条件断言避免守卫静默空过
    await cell.trigger('click')
    await flushPromises()
    expect((w.vm as any).drillOpen).toBe(true)
  })
  it('空数据显空态', () => {
    const ds = useDataStore()
    ds.data = { meta: {}, projects: [], projectPmis: {}, displayColumns: {}, followupRecords: {} } as any
    const w = mount(RiskBoardView, opts)
    expect(w.text()).toContain('暂无项目主域数据')
  })
  it('空态改用 AppEmpty 渲染', () => {
    const ds = useDataStore()
    ds.data = { meta: {}, projects: [], projectPmis: {}, displayColumns: {}, followupRecords: {} } as any
    const w = mount(RiskBoardView, opts)
    expect(w.find('.ae').exists()).toBe(true)
    expect(w.find('.ae').text()).toContain('暂无')
  })
  it('风险等级筛选去勾"无风险"只影响风险统计分析,不影响卡片', async () => {
    seed()
    const w = mount(RiskBoardView, opts)
    const before = w.find('.rv-card-main').text()
    // 去勾无风险(data-test=lvl-无风险 的 chip)
    const chip = w.find('[data-test="lvl-无风险"]')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    // 卡片(顶部第一个 .rv-card-main)不变
    expect(w.find('.rv-card-main').text()).toBe(before)
  })
  it('4 张概览卡改用 AppCard(flat);图表项 .rv-chart-item 属非目标,不套 AppCard', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    const cards = w.findAll('.rv-card')
    expect(cards).toHaveLength(4)
    expect(cards.every((c) => c.classes().includes('ac--flat'))).toBe(true)
    expect(w.find('.rv-chart-item').classes()).not.toContain('ac')
  })

  it('点风险统计分析表行打开下钻弹窗', async () => {
    seed()
    const w = mount(RiskBoardView, opts)
    await w.find('.rv-rank-table .el-table__row').trigger('click')
    await flushPromises()
    expect((w.vm as any).drillOpen).toBe(true)
  })
})

describe('RiskBoardView 页头与视图状态持久化', () => {
  function login() {
    useAuthStore().user = { account: 's', displayName: 's', isSuper: true, allowedPages: ['*'], allowedL4: [] }
  }

  it('渲染页头标题', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    expect(w.find('.ph-title').text()).toBe('风险看板')
  })

  it('维度/指标/图表类型/等级筛选/透视行列维持久化:改选 → 卸载 → 重新挂载后仍是该值', async () => {
    login()
    seed()
    const w1 = mount(RiskBoardView, opts)
    ;(w1.vm as any).dimKey = 'orgL4'
    ;(w1.vm as any).metricKey = 'contractAmount'
    ;(w1.vm as any).chartTypes = ['bar', 'pie']
    ;(w1.vm as any).levelFilter = ['高', '中']
    ;(w1.vm as any).rowDims = ['industry']
    ;(w1.vm as any).ovMetric = 'openRiskSum'
    await w1.vm.$nextTick()
    w1.unmount()

    const w2 = mount(RiskBoardView, opts)
    expect((w2.vm as any).dimKey).toBe('orgL4')
    expect((w2.vm as any).metricKey).toBe('contractAmount')
    expect((w2.vm as any).chartTypes).toEqual(['bar', 'pie'])
    expect((w2.vm as any).levelFilter).toEqual(['高', '中'])
    expect((w2.vm as any).rowDims).toEqual(['industry'])
    expect((w2.vm as any).ovMetric).toBe('openRiskSum')
  })

  it('下钻 modal 状态不进存档(否则重进页面会弹空 modal)', async () => {
    login()
    seed()
    const w1 = mount(RiskBoardView, opts)
    await w1.find('.rv-rank-table .el-table__row').trigger('click')
    ;(w1.vm as any).dimKey = 'orgL4'   // 改一个受监听的状态,确保这一轮确实落了盘
    await flushPromises()
    expect((w1.vm as any).drillOpen).toBe(true)
    w1.unmount()

    const keys = Object.keys(JSON.parse(localStorage.getItem('s:view_risk') ?? '{}'))
    expect(keys).toContain('dimKey')   // 存档非空,下面三条否定断言才有意义
    for (const banned of ['drillOpen', 'drillTitle', 'drillRows']) {
      expect(keys).not.toContain(banned)
    }

    const w2 = mount(RiskBoardView, opts)
    expect((w2.vm as any).drillOpen).toBe(false)
  })
})
