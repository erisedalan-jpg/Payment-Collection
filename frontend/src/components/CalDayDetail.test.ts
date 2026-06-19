import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalDayDetail from './CalDayDetail.vue'
import type { CalListGroup } from '@/lib/calendar'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

const GROUPS: CalListGroup[] = [
  { key: '延期', color: 'var(--danger)', nodes: [{ projectId: 'P1', projectName: '甲', nodeStatus: '延期' }] as any, subRemaining: 100000 },
]

describe('CalDayDetail', () => {
  it('渲染分组标题与小计', () => {
    const w = mount(CalDayDetail, { props: { title: '2026-06-10 回款节点', groups: GROUPS } })
    expect(w.text()).toContain('2026-06-10 回款节点')
    expect(w.text()).toContain('延期')
    expect(w.text()).toContain('待回款小计')
  })

  it('空分组显示空态', () => {
    const w = mount(CalDayDetail, { props: { title: '当月回款节点', groups: [] } })
    expect(w.text()).toContain('暂无回款节点')
  })
})
