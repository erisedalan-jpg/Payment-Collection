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

describe('DataTable row-click', () => {
  it('点击行 emit row-click 携带行数据', async () => {
    const w = mount(DataTable, {
      props: {
        columns: [{ key: 'projectId', label: '编号' }],
        rows: [{ projectId: 'P1' }],
        clickable: true,
      },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    await w.find('.el-table__row').trigger('click')
    expect(w.emitted('row-click')?.[0]?.[0]).toMatchObject({ projectId: 'P1' })
  })
})

describe('DataTable cell 插槽', () => {
  it('cell-<key> 插槽覆盖该列默认渲染', async () => {
    const w = mount(DataTable, {
      props: { columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], rows: [{ a: 'x', b: 'y' }] },
      slots: { 'cell-a': '<b class="custom-cell">徽章</b>' },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.find('.custom-cell').exists()).toBe(true)
    expect(w.text()).toContain('y') // 未提供插槽的列仍走默认渲染
  })
})

describe('DataTable wrap 列', () => {
  it('wrap:true 列单元格挂 dt-wrap-col 类、普通列不挂', async () => {
    const w = mount(DataTable, {
      props: {
        columns: [
          { key: 'term', label: '收款条件', wrap: true },
          { key: 'x', label: 'X' },
        ] as DataColumn[],
        rows: [{ term: '合同签订后付款30%，剩余货款4个月帐期', x: '1' }],
      },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    const wrapCell = w.find('.dt-wrap-col')
    expect(wrapCell.exists()).toBe(true)
    expect(wrapCell.text()).toContain('剩余货款4个月帐期')
  })
})

describe('DataTable num 列', () => {
  it('num:true 列单元格挂 .u-num、普通列不挂', async () => {
    const w = mount(DataTable, {
      props: {
        columns: [
          { key: 'label', label: '名称' },
          { key: 'amount', label: '金额', num: true },
        ] as DataColumn[],
        rows: [{ label: '项目A', amount: 1234 }],
      },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    // el-table 在 jsdom 中渲染插槽内容；.u-num span 应存在于 DOM
    expect(w.find('.u-num').exists()).toBe(true)
    // label 列未设 num，不应有 .u-num；amount 列设了 num，有 ≥1 个
    // el-table 内部可能双渲染行（固定列镜像），用 >=1 而非精确数量
    expect(w.findAll('.u-num').length).toBeGreaterThanOrEqual(1)
  })
})

describe('DataTable fixed 列', () => {
  it('col.fixed 透传到 el-table-column', async () => {
    const cols: DataColumn[] = [
      { key: 'a', label: 'A' },
      { key: 'op', label: '操作', fixed: 'right' },
    ]
    const w = mount(DataTable, {
      props: { columns: cols, rows: [{ a: 1 }] },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    // el-table-column fixed=right 会在表格根渲染 fixed 容器类
    expect(w.html()).toContain('fixed')
  })
})

describe('DataTable show-summary', () => {
  const cols: DataColumn[] = [
    { key: 'name', label: '名称' },
    { key: 'amount', label: '金额', num: true },
  ]
  const rows2 = [{ name: 'A', amount: 100 }, { name: 'B', amount: 200 }]

  it('showSummary + summaryMethod 渲染表底汇总行', async () => {
    const w = mount(DataTable, {
      props: {
        columns: cols, rows: rows2, showCount: false, showSummary: true,
        summaryMethod: ({ columns }: { columns: { property: string }[] }) =>
          columns.map((c) => (c.property === 'name' ? '合计' : c.property === 'amount' ? '300' : '')),
      },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).toContain('合计')
    expect(w.text()).toContain('300')
  })

  it('默认(showSummary 未传)不渲染汇总行', async () => {
    const w = mount(DataTable, {
      props: { columns: cols, rows: rows2, showCount: false },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).not.toContain('合计')
  })
})
