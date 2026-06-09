import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import DataQualityView from './DataQualityView.vue'

function seed(d: any) {
  const store = useDataStore()
  ;(store as any).data = d
}

describe('DataQualityView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })) as any)
  })

  it('数据未加载时提示加载/后端', () => {
    seed(null)
    const w = mount(DataQualityView)
    expect(w.text()).toContain('加载')
  })

  it('数据无 dataQuality 时提示重新同步', () => {
    seed({ rawNodes: [], projectOverview: { projects: [], columns: [] } })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('不含治理信息')
  })

  it('PMIS 未提供时提示未提供 PMIS', () => {
    seed({ dataQuality: { summary: { pmisProvided: false }, themes: [], unmatched: [], backfill: [], conflicts: [], dirty: [] } })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('未提供 PMIS')
  })

  it('提供时渲染记分卡 + 未匹配计数', () => {
    seed({
      dataQuality: {
        summary: { pmisProvided: true, joinRate: 0.98, matchedActive: 462, matchedClosed: 158, unmatched: 8 },
        themes: [{ theme: '成本预算', verdict: 'yellow', coveragePct: 0.5, fields: [] }],
        unmatched: [{ projectId: 'SF-1', projectName: '甲', kind: 'SF售前' }],
        backfill: [], conflicts: [], dirty: [],
      },
    })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('98')
    expect(w.text()).toContain('成本预算')
    expect(w.find('[data-test="unmatched-count"]').text()).toContain('1')
  })
})
