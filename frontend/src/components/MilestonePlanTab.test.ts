import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestonePlanTab from './MilestonePlanTab.vue'
import DataTable from './DataTable.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function mp(o: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: 'L31', projectType: 'T', contract: 0, status: '正常', nodes: [], ...o }
}
const projects = [
  mp({ projectId: 'A', projectName: '甲', nodes: [{ name: '到货', planDate: '2026-03-01', actualDate: '', priority: 'high' }] }),
  mp({ projectId: 'B', projectName: '乙项目' }),
]
const opts = { global: { plugins: [ElementPlus] } }

describe('MilestonePlanTab', () => {
  it('每项目一行 + 含动态节点列 + 关键词筛选', async () => {
    const w = mount(MilestonePlanTab, { props: { projects }, ...opts })
    let rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows).toHaveLength(2)
    const cols = (w.findComponent(DataTable).props('columns') as any[]).map((c) => c.key)
    expect(cols).toContain('计划_到货')
    expect(cols).toContain('实际_终验')
    ;(w.vm as any).fKw = '乙'
    await w.vm.$nextTick()
    rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.projectId)).toEqual(['B'])
    expect(w.find('[data-test="plan-export"]').exists()).toBe(true)
  })
})
