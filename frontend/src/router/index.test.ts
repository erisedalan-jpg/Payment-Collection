import { describe, it, expect } from 'vitest'
import { router } from './index'

describe('router', () => {
  it('resolves all top-level pages', () => {
    for (const path of ['/', '/board', '/calendar', '/followup', '/ledger', '/data', '/about', '/projects', '/activity', '/payment']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
  })

  it('board / about 解析到真实视图（非占位 PageStub）', () => {
    const b = router.resolve('/board')
    const a = router.resolve('/about')
    expect((b.matched[0].components?.default as any).__name).toBe('BoardView')
    expect((a.matched[0].components?.default as any).__name).toBe('AboutView')
  })

  it('resolves analysis pages with tab param', () => {
    const r = router.resolve('/analysis/plan')
    expect(r.matched.length).toBeGreaterThan(0)
    expect(r.name).toBe('analysis')
    expect(r.params.tab).toBe('plan')
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
