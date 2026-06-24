import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MilestoneReminderTab from './MilestoneReminderTab.vue'
import DataTable from './DataTable.vue'
import ColumnPicker from './ColumnPicker.vue'
import * as xlsx from '@/lib/exportXlsx'

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

describe('MilestoneReminderTab 表格栈', () => {
  it('ColumnPicker 存在且含全部14列可选', () => {
    const w = mountTab()
    const cp = w.findComponent(ColumnPicker)
    expect(cp.exists()).toBe(true)
    expect((cp.props('columns') as any[]).length).toBe(14)
  })
  it('关键词搜索 编号/名称 收窄 filtered', async () => {
    const w = mountTab()
    const vm = w.vm as any
    const before = vm.filtered.length
    await w.get('[data-test="mrt-kw"]').setValue('不存在的编号zzz')
    expect((w.vm as any).filtered.length).toBe(0)
    expect(before).toBeGreaterThan(0)
  })
  it('按筛选导出调用 exportRows(条数与列键)', async () => {
    const spy = vi.spyOn(xlsx, 'exportRows').mockImplementation(() => {})
    const w = mountTab()
    await w.get('[data-test="mrt-export"]').trigger('click')
    expect(spy).toHaveBeenCalledTimes(1)
    const [, rowsArg] = spy.mock.calls[0]
    expect((rowsArg as any[]).length).toBe((w.vm as any).filtered.length)
    expect(Object.keys((rowsArg as any[])[0])).toContain('项目金额(万)')
    expect(Object.keys((rowsArg as any[])[0])).toContain('是否完成')
    spy.mockRestore()
  })
})
