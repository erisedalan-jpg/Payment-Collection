import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import type { QualityRow } from '@/lib/dataQuality'
import DataQualityTable from './DataQualityTable.vue'

const rows: QualityRow[] = [
  { key: 'noAmount', name: '缺少项目金额', severity: 'h', byTier: [1, 0, 0], total: 1 },
  { key: 'noPm', name: '缺少项目经理', severity: 'm', byTier: [0, 0, 0], total: 0 },
]

describe('DataQualityTable', () => {
  it('渲染检查项/三档/合计', () => {
    const w = mount(DataQualityTable, { props: { rows } })
    expect(w.text()).toContain('缺少项目金额')
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('合计')
  })
  it('count>0 单元格点击 emit drill', async () => {
    const w = mount(DataQualityTable, { props: { rows } })
    await w.find('.dq-cell.clickable').trigger('click')
    const ev = w.emitted('drill')
    expect(ev).toBeTruthy()
    expect(ev![0][0]).toEqual({ checkIdx: 0, tierIdx: 0 })
  })
  it('count=0 单元格不可点', () => {
    const w = mount(DataQualityTable, { props: { rows } })
    const cells = w.findAll('.dq-cell')
    const zeroCells = cells.filter((c) => c.text() === '0')
    expect(zeroCells.every((c) => !c.classes('clickable'))).toBe(true)
  })
})
