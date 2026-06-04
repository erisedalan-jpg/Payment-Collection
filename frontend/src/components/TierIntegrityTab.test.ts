import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TierIntegrityTab from './TierIntegrityTab.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed(incomplete: any[]) {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {},
    summary: { '100万以上': { projectCount: 1, incompleteData: incomplete } },
    rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('TierIntegrityTab', () => {
  it('renders incomplete rows + 缺失 markers + count', () => {
    seed([{ projectId: 'P1', projectName: '甲', orgL4: '北京', projectManager: '张三', projectCompletion: '', isMilestoneAchieved: '' }])
    const wrapper = mount(TierIntegrityTab, { props: { tier: '100万以上' } })
    const text = wrapper.text()
    expect(text).toContain('P1')
    expect(text).toContain('北京')
    expect(text).toContain('缺失')
    expect(text).toContain('共 1 条')
  })

  it('shows complete hint when no incomplete data', () => {
    seed([])
    const wrapper = mount(TierIntegrityTab, { props: { tier: '100万以上' } })
    expect(wrapper.text()).toContain('数据完整')
  })
})
