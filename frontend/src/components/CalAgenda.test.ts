import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalAgenda from './CalAgenda.vue'
import type { CalAgendaGroup } from '@/lib/calendar'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

const GROUPS: CalAgendaGroup[] = [
  { date: '2026-06-10', nodes: [{ projectId: 'P1', projectName: '甲', nodeStatus: '延期' }] as any, subRemaining: 100000 },
]

describe('CalAgenda', () => {
  it('渲染日期分组与小计', () => {
    const w = mount(CalAgenda, { props: { groups: GROUPS } })
    expect(w.text()).toContain('2026-06-10')
    expect(w.text()).toContain('待回款')
    expect(w.text()).toContain('甲')
  })

  it('空分组显示空态', () => {
    const w = mount(CalAgenda, { props: { groups: [] } })
    expect(w.text()).toContain('暂无回款节点')
  })
})
