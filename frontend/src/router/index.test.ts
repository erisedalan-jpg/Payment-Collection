import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { router } from './index'
import { useAuthStore } from '@/stores/auth'

describe('router', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = { account: 'test', displayName: 'Test', isSuper: true, allowedPages: [], allowedL4: [] }
    vi.spyOn(auth, 'ensureReady').mockResolvedValue()
    await router.push('/')
  })

  it('resolves all top-level pages', () => {
    for (const path of ['/', '/payment', '/payment/board', '/payment/projects', '/payment/nodes', '/payment/calendar', '/insight/milestone', '/insight/costdetail', '/data', '/about', '/projects', '/activity', '/insight', '/yitian/detail']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
  })

  it('/payment/board 解析到 BoardView、/about 解析到 AboutView（非占位 PageStub）', () => {
    const p = router.resolve('/payment/board')
    const a = router.resolve('/about')
    expect((p.matched[0].components?.default as any).__name).toBe('BoardView')
    expect((a.matched[0].components?.default as any).__name).toBe('AboutView')
  })

  it('两个新子页解析到各自 stub 视图', () => {
    expect((router.resolve('/insight/milestone').matched[0].components?.default as any).__name).toBe('MilestoneView')
    expect((router.resolve('/insight/costdetail').matched[0].components?.default as any).__name).toBe('CostDetailView')
  })

  it('回款两子页 + /payment/board 各自命名', () => {
    expect(router.resolve('/payment/board').name).toBe('pay-board')
    expect(router.resolve('/payment/projects').name).toBe('pay-projects')
    expect(router.resolve('/payment/nodes').name).toBe('pay-nodes')
  })

  // 函数式 redirect 仅在导航时生效(resolve 不跟随),故用 push 后断言 currentRoute
  it('旧 /panalysis/:tab(仍存在的 nodes/projects) 导航 redirect 到 /payment/:tab', async () => {
    await router.push('/panalysis/nodes')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-nodes')
    expect(cur.redirectedFrom?.path).toBe('/panalysis/nodes')
  })

  it('旧 /panalysis/plan(已删页) 导航 redirect 到 /payment', async () => {
    await router.push('/panalysis/plan')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('payment')
    expect(cur.path).toBe('/payment')
    expect(cur.redirectedFrom?.path).toBe('/panalysis/plan')
  })

  it('旧 /panalysis 缺省 redirect 到 /payment/board', async () => {
    await router.push('/panalysis')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.path).toBe('/payment/board')
    expect(cur.redirectedFrom?.path).toBe('/panalysis')
  })

  it('旧 /board 导航 redirect 到 /payment/board 并保 query(dim)', async () => {
    await router.push('/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.path).toBe('/payment/board')
    expect(cur.query.dim).toBe('orgL4')
    expect(cur.redirectedFrom?.path).toBe('/board')
  })

  it('/payment/board 现为真实路由(不再 redirect),直达且保 query(dim)', async () => {
    // V4.4.7:board 迁回回款域,原先「/payment/board → /insight/board」的 redirect 已删。
    await router.push('/payment/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.path).toBe('/payment/board')
    expect(cur.query.dim).toBe('orgL4')
    expect(cur.redirectedFrom).toBeUndefined()
  })

  it('旧 /calendar 导航 redirect 到 /payment/calendar', async () => {
    await router.push('/calendar')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('calendar')
    expect(cur.path).toBe('/payment/calendar')
    expect(cur.redirectedFrom?.path).toBe('/calendar')
  })

  it('旧 /analysis/:tab(已删页 risk) 导航 redirect 到 /payment', async () => {
    await router.push('/analysis/risk')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('payment')
    expect(cur.path).toBe('/payment')
    expect(cur.redirectedFrom?.path).toBe('/analysis/risk')
    expect(Object.keys(cur.query).length).toBe(0)
  })

  it('旧 /analysis/:tab(仍存在的 projects) 导航 redirect 到 /payment/projects', async () => {
    await router.push('/analysis/projects')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-projects')
    expect(cur.redirectedFrom?.path).toBe('/analysis/projects')
  })

  it('旧 /ledger 直接访问 redirect 到 /payment', async () => {
    await router.push('/ledger')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('payment')
    expect(cur.path).toBe('/payment')
  })

  it('旧 /payment/plan 直接访问 redirect 到 /payment', async () => {
    await router.push('/payment/plan')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('payment')
    expect(cur.path).toBe('/payment')
  })

  it('旧 /payment/risk 直接访问 redirect 到 /payment', async () => {
    await router.push('/payment/risk')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('payment')
    expect(cur.path).toBe('/payment')
  })

  it('/projects/key 解析到 KeyProjectsView，pageKey=projects-key', () => {
    const r = router.resolve('/projects/key')
    expect(r.name).toBe('projects-key')
    expect((r.matched[0].components?.default as any).__name).toBe('KeyProjectsView')
    expect(r.matched[0].meta.pageKey).toBe('projects-key')
  })

  it('resolves project detail with id param', () => {
    const r = router.resolve('/project/QABJ-SS-1')
    expect(r.params.id).toBe('QABJ-SS-1')
    expect(r.name).toBe('project-detail')
  })

  it('unknown path falls back to overview', () => {
    const r = router.resolve('/nonexistent-xyz')
    expect(r.name).toBe('overview')
  })

  it('/ resolves overview and /payment resolves dashboard', () => {
    expect(router.resolve('/').name).toBe('overview')
    expect(router.resolve('/payment').name).toBe('payment')
  })

  it('/payment/key 解析到 payment-key（PaymentKeyFollowupView）', () => {
    const r = router.resolve('/payment/key')
    expect(r.name).toBe('payment-key')
    expect((r.matched[0].components?.default as any).__name).toBe('PaymentKeyFollowupView')
    expect(r.matched[0].meta.pageKey).toBe('payment-key')
  })

  it('/yitian/detail 解析到 YitianDetailView', () => {
    expect((router.resolve('/yitian/detail').matched[0].components?.default as any).__name).toBe('YitianDetailView')
  })

  it('旧 /insight/board 导航 redirect 到 /payment/board,保留 query', async () => {
    await router.push('/insight/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.path).toBe('/payment/board')
    expect(cur.query).toEqual({ dim: 'orgL4' })
    expect(cur.redirectedFrom?.path).toBe('/insight/board')
  })

  it('旧 /insight/calendar 导航 redirect 到 /payment/calendar', async () => {
    await router.push('/insight/calendar')
    expect(router.currentRoute.value.path).toBe('/payment/calendar')
  })

  it('12 个 tab 页各自带正确的 meta.tabGroup', () => {
    // 手工清单,非派生 —— 新增 tab 页须同步补一行。V4.5.5 加 /yitian/customer-product 时
    // 漏补(标题仍写 10、实际只列 10 条),V4.5.6 一并补齐,使本清单与 nav.test.ts 的
    // 「tab 组共 12 页」对齐;两处对不上即说明路由与 TAB_GROUPS 有一侧漏登记。
    const cases: [string, string][] = [
      ['/insight', 'project-analysis'], ['/insight/milestone', 'project-analysis'],
      ['/insight/costdetail', 'project-analysis'], ['/insight/risk', 'project-analysis'],
      ['/payment/board', 'payment-analysis'], ['/payment/calendar', 'payment-analysis'],
      ['/yitian/compliance', 'yitian-analysis'], ['/yitian/analytics', 'yitian-analysis'],
      ['/yitian/trend', 'yitian-analysis'], ['/yitian/customer', 'yitian-analysis'],
      ['/yitian/customer-product', 'yitian-analysis'], ['/yitian/governance', 'yitian-analysis'],
    ]
    expect(cases.length, '清单规模与 TAB_GROUPS 总数脱节').toBe(12)
    for (const [path, group] of cases) {
      expect(router.resolve(path).meta.tabGroup).toBe(group)
    }
  })

  it('非 tab 页不带 tabGroup(不误渲染 tab 条)', () => {
    for (const p of ['/', '/projects', '/payment', '/yitian', '/data', '/risk']) {
      expect(router.resolve(p).meta.tabGroup).toBeUndefined()
    }
  })
})
