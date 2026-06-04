import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import TierNodesTab from './TierNodesTab.vue'
import DataTable from '@/components/DataTable.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', projectName: '甲', tier: '100万以上', nodeName: '终验款', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' },
      { projectId: 'PX', projectName: '别档', tier: '50万以下', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1, actualPayment: 0, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {},
    displayColumns: {
      '100万以上': [
        { key: 'projectId', label: '项目编号', visible: true },
        { key: 'projectName', label: '项目名称', visible: true },
        { key: 'expectedPayment', label: '计划回款', visible: true },
        { key: 'nodeStatus', label: '状态', visible: true },
        { key: 'planMonth', label: '计划月份', visible: false },
      ],
    },
    followupRecords: {},
  } as any
}

describe('TierNodesTab', () => {
  it('passes visible columns + tier-filtered rows to DataTable', async () => {
    seed()
    const wrapper = mount(TierNodesTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const dt = wrapper.findComponent(DataTable)
    expect(dt.exists()).toBe(true)
    // visible only (planMonth visible:false excluded) → 4 columns
    expect((dt.props('columns') as any[]).length).toBe(4)
    // only the 100万以上 node (PX excluded by tier)
    expect((dt.props('rows') as any[]).length).toBe(1)
    expect((dt.props('rows') as any[])[0].projectId).toBe('P1')
  })

  it('formats cells via formatCellValue (amount + status)', async () => {
    seed()
    const wrapper = mount(TierNodesTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const cols = wrapper.findComponent(DataTable).props('columns') as any[]
    const amountCol = cols.find((c) => c.key === 'expectedPayment')!
    expect(amountCol.formatter(1000000, {})).toBe('1,000,000')
  })
})
