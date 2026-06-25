import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/opportunityFollowupApi', () => ({
  opportunityFollowupApi: {
    get: vi.fn().mockResolvedValue({
      scope: { combinator: 'AND', groups: [] }, current: { 'opp-1': { weekProgress: 'x' } }, archives: [],
    }),
    saveScope: vi.fn().mockResolvedValue({ scope: { combinator: 'OR', groups: [] } }),
    update: vi.fn().mockResolvedValue({ record: { weekProgress: 'y', weekProgressEditBy: 'admin' } }),
    archive: vi.fn().mockResolvedValue({ archives: [{ archiveTime: 't', rows: [] }] }),
  },
}))

import { useOpportunityFollowupStore } from './opportunityFollowup'

describe('useOpportunityFollowupStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load 填充 scope/current/archives', async () => {
    const s = useOpportunityFollowupStore(); await s.load()
    expect(s.loaded).toBe(true)
    expect(s.current['opp-1'].weekProgress).toBe('x')
  })
  it('saveScope 更新 scope', async () => {
    const s = useOpportunityFollowupStore(); await s.saveScope({ combinator: 'OR', groups: [] })
    expect(s.scope.combinator).toBe('OR')
  })
  it('update 合并单商机记录(键=oppId)', async () => {
    const s = useOpportunityFollowupStore(); await s.update('opp-1', 'weekProgress', 'y')
    expect(s.current['opp-1'].weekProgress).toBe('y')
  })
  it('archive 后清空 current', async () => {
    const s = useOpportunityFollowupStore(); await s.load(); await s.archive([])
    expect(s.archives).toHaveLength(1)
    expect(s.current).toEqual({})
  })
  it('reset 复位', async () => {
    const s = useOpportunityFollowupStore(); await s.load(); s.reset()
    expect(s.loaded).toBe(false)
    expect(s.archives).toEqual([])
  })
})
