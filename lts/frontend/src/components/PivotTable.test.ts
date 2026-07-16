import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PivotTable from './PivotTable.vue'
import type { PivotResult } from '@/lib/pivot'

const P: PivotResult = {
  rowDimLabels: ['服务组', '经理'],
  colDimLabels: ['档位'],
  rows: [
    { tuple: ['北京', '张三'], key: '北京 / 张三' },
    { tuple: ['上海', '王五'], key: '上海 / 王五' },
  ],
  cols: [
    { label: '100万以上', key: '100万以上' },
    { label: '50万以下', key: '50万以下' },
  ],
  cells: [[600000, 0], [0, 300000]],
  index: {
    '北京 / 张三': { '100万以上': { projects: [{}] } as any },
    '上海 / 王五': { '50万以下': { projects: [{}] } as any },
  },
}

describe('PivotTable', () => {
  it('渲染行维度列、列表头与格', () => {
    const w = mount(PivotTable, { props: { pivot: P, format: (v: number) => String(v) } })
    expect(w.text()).toContain('服务组')
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('600000')
  })

  it('点有数据格 emit cell-click，空格不可点', async () => {
    const w = mount(PivotTable, { props: { pivot: P, format: (v: number) => String(v) } })
    const clickable = w.findAll('.pv-cell.pv-click')
    expect(clickable.length).toBe(2)
    await clickable[0].trigger('click')
    expect(w.emitted('cell-click')?.[0]?.[0]).toEqual({ rowKey: '北京 / 张三', colKey: '100万以上' })
  })
})
