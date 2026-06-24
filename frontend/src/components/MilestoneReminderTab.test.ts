import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MilestoneReminderTab from './MilestoneReminderTab.vue'
import DataTable from './DataTable.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const now = new Date(2026, 2, 10) // 2026-03-10; m1→[03-10,04-10]
function mp(o: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...o }
}
const projects = [
  mp({ projectId: 'A', projectName: '甲', manager: '张', contract: 2000000, nodes: [
    { name: '到货', planDate: '2026-03-12', actualDate: '', payStage: '到货款', priority: 'high' },     // m1 区间内未完成
    { name: '终验', planDate: '2026-03-20', actualDate: '2026-03-19', payStage: '', priority: 'high' }, // m1 区间内已完成
    { name: '关闭', planDate: '2026-08-01', actualDate: '', priority: 'low' },                          // 出区间
  ] }),
]
function mountTab() {
  setActivePinia(createPinia())
  return mount(MilestoneReminderTab, { props: { projects, now }, global: { plugins: [ElementPlus] } })
}

describe('MilestoneReminderTab 核心', () => {
  it('默认未来1个月:到货+终验两行(含已完成),关闭出区间', () => {
    const w = mountTab()
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.node).sort()).toEqual(['到货', '终验'])
  })
  it('汇总卡四项随区间', () => {
    const w = mountTab()
    expect(w.text()).toContain('到期节点总数')
    expect(w.text()).toContain('已完成')
    expect(w.text()).toContain('未完成')
    expect(w.text()).toContain('逾期未完成')
  })
  it('快捷档"本季度"改区间(关闭仍出, 终验/到货在季度内)', async () => {
    const w = mountTab()
    await w.get('[data-test="rng-quarter"]').trigger('click')
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.node).sort()).toEqual(['到货', '终验'])
  })
  it('点行跳 /project/:id', async () => {
    const w = mountTab()
    await w.findComponent(DataTable).vm.$emit('row-click', { projectId: 'A' })
    expect(push).toHaveBeenCalledWith('/project/A')
  })
})
