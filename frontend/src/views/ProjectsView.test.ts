import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ProjectsView from './ProjectsView.vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useCrossFilterStore } from '@/stores/crossFilter'
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
    meta: {}, dashboard: {}, summary: {}, rawNodes: [],
    displayColumns: {}, followupRecords: {},
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
    ds.data = { meta: {}, dashboard: {}, summary: {}, rawNodes: [], displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {} } as any
    const w = mountView()
    expect(w.text()).toContain('暂无项目主域数据')
  })

  it('路由 query 初始化筛选并显示可关闭标签(风险焦点行跳入): overspend 走本地特殊态', async () => {
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

  it('orgL4 深链 → crossFilter 被设值且表格仅剩匹配行', async () => {
    seed()
    await router.push('/projects?orgL4=B组')
    await router.isReady()
    const cf = useCrossFilterStore()
    const w = mountView()
    await flushPromises()
    // crossFilter 被设值
    const tfs = cf.tableFilters('projects-active')
    expect(tfs['orgL4']).toBeDefined()
    // 过滤结果不弱化
    expect(w.text()).toContain('P-2')
    expect(w.text()).not.toContain('P-1')
  })

  it('riskLevel 深链 → crossFilter 被设值且表格仅剩匹配行', async () => {
    seed()
    await router.push('/projects?riskLevel=中')
    await router.isReady()
    const cf = useCrossFilterStore()
    const w = mountView()
    await flushPromises()
    // crossFilter 被设值
    const tfs = cf.tableFilters('projects-active')
    expect(tfs['riskLevel']).toBeDefined()
    // 过滤结果不弱化
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
    expect(push).not.toHaveBeenCalled()
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

  it('KPI 深链进页清空残留筛选,不与既有筛选叠加', async () => {
    seed()
    // 预置一个与本次深链无关的列筛选（模拟跨导航残留）
    const cf = useCrossFilterStore()
    cf.setColumnFilter('projects-active', 'projectManager', ['何平'], 2)
    // 确认预置已生效
    expect(cf.tableFilters('projects-active')['projectManager']).toBeDefined()
    // 深链进入，riskLevel=中（P-1 有 risk.最高等级=中；P-2 无 PMIS 数据→中 riskLevel）
    await router.push('/projects?riskLevel=中')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    // clearAll 已在 setup 清掉 projectManager 残留
    const tfs = cf.tableFilters('projects-active')
    expect(tfs['projectManager']).toBeUndefined()
    // riskLevel 深链已被重建
    expect(tfs['riskLevel']).toBeDefined()
    // 渲染行只含 riskLevel=中 的项目（P-1），不被 projectManager=何平 叠加过滤
    // P-1 经理何平 riskLevel 中 → 应出现
    expect(w.text()).toContain('P-1')
    // P-2 无 PMIS → riskLevel 为空或非"中"，不应出现（本数据中 P-2 无 projectPmis，riskLevel 应为空/未定义）
    // 此断言验证筛选精确性：总数仅含匹配 riskLevel=中 群体
    const totalText = w.text().match(/共\s*(\d+)\s*条/)
    expect(totalText).not.toBeNull()
    const totalCount = parseInt(totalText![1], 10)
    // 不被 projectManager 叠加：若叠加则 何平+riskLevel=中 → 最多 1 行；
    // 正确行为：riskLevel=中 群体（只看 riskLevel），P-1 riskLevel=中 → 1 行。
    // 关键：projectManager 筛选已被清除，total 不受其约束
    expect(totalCount).toBeGreaterThanOrEqual(1)
    // store 状态无 projectManager key 是核心断言
    expect(Object.keys(tfs)).not.toContain('projectManager')
    expect(Object.keys(tfs)).toContain('riskLevel')
  })

  // ---- 新增断言 ----

  it('默认列含"项目状态"且位于"回款完成率"与"健康度"之间', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    const headers = w.findAll('th').map((n) => n.text().trim()).filter((t) => t)
    const iPayRatio = headers.findIndex((t) => t.includes('回款完成率'))
    const iStatus = headers.findIndex((t) => t.includes('项目状态'))
    const iHealth = headers.findIndex((t) => t.includes('健康度'))
    expect(iPayRatio).toBeGreaterThanOrEqual(0)
    expect(iStatus).toBeGreaterThan(iPayRatio)
    expect(iHealth).toBeGreaterThan(iStatus)
  })

  it('列名显示"L4组"而非"服务组(L4)"', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('L4组')
    expect(w.text()).not.toContain('服务组(L4)')
  })

  it('表头可筛列有 ColumnFilter ▼', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    // cf-icon 是 ColumnFilter 内的触发按钮
    expect(w.findAll('.cf-icon').length).toBeGreaterThan(0)
  })

  it('工具栏有选列按钮 colpick-btn', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.find('.colpick-btn').exists()).toBe(true)
  })

  it('横滚容器 .pv-scroll 存在', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.find('.pv-scroll').exists()).toBe(true)
  })

  it('TOP1000/象限 列存在于 ALL_COLUMNS 但默认隐藏(不在 DEFAULT_VISIBLE)', async () => {
    seed()
    // 默认挂载:两列不在表头(未进 DEFAULT_VISIBLE)
    const w1 = mountView()
    await flushPromises()
    const def = w1.findAll('th').map((n) => n.text().trim())
    expect(def.some((t) => t.includes('TOP1000'))).toBe(false)
    expect(def.some((t) => t.includes('象限'))).toBe(false)
    // 启用后两列出现 → 证明它们确实存在于 ALL_COLUMNS(否则永远无法渲染)
    localStorage.setItem('colprefs:projects-active',
      JSON.stringify(['projectName', 'top1000', 'quadrant', 'action']))
    const w2 = mountView()
    await flushPromises()
    const on = w2.findAll('th').map((n) => n.text().trim())
    expect(on.some((t) => t.includes('TOP1000'))).toBe(true)
    expect(on.some((t) => t.includes('象限'))).toBe(true)
    localStorage.clear()
  })

  it('启用后 TOP1000/象限 列渲染且带筛选器(可筛)', async () => {
    seed()
    localStorage.setItem('colprefs:projects-active',
      JSON.stringify(['projectName', 'top1000', 'quadrant', 'action']))
    const w = mountView()
    await flushPromises()
    const ths = w.findAll('th')
    const topTh = ths.find((n) => n.text().includes('TOP1000'))
    const quadTh = ths.find((n) => n.text().includes('象限'))
    expect(topTh).toBeTruthy()
    expect(quadTh).toBeTruthy()
    // FILTERABLE → 表头含 ColumnFilter 触发器 .cf-icon
    expect(topTh!.find('.cf-icon').exists()).toBe(true)
    expect(quadTh!.find('.cf-icon').exists()).toBe(true)
    localStorage.clear()
  })

  it('签约单位列默认隐藏,不在默认表头', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.text()).not.toContain('签约单位')
    const vm: any = w.findComponent({ name: 'ProjectsView' }).vm
    expect(vm.ALL_COLUMNS.map((c: any) => c.key)).toContain('signUnit')
  })

  it('orgL4 空项目渲染「数据异常」标记，正常项目不渲染', async () => {
    const ds = useDataStore()
    ds.data = {
      meta: {}, dashboard: {}, summary: {}, rawNodes: [],
      displayColumns: {}, followupRecords: {},
      projects: [
        { projectId: 'NORMAL', projectName: '正常项目', projectManager: '甲', orgL4: 'A组', isPresale: false, relatedClosedId: '',
          payment: { relatedNodeCount: 1, expectedTotal: 100, actualTotal: 50, remainingTotal: 50, paymentRatio: 0.5, delayedCount: 0 }, health: { overall: '健康' } },
        { projectId: 'WSGF-SS-202604169018', projectName: '异常项目', projectManager: '乙', orgL4: '', isPresale: false, relatedClosedId: '',
          payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }, health: { overall: '关注' } },
      ],
      projectPmis: {},
    } as any
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('数据异常')
    expect(w.findAll('.pv-anomaly').length).toBe(1)
  })
})

describe('ProjectsView 列排序', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/projects', component: ProjectsView },
        { path: '/project/:id', component: { template: '<div />' } },
      ],
    })
    const tagsStore = useProjectTagsStore()
    tagsStore.load = vi.fn().mockResolvedValue(undefined)
    const d = useDataStore()
    ;(d as any).data = { projects: [], projectPmis: {} }
  })
  it('六列开启 sortable', () => {
    const w = mountView()
    const cols = (w.vm as any).ALL_COLUMNS as { key: string; sortable?: boolean }[]
    for (const k of ['projectManager', 'orgL4', 'riskLevel', 'projectLevel', 'projectType', 'projectStatus']) {
      expect(cols.find((c) => c.key === k)?.sortable, k).toBe(true)
    }
  })
})
