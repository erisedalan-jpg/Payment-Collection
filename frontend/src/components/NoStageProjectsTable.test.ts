import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import NoStageProjectsTable from './NoStageProjectsTable.vue'
import DataTable from './DataTable.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  useFilterStore().setPreset('all')
  push.mockReset()
})

function seed() {
  const data = useDataStore()
  data.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [], displayColumns: {}, followupRecords: {},
    projects: [
      // P1: 无回款阶段数据(空数组) → 应出现在清单中
      { projectId: 'P1', projectName: '甲项目', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2_000_000 } },
      // P2: 有回款阶段节点 → 不应出现在清单中
      { projectId: 'P2', projectName: '乙项目', projectManager: '李四', orgL4: 'B组', paymentPmis: { contract: 1_000_000 } },
    ],
    projectPmis: {},
    paymentNodes: {
      P1: [],
      P2: [
        { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.6, expectedPayment: 600_000, receivedAmount: 0, unpaidAmount: 600_000, status: '未回款' },
      ],
    },
    paymentRecords: {},
  } as any
}

const opts = { global: { plugins: [ElementPlus] } }

describe('NoStageProjectsTable', () => {
  it('只列无回款阶段数据的项目', () => {
    seed()
    const w = mount(NoStageProjectsTable, opts)
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.projectId)).toEqual(['P1'])
    expect(w.text()).toContain('无回款阶段数据项目（1）')
  })

  it('点击行跳转项目详情', async () => {
    seed()
    const w = mount(NoStageProjectsTable, opts)
    await w.findComponent(DataTable).vm.$emit('row-click', { projectId: 'P1' })
    expect(push).toHaveBeenCalledWith('/project/P1')
  })

  it('存在导出按钮', () => {
    seed()
    const w = mount(NoStageProjectsTable, opts)
    expect(w.find('[data-test="nostage-export"]').exists()).toBe(true)
  })

  it('全部有回款阶段数据时显示空态', () => {
    seed()
    const data = useDataStore()
    ;(data.data as any).paymentNodes.P1 = [
      { stage: '预付款', planDate: '2026-01-01', actualDate: '', payRatio: 0.3, expectedPayment: 600_000, receivedAmount: 0, unpaidAmount: 600_000, status: '未回款' },
    ]
    const w = mount(NoStageProjectsTable, opts)
    expect(w.text()).toContain('全部在建项目均有收款阶段')
  })

  it('超过一页(>20行)时显示分页器与总数', () => {
    const data = useDataStore()
    const projects = Array.from({ length: 25 }, (_, i) => ({
      projectId: `P${i + 1}`, projectName: `项目${i + 1}`, projectManager: '张三', orgL4: 'A组',
      paymentPmis: { contract: 1_000_000 },
    }))
    const paymentNodes: Record<string, any[]> = {}
    projects.forEach((p) => { paymentNodes[p.projectId] = [] })
    data.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], displayColumns: {}, followupRecords: {},
      projects, projectPmis: {}, paymentNodes, paymentRecords: {},
    } as any
    const w = mount(NoStageProjectsTable, opts)
    expect(w.text()).toContain('无回款阶段数据项目（25）')
    expect(w.text()).toContain('共 25 条')
    expect(w.find('.el-pagination').exists()).toBe(true)
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.length).toBe(20)
  })
})
