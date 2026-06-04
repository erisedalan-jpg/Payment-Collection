import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import LedgerTable from './LedgerTable.vue'

beforeEach(() => setActivePinia(createPinia()))

const columns = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
]
const projects = [{ projectId: 'P1', projectName: '甲' }]
const rawNodes = [
  { projectId: 'P1', isPaymentRelated: true, milestone: '节点A', planDate: '2026-06-06', expectedPayment: 200000, actualPayment: 50000, actualPaymentRatio: 0.25, nodeStatus: '延期' },
]

function mountLT() {
  return mount(LedgerTable, {
    props: { tableId: 'ledgerTable', projects, columns, sourceRows: projects, rawNodes },
    global: { plugins: [ElementPlus] },
  })
}

describe('LedgerTable', () => {
  it('渲染表头(含CF)/行/记录数', () => {
    const w = mountLT()
    expect(w.text()).toContain('项目编号')
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('共 1 条记录')
    expect(w.findAllComponents({ name: 'ColumnFilter' }).length).toBe(2)
  })
  it('点击行展开回款节点明细，再点收起', async () => {
    const w = mountLT()
    await w.find('tr.lt-row').trigger('click')
    expect(w.text()).toContain('回款节点明细')
    expect(w.text()).toContain('节点A')
    await w.find('tr.lt-row').trigger('click')
    expect(w.text()).not.toContain('回款节点明细')
  })
})
