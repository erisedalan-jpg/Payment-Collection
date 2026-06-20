import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import CostDetailView from './CostDetailView.vue'
import ChartBox from '@/charts/ChartBox.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import DataTable from '@/components/DataTable.vue'
import { useDataStore } from '@/stores/data'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    projectOverview: { projects: [], columns: [] }, naguanMap: {}, naguanExclude: {}, followupRecords: {},
    projects: [
      { projectId: 'WS1', projectName: '甲', projectManager: '张', orgL4: 'D1', orgL3_1: 'L31', paymentPmis: { contract: 2000000 } },
      { projectId: 'WS2', projectName: '乙', projectManager: '李', orgL4: 'D1', orgL3_1: 'L31', paymentPmis: { contract: 500000 } },
      { projectId: 'XS9', projectName: '售前', projectManager: '王', orgL4: 'D2', orgL3_1: '', paymentPmis: { contract: 0 } },
    ],
    projectPmis: {
      WS1: { status: { 项目类型: '正常实施类' }, team: { L3部门: '一部' }, cost: { 总预算: 1000, 核算: 1200, 剩余预算: -8000 } },
      WS2: { status: { 项目类型: '正常实施类' }, team: { L3部门: '一部' }, cost: { 总预算: 1000, 核算: 900, 剩余预算: 100 } },
      XS9: { status: { 项目类型: '售前服务类' }, team: { L3部门: '二部' }, cost: { 剩余预算: -9999 } },
    },
  } as any
}

const opts = { global: { plugins: [ElementPlus], stubs: { VChart: true } } }

describe('CostDetailView 明细表', () => {
  it('明细表含全部 3 项目(XS 保留);L4 多选筛选缩小', async () => {
    seed()
    const w = mount(CostDetailView, opts)
    // 明细 DataTable 是第二个(L4 汇总是第一个)
    const tables = w.findAllComponents({ name: 'DataTable' })
    const detail = tables[tables.length - 1]
    expect((detail.props('rows') as any[]).length).toBe(3)
    ;(w.vm as any).fL4 = ['D2']
    await w.vm.$nextTick()
    expect((detail.props('rows') as any[]).map((r: any) => r.projectId)).toEqual(['XS9'])
  })
  it('成本状态多选 + 导出按钮 + 序号列', async () => {
    seed()
    const w = mount(CostDetailView, opts)
    ;(w.vm as any).fStatus = ['超支大于5k']
    await w.vm.$nextTick()
    const tables = w.findAllComponents({ name: 'DataTable' })
    const detail = tables[tables.length - 1]
    expect((detail.props('rows') as any[]).map((r: any) => r.projectId)).toEqual(['WS1'])
    expect((detail.props('rows') as any[])[0]._seq).toBe(1)
    expect(w.find('[data-test="cost-export"]').exists()).toBe(true)
  })
})

describe('CostDetailView 上半', () => {
  it('标题 + 4 KPI(剔 XS:总数2/未超支1/不足5k0/大于5k1)', () => {
    seed()
    const w = mount(CostDetailView, opts)
    expect(w.text()).toContain('成本分析')
    const items = w.findComponent(MetricGrid).props('items') as any[]
    expect(items.map((i) => i.k)).toEqual(['成本统计项目数', '未超支', '超支不足5K', '超支大于5K'])
    expect(items.find((i) => i.k === '成本统计项目数').v).toBe('2')
    expect(items.find((i) => i.k === '超支大于5K').v).toBe('1')
  })
  it('渲染超支分布 ChartBox + L4 汇总表(行=D1)', () => {
    seed()
    const w = mount(CostDetailView, opts)
    expect(w.findComponent(ChartBox).exists()).toBe(true)
    // L4 汇总表(剔 XS → 仅 D1)经 DataTable props 同步断言,避免 el-table 行异步渲染
    expect((w.findComponent(DataTable).props('rows') as any[]).some((r) => r.orgL4 === 'D1')).toBe(true)
  })
  it('点 KPI(超支大于5K)就地筛选明细表;点总数恢复', async () => {
    ;(Element.prototype as any).scrollIntoView = vi.fn()
    seed()
    const w = mount(CostDetailView, opts)
    w.findComponent(MetricGrid).vm.$emit('item-click', 3)
    await w.vm.$nextTick()
    const tables = w.findAllComponents({ name: 'DataTable' })
    const detail = tables[tables.length - 1]
    expect((detail.props('rows') as any[]).map((r) => r.projectId)).toEqual(['WS1'])
    w.findComponent(MetricGrid).vm.$emit('item-click', 0)
    await w.vm.$nextTick()
    expect((detail.props('rows') as any[]).length).toBe(3)
  })
  it('L4 汇总表含四金额列(可排序)且求和正确', () => {
    seed()
    const w = mount(CostDetailView, opts)
    const l4 = w.findAllComponents({ name: 'DataTable' })[0]
    const cols = l4.props('columns') as any[]
    expect(cols.map((c) => c.key)).toEqual(expect.arrayContaining(['contractTotal', 'remainingTotal', 'deliveryDeptRemaining', 'deliveryOutsourceRemaining']))
    expect(cols.find((c) => c.key === 'orgL4').sortable).toBe(true)
    const d1 = (l4.props('rows') as any[]).find((r) => r.orgL4 === 'D1')
    expect(d1.contractTotal).toBe(2500000)
    expect(d1.remainingTotal).toBe(-7900)
  })
})
