import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MilestoneTable from './MilestoneTable.vue'

const ITEMS = [
  { name: '终验', planDate: '2026-07-01', actualDate: '', payStage: '终验款，100.00%', pct: null, priority: 'high' },
  { name: '项目关闭', planDate: '2026-08-01', actualDate: '2026-06-12', payStage: '', pct: null, priority: 'mid' },
  { name: '到货', planDate: '2026-06-19', actualDate: '', payStage: '', pct: null, priority: 'low' },
] as any

describe('MilestoneTable', () => {
  it('行级三色 class + 列内容 + 完成状态', () => {
    const w = mount(MilestoneTable, { props: { items: ITEMS } })
    const trs = w.findAll('tbody tr')
    expect(trs).toHaveLength(3)
    expect(trs[0].classes()).toContain('ms-high')
    expect(trs[1].classes()).toContain('ms-mid')
    expect(trs[2].classes()).toContain('ms-low')
    expect(trs[0].text()).toContain('终验款，100.00%')
    expect(trs[0].text()).toContain('未完成')
    expect(trs[1].text()).toContain('已完成')   // 有实际时间
    expect(trs[2].text()).toContain('2026-06-19')
  })
})
