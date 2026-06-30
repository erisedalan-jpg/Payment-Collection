import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import CostDetailView from './CostDetailView.vue'
import ChartBox from '@/charts/ChartBox.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import DataTable from '@/components/DataTable.vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useFilterStore } from '@/stores/filter'
import { useCrossFilterStore } from '@/stores/crossFilter'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    followupRecords: {},
    projects: [
      { projectId: 'WS1', projectName: '甲', projectManager: '张', orgL4: 'D1', orgL3_1: 'L31', paymentPmis: { contract: 2000000 },
        deliveryCosts: [{ 类别: '交付部门人工成本', 剩余预算: 12345 }, { 类别: '交付外包服务成本', 剩余预算: 6789 }] },
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
  it('明细表含全部 3 项目(XS 保留);列头 L4 多选筛选缩小', async () => {
    seed()
    const w = mount(CostDetailView, opts)
    const tables = w.findAllComponents({ name: 'DataTable' })
    const detail = tables[tables.length - 1]
    expect((detail.props('rows') as any[]).length).toBe(3)
    // 列头多选筛选走 crossFilter store(取代旧工具栏 el-select)
    const cf = useCrossFilterStore()
    cf.setColumnFilter('cost-detail', 'orgL4', ['D2'], 2)
    await w.vm.$nextTick()
    expect((detail.props('rows') as any[]).map((r: any) => r.projectId)).toEqual(['XS9'])
  })

  it('点 KPI(超支大于5K)写成本状态列筛选缩小明细;序号列 + 导出按钮', async () => {
    ;(Element.prototype as any).scrollIntoView = vi.fn()
    seed()
    const w = mount(CostDetailView, opts)
    ;(w.vm as any).onKpiClick(3)
    await w.vm.$nextTick()
    const tables = w.findAllComponents({ name: 'DataTable' })
    const detail = tables[tables.length - 1]
    expect((detail.props('rows') as any[]).map((r: any) => r.projectId)).toEqual(['WS1'])
    expect((detail.props('rows') as any[])[0]._seq).toBe(1)
    expect(w.find('[data-test="cost-export"]').exists()).toBe(true)
  })

  it('明细列:删 L3/L3-1、含交付部门剩余/交付外包剩余、金额列去 ¥(纯数字)', () => {
    seed()
    const w = mount(CostDetailView, opts)
    const cols = (w.vm as any).DETAIL_COLS as any[]
    const keys = cols.map((c) => c.key)
    expect(keys).not.toContain('orgL3')
    expect(keys).not.toContain('orgL3_1')
    expect(keys).toEqual(expect.arrayContaining(['deliveryDeptRemaining', 'deliveryOutsourceRemaining']))
    // 四金额列去 ¥,仅千分位数字
    for (const k of ['amount', 'totalBudget', 'actualCost', 'remaining']) {
      const fmt = cols.find((c) => c.key === k).formatter
      expect(fmt(2000000)).toBe('2,000,000')
      expect(fmt(2000000)).not.toContain('¥')
    }
    // 全列(除序号)可排序 + 可筛选
    expect(cols.filter((c) => c.key !== '_seq').every((c) => c.sortable === true)).toBe(true)
  })

  it('交付部门剩余/交付外包剩余 取自 deliveryCosts(同 /project/:id 源)', () => {
    seed()
    const w = mount(CostDetailView, opts)
    const ws1 = ((w.vm as any).rows as any[]).find((r) => r.projectId === 'WS1')
    expect(ws1.deliveryDeptRemaining).toBe(12345)
    expect(ws1.deliveryOutsourceRemaining).toBe(6789)
  })

  it('表头排序跨全集:按项目金额升序', async () => {
    seed()
    const w = mount(CostDetailView, opts)
    ;(w.vm as any).onSortChange({ prop: 'amount', order: 'ascending' })
    await w.vm.$nextTick()
    expect(((w.vm as any).sorted as any[]).map((r) => r.projectId)).toEqual(['XS9', 'WS2', 'WS1'])
    ;(w.vm as any).onSortChange({ prop: 'amount', order: 'descending' })
    await w.vm.$nextTick()
    expect(((w.vm as any).sorted as any[]).map((r) => r.projectId)).toEqual(['WS1', 'WS2', 'XS9'])
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

describe('CostDetailView 标签排除', () => {
  function seedSmall() {
    const data = useDataStore()
    ;(data as any).data = {
      projects: [{ projectId: 'P1', projectName: '甲', orgL4: '一组' }, { projectId: 'P2', projectName: '乙', orgL4: '一组' }],
      projectPmis: {},
    }
  }

  it('开启排除后被排除项目不进 baseProjects', () => {
    seedSmall()
    const tags = useProjectTagsStore(); tags.assignments = { P2: ['排除标签'] } as any
    useFilterStore().setExclude(true, ['排除标签'])
    const w = mount(CostDetailView, opts)
    expect(((w.vm as any).baseProjects as any[]).map((p) => p.projectId)).toEqual(['P1'])
  })
})
