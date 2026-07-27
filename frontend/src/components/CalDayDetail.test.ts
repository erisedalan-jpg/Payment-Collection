import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalDayDetail from './CalDayDetail.vue'
import SectionTitle from './SectionTitle.vue'
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

  it('V4.5.1 标题走 SectionTitle 的 card 级(--fs-4/700 收归组件)', () => {
    const w = mount(CalDayDetail, { props: { title: '2026-06-10 回款节点', groups: GROUPS } })
    const t = w.findComponent(SectionTitle)
    expect(t.exists()).toBe(true)
    expect(t.classes()).toContain('st--card')
    expect(t.text()).toBe('2026-06-10 回款节点')
  })

  it('空分组显示空态', () => {
    const w = mount(CalDayDetail, { props: { title: '当月回款节点', groups: [] } })
    expect(w.text()).toContain('暂无回款节点')
  })
})
