import { describe, it, expect } from 'vitest'
import { router } from './index'

describe('router', () => {
  it('resolves all top-level pages', () => {
    for (const path of ['/', '/compare', '/calendar', '/followup', '/ledger', '/pmview', '/data', '/about']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
  })

  it('compare / about 解析到真实视图（非占位 PageStub）', () => {
    const c = router.resolve('/compare')
    const a = router.resolve('/about')
    expect((c.matched[0].components?.default as any).__name).toBe('CompareView')
    expect((a.matched[0].components?.default as any).__name).toBe('AboutView')
  })

  it('resolves tier pages with tab + tier params', () => {
    const r = router.resolve('/tier/plan/above1m')
    expect(r.matched.length).toBeGreaterThan(0)
    expect(r.params.tab).toBe('plan')
    expect(r.params.tier).toBe('above1m')
  })

  it('unknown path falls back to dashboard', () => {
    const r = router.resolve('/nonexistent-xyz')
    expect(r.name).toBe('dashboard')
  })
})
