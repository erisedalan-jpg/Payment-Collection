import { describe, it, expect, beforeEach } from 'vitest'
import { router } from './index'

describe('router', () => {
  beforeEach(async () => { await router.push('/') })

  it('resolves all top-level pages', () => {
    for (const path of ['/', '/payment', '/payment/board', '/payment/projects', '/payment/nodes', '/payment/plan', '/payment/risk', '/calendar', '/ledger', '/data', '/about', '/projects', '/activity', '/insight']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
  })

  it('/payment/board 解析到 BoardView、/about 解析到 AboutView（非占位 PageStub）', () => {
    const p = router.resolve('/payment/board')
    const a = router.resolve('/about')
    expect((p.matched[0].components?.default as any).__name).toBe('BoardView')
    expect((a.matched[0].components?.default as any).__name).toBe('AboutView')
  })

  it('五条 /payment/* 路由各自命名', () => {
    expect(router.resolve('/payment/board').name).toBe('pay-board')
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

  it('旧 /panalysis 缺省 redirect 到 /payment/board', async () => {
    await router.push('/panalysis')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.redirectedFrom?.path).toBe('/panalysis')
  })

  it('旧 /board 导航 redirect 到 /payment/board 并保 query(dim)', async () => {
    await router.push('/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.query.dim).toBe('orgL4')
    expect(cur.redirectedFrom?.path).toBe('/board')
  })

  it('旧 /analysis/:tab 导航 redirect 到 /payment/:tab', async () => {
    await router.push('/analysis/risk')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-risk')
    expect(cur.redirectedFrom?.path).toBe('/analysis/risk')
    expect(Object.keys(cur.query).length).toBe(0)
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
