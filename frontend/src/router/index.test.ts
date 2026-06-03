import { describe, it, expect } from 'vitest'
import { router } from './index'

describe('router', () => {
  it('resolves all top-level pages', () => {
    for (const path of ['/', '/compare', '/calendar', '/followup', '/ledger', '/pmview', '/data', '/about']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
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
