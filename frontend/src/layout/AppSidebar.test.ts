import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div/>' } },
      { path: '/projects', component: { template: '<div/>' } },
      { path: '/projects/key', component: { template: '<div/>' } },
      { path: '/opportunities', component: { template: '<div/>' } },
      { path: '/opportunities/key', component: { template: '<div/>' } },
      { path: '/projects/temp', component: { template: '<div/>' } },
      { path: '/payment/key', component: { template: '<div/>' } },
      { path: '/projects/closed', component: { template: '<div/>' } },
      { path: '/activity', component: { template: '<div/>' } },
      { path: '/insight', component: { template: '<div/>' } },
      { path: '/insight/milestone', component: { template: '<div/>' } },
      { path: '/insight/costdetail', component: { template: '<div/>' } },
      { path: '/insight/risk', component: { template: '<div/>' } },
      { path: '/opportunities/board', component: { template: '<div/>' } },
      { path: '/payment/board', component: { template: '<div/>' } },
      { path: '/payment/calendar', component: { template: '<div/>' } },
      { path: '/payment', component: { template: '<div/>' } },
      { path: '/payment/projects', component: { template: '<div/>' } },
      { path: '/payment/nodes', component: { template: '<div/>' } },
      { path: '/yitian', component: { template: '<div/>' } },
      { path: '/yitian/compliance', component: { template: '<div/>' } },
      { path: '/yitian/analytics', component: { template: '<div/>' } },
      { path: '/yitian/trend', component: { template: '<div/>' } },
      { path: '/yitian/customer', component: { template: '<div/>' } },
      { path: '/data', component: { template: '<div/>' } },
      { path: '/governance', component: { template: '<div/>' } },
      { path: '/about', component: { template: '<div/>' } },
      { path: '/admin', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

/** 按指定权限挂载(isSuper=false,只给 allowedPages)。 */
async function mountWith(pages: string[]) {
  const router = makeRouter()
  router.push('/')
  await router.isReady()
  const a = useAuthStore()
  a.user = { account: 'n', displayName: 'n', isSuper: false, allowedPages: pages, allowedL4: [] }
  return mount(AppSidebar, { global: { plugins: [router] } })
}

/** 以超管身份挂载在指定路由(用于 section 归属反查断言)。 */
async function mountAtRoute(path: string) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const a = useAuthStore()
  a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: [], allowedL4: [] }
  return mount(AppSidebar, { global: { plugins: [router] } })
}

const secOf = (w: Awaited<ReturnType<typeof mountAtRoute>>, anchor: string) =>
  w.findAll('.section').find((s) => s.text().includes(anchor))!

describe('AppSidebar', () => {
  it('renders 项目/回款/商机/工时/重点跟进/工具 六段分组', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const a = useAuthStore()
    a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: [], allowedL4: [] }
    const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
    const text = wrapper.text()
    expect(text).toContain('项目总览')        // 项目组（P4 新首页）
    expect(text).toContain('在建项目')        // 项目组（在建）
    expect(text).toContain('已关闭项目')      // 项目组（已关闭）
    expect(text).toContain('项目动态')
    expect(text).toContain('项目分析')        // 项目组:tab 容器入口
    expect(text).toContain('回款分析')        // 回款组:tab 容器入口
    expect(text).toContain('工时分析')        // 工时组:tab 容器入口
    expect(text).toContain('商机')            // 商机独立成组
    expect(text).toContain('商机看板')        // 商机组(原在项目分析中心)
    expect(text).toContain('回款总览')        // 回款组
    expect(text).toContain('回款项目')
    expect(text).toContain('回款节点')
    expect(text).toContain('数据管理')        // 工具组
    expect(text).toContain('概算工具')        // 工具组(V3.1.0 新增,数据治理下方/关于产品上方)
    expect(text).toContain('重点项目进展')    // 重点跟进分区
    expect(text).toContain('商机清单')        // 商机组(V4.4.7 从项目组迁出)
    expect(text).toContain('重点商机跟进')    // 重点跟进分区(新页)
    expect(text).toContain('临时重点跟进')    // 重点跟进分区
    expect(text).toContain('风险跟进')        // 重点跟进分区(新页)
    expect(text).toContain('回款重点跟进')    // 重点跟进分区(新页)
    expect(text).toContain('倚天工时')        // 倚天工时分区标题(V3.0.0)
    expect(text).toContain('工时总览')        // 倚天工时组(V4.4.7 由「倚天工时总览」改名)
    expect(text).toContain('工时明细')        // 倚天工时组(V4.1.0)
    expect(text).not.toContain('看板首页')    // 旧 label 退场
    expect(text).not.toContain('多维看板')    // 迁移后更名为「回款多维分析」
    expect(text).not.toContain('回款进度')    // /payment/plan 已删
    expect(text).not.toContain('风险项目')    // /payment/risk 已删
    expect(text).not.toContain('回款台账')    // /ledger 已删
    // 分组标题按 NAV_SECTIONS 顺序渲染,末尾追加超管专属「系统管理」(caret 字符不参与比对)
    expect(wrapper.findAll('.section-label').map((b) => b.text().replace(/[▾▸]/g, '')))
      .toEqual(['项目', '回款', '商机', '倚天工时', '重点跟进', '工具', '系统管理'])
    // 七个分区子项统一二级呈现(.nav-sub):项目(4+分析入口)+回款(3+分析入口)+商机(2)
    // +倚天工时(2+分析入口)+重点跟进(5)+工具(4)+系统管理(1) = 24;10 个分析页已收进页内 tab
    expect(wrapper.findAll('.nav-sub').length).toBe(24)
  })

  it('toggle button flips uiStore collapsed', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const a = useAuthStore()
    a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: [], allowedL4: [] }
    const ui = useUiStore()
    const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
    expect(ui.sidebarCollapsed).toBe(false)
    await wrapper.get('[data-test="sidebar-toggle"]').trigger('click')
    expect(ui.sidebarCollapsed).toBe(true)
  })
})

describe('AppSidebar 权限过滤', () => {
  it('超管显示全部分组链接', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const a = useAuthStore()
    a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: [], allowedL4: [] }
    const w = mount(AppSidebar, { global: { plugins: [router] } })
    expect(w.text()).toContain('数据管理')
    expect(w.text()).toContain('在建项目')
    expect(w.text()).toContain('回款节点')
  })
  it('普通用户(仅 data)只显数据管理,其余 section 不显', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const a = useAuthStore()
    a.user = { account: 'n', displayName: 'n', isSuper: false, allowedPages: ['data'], allowedL4: [] }
    const w = mount(AppSidebar, { global: { plugins: [router] } })
    expect(w.text()).toContain('数据管理')
    expect(w.text()).not.toContain('在建项目')
    expect(w.text()).not.toContain('回款节点')
  })

  it('tab 容器入口 to 指向该组第一个可见 tab(不硬编码首项)', async () => {
    // 只授予「成本分析」的账号,点「项目分析」必须落到 /insight/costdetail;
    // 若硬编码指向 /insight(多维分析),该账号会被路由守卫弹回 —— 入口可见却点不动。
    const w = await mountWith(['insight-costdetail'])
    const link = w.findAll('a').find((a) => a.text() === '项目分析')!
    expect(link.attributes('href')).toBe('/insight/costdetail')
  })

  it('整组 tab 都不可访问时,容器入口不渲染', async () => {
    const w = await mountWith(['projects'])
    expect(w.text()).not.toContain('项目分析')
  })
})

describe('AppSidebar 系统管理入口', () => {
  it('超管见"账号管理"链接', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const a = useAuthStore()
    a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: [], allowedL4: [] }
    const w = mount(AppSidebar, { global: { plugins: [router] } })
    expect(w.text()).toContain('账号管理')
    const links = w.findAll('a')
    expect(links.some((l) => l.attributes('href') === '/admin')).toBe(true)
  })

  it('普通用户不见"账号管理"链接', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const a = useAuthStore()
    a.user = { account: 'n', displayName: 'n', isSuper: false, allowedPages: ['data'], allowedL4: [] }
    const w = mount(AppSidebar, { global: { plugins: [router] } })
    expect(w.text()).not.toContain('账号管理')
    const links = w.findAll('a')
    expect(links.some((l) => l.attributes('href') === '/admin')).toBe(false)
  })
})

describe('AppSidebar section 归属反查', () => {
  it('section 归属反查:/projects/key 归重点跟进,不被 /projects 前缀抢走', async () => {
    const w = await mountAtRoute('/projects/key')
    expect(secOf(w, '重点项目进展').classes()).not.toContain('collapsed')
    expect(secOf(w, '在建项目').classes()).toContain('collapsed')
  })

  it('section 归属反查:tab 页 /insight/milestone 归项目组', async () => {
    const w = await mountAtRoute('/insight/milestone')
    expect(secOf(w, '项目分析').classes()).not.toContain('collapsed')
  })

  it('section 归属反查:/payment/board 归回款组', async () => {
    const w = await mountAtRoute('/payment/board')
    expect(secOf(w, '回款分析').classes()).not.toContain('collapsed')
  })
})

describe('AppSidebar 分区可折叠', () => {
  async function mountAt(path: string) {
    const router = makeRouter()
    router.push(path)
    await router.isReady()
    const a = useAuthStore()
    a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: [], allowedL4: [] }
    return mount(AppSidebar, { global: { plugins: [router] } })
  }
  const sec = (w: ReturnType<typeof mount>, anchor: string) =>
    w.findAll('.section').find((s) => s.text().includes(anchor))!

  it('默认仅展开当前页所在分区(route / → 项目组展开, 回款组收起)', async () => {
    const w = await mountAt('/')
    expect(sec(w, '在建项目').classes()).not.toContain('collapsed')      // 项目组展开
    expect(sec(w, '回款分析').classes()).toContain('collapsed')          // 回款组收起
  })

  it('route /insight → 项目组展开(分析 tab 页归项目组), 回款组收起', async () => {
    const w = await mountAt('/insight')
    expect(sec(w, '项目分析').classes()).not.toContain('collapsed')
    expect(sec(w, '回款分析').classes()).toContain('collapsed')
  })

  it('点击分区标题切换展开态并写 ui.sectionExpanded', async () => {
    const ui = useUiStore()
    const w = await mountAt('/')
    const payment = sec(w, '回款分析')
    expect(payment.classes()).toContain('collapsed')                    // 默认收起
    await payment.find('.section-label').trigger('click')
    expect(ui.sectionExpanded['payment']).toBe(true)
    expect(sec(w, '回款分析').classes()).not.toContain('collapsed')       // 点开
  })

  it('已手动展开的分区在非活动页仍保持展开(覆盖默认)', async () => {
    localStorage.setItem('sidebar_sections', JSON.stringify({ payment: true }))
    const w = await mountAt('/')   // 活动分区是 project,但 payment 被手动置 true
    expect(sec(w, '回款节点').classes()).not.toContain('collapsed')
  })
})
