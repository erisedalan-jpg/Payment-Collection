import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MilestoneReminderTab from './MilestoneReminderTab.vue'
import DataTable from './DataTable.vue'
import ColumnPicker from './ColumnPicker.vue'
import AppPager from './AppPager.vue'
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
  it('四个按钮全部改用 AppButton,data-test 原样保留(既有测试靠它定位)', () => {
    const w = mountTab()
    for (const t of ['rng-d7', 'rng-m1', 'rng-quarter', 'mrt-export']) {
      const btn = w.find(`[data-test="${t}"]`)
      expect(btn.exists()).toBe(true)
      expect(btn.classes()).toContain('ab')
    }
  })
  it('分页改用 AppPager,档位仍是本页原有的 [20,50,80,100]', () => {
    const w = mountTab()
    expect(w.find('.ap').exists()).toBe(true)
    expect(w.find('.ap-total').text()).toContain('共')
    expect((w.findComponent(AppPager).vm as any).effectiveSizes).toEqual([20, 50, 80, 100])
  })
  it('V4.5.0 汇总四卡改用 AppCard(flat),自写 .mrt-card 已删净', () => {
    const w = mountTab()
    // 限定在 .mrt-stats 内,避免与页内其它可能的 AppCard 混淆
    const cards = w.findAll('.mrt-stats > .ac--flat')
    expect(cards).toHaveLength(4)
    expect(cards[0].text()).toContain('到期节点总数')
    expect(cards[3].text()).toContain('逾期未完成')
    for (const c of cards) {
      expect(c.classes()).not.toContain('ac--default')
      expect(c.classes()).not.toContain('ac--raised')
      expect(c.classes()).not.toContain('ac--inset')
    }
    const src = readFileSync(resolve(__dirname, 'MilestoneReminderTab.vue'), 'utf-8')
    expect(/^\.mrt-card\s*[,{]/m.test(src), '.mrt-card 自写卡片规则复活了').toBe(false)
    expect(src).not.toContain('class="mrt-card"')
  })
})
