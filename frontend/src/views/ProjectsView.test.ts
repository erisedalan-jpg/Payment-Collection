import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ProjectsView from './ProjectsView.vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import * as followupApiModule from '@/lib/followupApi'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  // projectTags.load 会发真实网络请求（/api/tags），测试环境 mock 掉
  const tagsStore = useProjectTagsStore()
  tagsStore.load = vi.fn().mockResolvedValue(undefined)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/projects', component: ProjectsView },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    projects: [
      { projectId: 'P-1', projectName: '终端安全', projectManager: '何平', orgL4: 'A组', isPresale: false, relatedClosedId: '',
        payment: { relatedNodeCount: 2, expectedTotal: 100, actualTotal: 50, remainingTotal: 50, paymentRatio: 0.5, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '健康' } },
      { projectId: 'P-2', projectName: '售前服务-某局', projectManager: '李四', orgL4: 'B组', isPresale: true, relatedClosedId: 'OLD-9',
        payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '关注' } },
    ],
    projectPmis: {
      'P-1': { progress: { 项目阶段: '项目执行', 完工进展: 0.2 }, status: { 项目状态: '实施中', 项目级别: 'P3', 项目类型: '交付项目' }, risk: { 最高等级: '中', 未关闭风险数: 1 }, cost: { 消耗比: 0.3, 项目超支: true }, customer: { 最终客户: '海聚博源', 合同总额: 1234567 } },
    },
  } as any
}

function mountView() {
  return mount(ProjectsView, { global: { plugins: [ElementPlus, router] } })
}

describe('ProjectsView', () => {
  it('渲染项目行/原项目徽章/健康度徽章', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('P-1')
    expect(w.text()).toContain('售前服务-某局')
    expect(w.text()).toContain('原项目*')
    expect(w.findAll('.health-badge').length).toBeGreaterThanOrEqual(2)
    expect(w.text()).toContain('共 2 条')
  })

  it('R1 三新列:合同金额(万)/级别/项目类型', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('合同金额(万)')
    expect(w.text()).toContain('123.5')   // 1234567 元 → 123.5 万
    expect(w.text()).toContain('P3')
    expect(w.text()).toContain('交付项目')
  })

  it('搜索过滤（按经理）', async () => {
    seed()
    const w = mountView()
    await w.find('.toolbar input').setValue('李四')
    expect(w.text()).toContain('P-2')
    expect(w.text()).not.toContain('P-1')
  })

  it('行点击跳转 /project/:id', async () => {
    seed()
    const w = mountView()
    const push = vi.spyOn(router, 'push')
    await flushPromises()
    await w.find('.el-table__row').trigger('click')
    expect(push).toHaveBeenCalledWith('/project/P-1')
  })

  it('projects 为空 → 空态提示', () => {
    const ds = useDataStore()
    ds.data = { meta: {}, dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] }, naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {} } as any
    const w = mountView()
    expect(w.text()).toContain('暂无项目主域数据')
  })

  it('路由 query 初始化筛选并显示可关闭标签(风险焦点行跳入)', async () => {
    seed()
    await router.push('/projects?overspend=yes')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('超支项目')   // 标签
    expect(w.text()).toContain('P-1')
    expect(w.text()).not.toContain('P-2')   // P-2 无超支
    await w.find('.pv-tag button').trigger('click')
    expect(w.text()).toContain('P-2')       // 关闭标签恢复全量
  })

  it('服务组(L4) query 筛选生效(P5.5)', async () => {
    seed()
    await router.push('/projects?orgL4=B组')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('P-2')
    expect(w.text()).not.toContain('P-1')
  })

  it('query 初始化既有筛选(riskLevel)', async () => {
    seed()
    await router.push('/projects?riskLevel=中')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('P-1')
    expect(w.text()).not.toContain('P-2')
  })

  it('S1:分页器与总数,客户列已删,项目名不可排序', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.find('.pv-pager').exists()).toBe(true)
    expect(w.text()).toContain('共 2 条')
    expect(w.find('.el-pagination').exists()).toBe(true)
    const headers = w.findAll('th').map((n) => n.text())
    expect(headers.some((t) => t.includes('客户'))).toBe(false)
    expect(w.text()).toContain('健康度')
  })

  it('S1:经理/级别多选筛选', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    ;(w.vm as any).filters.manager = ['何平']
    await flushPromises()
    expect(w.text()).toContain('共 1 条')
    ;(w.vm as any).filters.manager = []
    ;(w.vm as any).filters.projectLevel = ['P3']
    await flushPromises()
    expect(w.text()).toContain('共 1 条')
  })

  it('操作列「跟进」按钮存在，点击后 FollowupModal 打开，@click.stop 不触发行跳转', async () => {
    seed()
    const push = vi.spyOn(router, 'push')
    const w = mount(ProjectsView, {
      global: {
        plugins: [ElementPlus, router],
        stubs: { FollowupModal: true },
      },
    })
    await flushPromises()
    const btn = w.find('.pv-fu-btn')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    // click.stop 阻止了行点击，router.push 不应被调用
    expect(push).not.toHaveBeenCalled()
    // fuOpen 应为 true
    expect((w.vm as any).fuOpen).toBe(true)
  })

  it('toolbar 有导出按钮，点击后 exOpen 为 true', async () => {
    seed()
    vi.spyOn(followupApiModule.followupApi, 'all').mockResolvedValue({ records: [], total: 0 } as any)
    const w = mount(ProjectsView, {
      global: {
        plugins: [ElementPlus, router],
        stubs: { FollowupModal: true, Modal: true },
      },
    })
    await flushPromises()
    const exportBtn = w.find('.pv-export-btn')
    expect(exportBtn.exists()).toBe(true)
    await exportBtn.trigger('click')
    expect((w.vm as any).exOpen).toBe(true)
  })
})
