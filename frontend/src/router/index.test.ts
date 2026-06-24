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
    for (const path of ['/', '/payment', '/insight/board', '/payment/projects', '/payment/nodes', '/payment/plan', '/payment/risk', '/insight/calendar', '/insight/milestone', '/insight/costdetail', '/ledger', '/data', '/about', '/projects', '/activity', '/insight']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
  })

  it('/insight/board 解析到 BoardView、/about 解析到 AboutView（非占位 PageStub）', () => {
    const p = router.resolve('/insight/board')
    const a = router.resolve('/about')
    expect((p.matched[0].components?.default as any).__name).toBe('BoardView')
    expect((a.matched[0].components?.default as any).__name).toBe('AboutView')
  })

  it('两个新子页解析到各自 stub 视图', () => {
    expect((router.resolve('/insight/milestone').matched[0].components?.default as any).__name).toBe('MilestoneView')
    expect((router.resolve('/insight/costdetail').matched[0].components?.default as any).__name).toBe('CostDetailView')
  })

  it('回款四子页 + /insight/board 各自命名', () => {
    expect(router.resolve('/insight/board').name).toBe('pay-board')
    expect(router.resolve('/payment/projects').name).toBe('pay-projects')
    expect(router.resolve('/payment/nodes').name).toBe('pay-nodes')
    expect(router.resolve('/payment/plan').name).toBe('pay-plan')
    expect(router.resolve('/payment/risk').name).toBe('pay-risk')
  })

  // 函数式 redirect 仅在导航时生效(resolve 不跟随),故用 push 后断言 currentRoute
  it('旧 /panalysis/:tab 导航 redirect 到 /payment/:tab', async () => {
    await router.push('/panalysis/plan')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-plan')
    expect(cur.redirectedFrom?.path).toBe('/panalysis/plan')
  })

  it('旧 /panalysis 缺省 redirect 到 /insight/board', async () => {
    await router.push('/panalysis')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.path).toBe('/insight/board')
    expect(cur.redirectedFrom?.path).toBe('/panalysis')
  })

  it('旧 /board 导航 redirect 到 /insight/board 并保 query(dim)', async () => {
    await router.push('/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.path).toBe('/insight/board')
    expect(cur.query.dim).toBe('orgL4')
    expect(cur.redirectedFrom?.path).toBe('/board')
  })

  it('旧 /payment/board 导航 redirect 到 /insight/board 并保 query(dim)', async () => {
    await router.push('/payment/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.path).toBe('/insight/board')
    expect(cur.query.dim).toBe('orgL4')
    expect(cur.redirectedFrom?.path).toBe('/payment/board')
  })

  it('旧 /calendar 导航 redirect 到 /insight/calendar', async () => {
    await router.push('/calendar')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('calendar')
    expect(cur.path).toBe('/insight/calendar')
    expect(cur.redirectedFrom?.path).toBe('/calendar')
  })

  it('旧 /analysis/:tab 导航 redirect 到 /payment/:tab', async () => {
    await router.push('/analysis/risk')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-risk')
    expect(cur.redirectedFrom?.path).toBe('/analysis/risk')
    expect(Object.keys(cur.query).length).toBe(0)
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
})
