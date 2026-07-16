import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MilestoneTable from './MilestoneTable.vue'

const ITEMS = [
  { name: '终验', planDate: '2026-07-01', actualDate: '', payStage: '终验款，100.00%', pct: null, priority: 'high' },
  { name: '项目关闭', planDate: '2026-08-01', actualDate: '2026-06-12', payStage: '', pct: null, priority: 'mid' },
  { name: '到货', planDate: '2026-06-19', actualDate: '', payStage: '', pct: null, priority: 'low' },
] as any

const items = [
  { name: '终验', planDate: '2026-05-01', actualDate: '', payStage: '', payRatio: null, pct: null, priority: 'high', stage: false },
  { name: '阶段验收款1（20.00%）', planDate: '2026-03-01', actualDate: '', payStage: '阶段验收款1（20.00%）', payRatio: 0.2, pct: null, priority: 'high', stage: true },
  { name: '项目启动', planDate: '', actualDate: '2026-01-01', payStage: '', payRatio: null, pct: null, priority: 'low', stage: false },
] as never[]

describe('MilestoneTable', () => {
  it('列内容与完成状态(S1 去色,priority 仅数据保留)', () => {
    const w = mount(MilestoneTable, { props: { items: ITEMS } })
    const trs = w.findAll('tbody tr')
    expect(trs).toHaveLength(3)
    // 按计划时间升序:到货(06-19) < 终验(07-01) < 项目关闭(08-01)
    expect(trs[1].classes()).not.toContain('ms-high')   // S1:行级三色已移除
    expect(trs[1].text()).toContain('终验款，100.00%')
    expect(trs[1].text()).toContain('未完成')
    expect(trs[2].text()).toContain('已完成')   // 有实际时间
    expect(trs[0].text()).toContain('2026-06-19')
  })

  it('按计划时间升序、缺计划时间排末尾', () => {
    const w = mount(MilestoneTable, { props: { items } })
    const names = w.findAll('.ms-name').map((n) => n.text())
    expect(names).toEqual(['阶段验收款1（20.00%）', '终验', '项目启动'])  // 03-01 < 05-01 < 空
  })

  it('stage 行加 ms-stage 类,常规行不加', () => {
    const w = mount(MilestoneTable, { props: { items } })
    const rows = w.findAll('tbody tr')
    const stageRow = rows.find((r) => r.text().includes('阶段验收款1'))
    const regRow = rows.find((r) => r.text().includes('终验'))
    expect(stageRow!.classes()).toContain('ms-stage')
    expect(regRow!.classes()).not.toContain('ms-stage')
  })
})
