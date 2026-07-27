import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneDelayedTab from './MilestoneDelayedTab.vue'
import DataTable from './DataTable.vue'
import AppPager from './AppPager.vue'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

const now = new Date(2026, 2, 10)
function mp(o: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...o }
}
const projects = [
  mp({ projectId: 'A', status: '正常' }),
  mp({ projectId: 'B', projectName: '乙', status: '延期', orgL4: '甲组', manager: '张' }),
  mp({ projectId: 'C', projectName: '丙', status: '严重延期', orgL4: '乙组', manager: '李' }),
]
const opts = { global: { plugins: [ElementPlus] } }

describe('MilestoneDelayedTab', () => {
  it('默认只列非正常项目 + 汇总条显全量计数', () => {
    const w = mount(MilestoneDelayedTab, { props: { projects, now }, ...opts })
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.projectId).sort()).toEqual(['B', 'C'])
    expect(w.text()).toContain('正常 1')
    expect(w.text()).toContain('严重延期 1')
  })
  it('L4 多选筛选缩小行', async () => {
    const w = mount(MilestoneDelayedTab, { props: { projects, now }, ...opts })
    ;(w.vm as any).fL4 = ['甲组']
    await w.vm.$nextTick()
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.projectId)).toEqual(['B'])
  })
  it('行点击跳详情;有导出按钮', async () => {
    pushSpy.mockClear()
    const w = mount(MilestoneDelayedTab, { props: { projects, now }, ...opts })
    await w.findComponent(DataTable).vm.$emit('row-click', { projectId: 'B' })
    expect(pushSpy).toHaveBeenCalledWith('/project/B')
    expect(w.find('[data-test="delayed-export"]').exists()).toBe(true)
  })
  it('按钮改用 AppButton,data-test 原样保留(既有测试靠它定位)', () => {
    const w = mount(MilestoneDelayedTab, { props: { projects, now }, ...opts })
    const btn = w.find('[data-test="delayed-export"]')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).toContain('ab')
  })
  it('分页改用 AppPager,档位仍是本页原有的 [20,50,100]', () => {
    const w = mount(MilestoneDelayedTab, { props: { projects, now }, ...opts })
    expect(w.find('.ap').exists()).toBe(true)
    expect(w.find('.ap-total').text()).toContain('共')
    expect((w.findComponent(AppPager).vm as any).effectiveSizes).toEqual([20, 50, 100])
  })
})
