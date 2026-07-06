import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import KeyProjectsView from './KeyProjectsView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useProjectProgressStore } from '@/stores/projectProgress'
import { useCrossFilterStore } from '@/stores/crossFilter'
import * as ppApi from '@/lib/projectProgressApi'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(ppApi.projectProgressApi, 'getProgress').mockResolvedValue({ success: true, current: {}, archives: [] })
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects/key', component: KeyProjectsView },
    { path: '/project/:id', component: { template: '<div/>' } },
  ] })
})

function seed(isSuper = true) {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [], displayColumns: {}, followupRecords: {},
    projects: [
      { projectId: 'K1', projectName: '重点甲', projectManager: '何平', orgL4: 'A组', top1000: '是',
        paymentPmis: { contract: 2000000 }, payment: {}, health: {} },
      { projectId: 'N1', projectName: '非重点', projectManager: '李四', orgL4: 'B组', top1000: '否',
        paymentPmis: { contract: 9000000 }, payment: {}, health: {} },
    ],
    projectPmis: {
      K1: { status: { 项目级别: 'P3' }, risk: { 最高等级: '中', 未关闭风险数: 2 }, customer: { 最终客户: '某客户' }, team: { AR: 'AR张', SR: 'SR李' } },
    },
  } as any
  const a = useAuthStore()
  a.user = { account: 's', displayName: 's', isSuper, allowedPages: ['projects-key'], allowedL4: [] }
}

async function mountView() {
  await router.push('/projects/key'); await router.isReady()
  const w = mount(KeyProjectsView, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  return w
}

describe('KeyProjectsView', () => {
  it('只渲染重点项目(K1),非重点(N1)不显', async () => {
    seed(); const w = await mountView()
    expect(w.text()).toContain('重点甲')
    expect(w.text()).not.toContain('非重点')
    expect(w.text()).toContain('AR张')
    expect(w.text()).toContain('200')   // 合同 200 万
    expect(w.text()).toContain('中(2)') // 风险列 riskLevel(openRisks)
  })
  it('超管见更新/导出按钮', async () => {
    seed(true); const w = await mountView()
    expect(w.find('.kp-archive-btn').exists()).toBe(true)
    expect(w.find('.kp-export-btn').exists()).toBe(true)
  })
  it('普通管理员不见更新/导出按钮', async () => {
    seed(false); const w = await mountView()
    expect(w.find('.kp-archive-btn').exists()).toBe(false)
    expect(w.find('.kp-export-btn').exists()).toBe(false)
  })
  it('点进展单元格(当前数据)打开编辑弹窗', async () => {
    seed(); const w = await mountView()
    await w.find('.kp-prog-cell').trigger('click')
    expect((w.vm as any).editOpen).toBe(true)
  })
  it('点行跳项目详情', async () => {
    seed(); const push = vi.spyOn(router, 'push'); const w = await mountView()
    await w.find('.el-table__row').trigger('click')
    expect(push).toHaveBeenCalledWith('/project/K1')
  })

  // 新增：历史快照下拉 + 导出全选
  it('默认 mode=current、isCurrent 为真', async () => {
    seed(); const w = await mountView()
    expect((w.vm as any).isCurrent).toBe(true)
    expect((w.vm as any).mode).toBe('current')
  })
  it('切历史数据后默认选最新快照', async () => {
    seed()
    vi.spyOn(ppApi.projectProgressApi, 'getProgress').mockResolvedValue({
      success: true,
      current: {},
      archives: [
        { archiveTime: '2026-01-01 10:00', rows: [{ projectId: 'A' }] },
        { archiveTime: '2026-02-01 10:00', rows: [{ projectId: 'B' }] },
      ],
    })
    const w = await mountView()
    ;(w.vm as any).mode = 'history'
    await w.vm.$nextTick()
    expect((w.vm as any).historyIdx).toBe(1)
    expect((w.vm as any).isCurrent).toBe(false)
  })
  it('全选切换 exportSel', async () => {
    seed()
    vi.spyOn(ppApi.projectProgressApi, 'getProgress').mockResolvedValue({
      success: true,
      current: {},
      archives: [{ archiveTime: 't', rows: [] }],
    })
    const w = await mountView()
    ;(w.vm as any).toggleAllExport(true)
    expect((w.vm as any).exportSel.length).toBe((w.vm as any).datasetOpts.length)
    ;(w.vm as any).toggleAllExport(false)
    expect((w.vm as any).exportSel).toEqual([])
  })

  // 下钻返回保持视图状态(V2.5.9)：菜单进入(新挂载)应清空本表残留列筛选
  it('挂载时清空 key-projects 列筛选（菜单=重置）', async () => {
    seed()
    const cf = useCrossFilterStore()
    cf.setColumnFilter('key-projects', 'orgL4', ['A组'], 5)
    expect(cf.tableFilters('key-projects').orgL4).toBeDefined()
    await mountView()
    expect(cf.tableFilters('key-projects').orgL4).toBeUndefined()
  })

  // V2.6.3:分页 + 总数(同 /projects)
  it('S1:>50 行触发分页,总数与渲染行数受控', async () => {
    const ds = useDataStore()
    const many = Array.from({ length: 51 }, (_, i) => ({
      projectId: `K${i}`, projectName: `重点${i}`, projectManager: '何平', orgL4: 'A组', top1000: '是',
      paymentPmis: { contract: 2_000_000 }, payment: {}, health: {},
    }))
    ds.data = {
      meta: {}, dashboard: {}, summary: {}, rawNodes: [], displayColumns: {}, followupRecords: {},
      projects: many, projectPmis: {},
    } as any
    const a = useAuthStore()
    a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: ['projects-key'], allowedL4: [] }
    const w = await mountView()
    expect(w.text()).toContain('共 51 条')
    expect(w.text()).toContain('合同金额合计')
    expect(w.find('.el-pagination').exists()).toBe(true)
    expect(w.findAll('.el-table__body-wrapper tbody tr').length).toBeLessThanOrEqual(50)
  })
})
