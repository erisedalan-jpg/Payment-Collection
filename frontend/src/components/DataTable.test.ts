import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DataTable, { type DataColumn } from './DataTable.vue'

const columns: DataColumn[] = [
  { key: 'name', label: '名称' },
  { key: 'amount', label: '金额', formatter: (v) => `¥${v}` },
]
const rows = [
  { name: 'A', amount: 100 },
  { name: 'B', amount: 200 },
]

describe('DataTable', () => {
  it('renders column headers and the row count', async () => {
    const wrapper = mount(DataTable, { props: { columns, rows }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('名称')
    expect(text).toContain('金额')
    expect(text).toContain('共 2 条')
  })

  it('applies the column formatter to cell values', async () => {
    const wrapper = mount(DataTable, { props: { columns, rows }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('¥100')
  })

  it('hides count when showCount is false', async () => {
    const wrapper = mount(DataTable, { props: { columns, rows, showCount: false }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('共 2 条')
  })
})
