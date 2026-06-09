import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import DataQualityView from './DataQualityView.vue'

function seed(dq: any) {
  const store = useDataStore()
  ;(store as any).data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [],
    projectOverview: { projects: [], columns: [] }, dataQuality: dq,
  }
}

describe('DataQualityView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows empty guide when PMIS not provided', () => {
    seed({ summary: { pmisProvided: false }, themes: [], unmatched: [], backfill: [], conflicts: [], dirty: [] })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('未提供 PMIS')
  })

  it('renders scorecard + unmatched count when provided', () => {
    seed({
      summary: { pmisProvided: true, joinRate: 0.98, matchedActive: 462, matchedClosed: 158, unmatched: 8 },
      themes: [{ theme: '成本预算', verdict: 'yellow', coveragePct: 0.5, fields: [] }],
      unmatched: [{ projectId: 'SF-1', projectName: '甲', kind: 'SF售前' }],
      backfill: [], conflicts: [], dirty: [],
    })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('98')
    expect(w.text()).toContain('成本预算')
    expect(w.find('[data-test="unmatched-count"]').text()).toContain('1')
  })
})
