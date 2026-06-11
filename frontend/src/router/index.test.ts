import { describe, it, expect } from 'vitest'
import { router } from './index'

describe('router', () => {
  it('resolves all top-level pages', () => {
    for (const path of ['/', '/panalysis/board', '/calendar', '/followup', '/ledger', '/data', '/about', '/projects', '/activity', '/payment', '/insight']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
  })

  it('panalysis / about 解析到真实视图（非占位 PageStub）', () => {
    const p = router.resolve('/panalysis/board')
    const a = router.resolve('/about')
    expect((p.matched[0].components?.default as any).__name).toBe('PayAnalysisView')
    expect((a.matched[0].components?.default as any).__name).toBe('AboutView')
  })

  it('resolves panalysis pages with tab param', () => {
    const r = router.resolve('/panalysis/plan')
    expect(r.matched.length).toBeGreaterThan(0)
    expect(r.name).toBe('panalysis')
    expect(r.params.tab).toBe('plan')
  })

  it('panalysis 缺省 tab 仍解析到 panalysis(模板默认 board)', () => {
    const r = router.resolve('/panalysis')
    expect(r.name).toBe('panalysis')
    expect(r.params.tab).toBe('')
  })

  // 函数式 redirect 仅在导航时生效(resolve 不跟随),故用 push 后断言 currentRoute
  it('旧 /board 导航 redirect 到 /panalysis/board 并保 query(dim)', async () => {
    await router.push('/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('panalysis')
    expect(cur.params.tab).toBe('board')
    expect(cur.query.dim).toBe('orgL4')
    expect(cur.redirectedFrom?.path).toBe('/board')
  })

  it('旧 /analysis/:tab 导航 redirect 到 /panalysis/:tab', async () => {
    await router.push('/analysis/plan')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('panalysis')
    expect(cur.params.tab).toBe('plan')
    expect(cur.redirectedFrom?.path).toBe('/analysis/plan')
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

  it('/ resolves overview and /payment resolves old dashboard', () => {
    expect(router.resolve('/').name).toBe('overview')
    expect(router.resolve('/payment').name).toBe('payment')
  })
})
