import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneReminderTab from './MilestoneReminderTab.vue'
import DataTable from './DataTable.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const now = new Date(2026, 2, 10)
function mp(o: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...o }
}
const projects = [
  mp({ projectId: 'A', manager: '张', nodes: [
    { name: '到货', planDate: '2026-03-12', actualDate: '', payStage: '到货款', priority: 'high' },
    { name: '初验', planDate: '2026-04-05', actualDate: '', payStage: '', priority: 'mid' },
  ] }),
]
const opts = { global: { plugins: [ElementPlus] } }

describe('MilestoneReminderTab', () => {
  it('默认 7 天窗:仅 03-12 到货一行;统计卡显数', () => {
    const w = mount(MilestoneReminderTab, { props: { projects, now }, ...opts })
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.node)).toEqual(['到货'])
    expect(w.text()).toContain('到期节点总数')
  })
  it('切 30 天窗加入初验', async () => {
    const w = mount(MilestoneReminderTab, { props: { projects, now }, ...opts })
    await w.get('[data-test="seg-30d"]').trigger('click')
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.node).sort()).toEqual(['初验', '到货'])
  })
})
