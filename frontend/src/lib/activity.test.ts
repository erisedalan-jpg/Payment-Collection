import { describe, it, expect } from 'vitest'
import type { Event } from '@/types/analysis'
import { filterEvents, groupEventsByDate, type ActivityFilters } from './activity'

const EVS = [
  { date: '2026-06-11', type: '到账', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「初验款」到账 25 万', amount: 250000 },
  { date: '2026-06-11', type: '阶段变更', domain: 'project', projectId: 'P-2', projectName: '乙', summary: '项目规划 → 项目执行' },
  { date: '2026-06-10', type: '延期发生', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「b」正常实施中 → 延期' },
] as unknown as Event[]

const F0: ActivityFilters = { domain: '', query: '' }

describe('filterEvents', () => {
  it('按 domain 过滤', () => {
    expect(filterEvents(EVS, { ...F0, domain: 'project' })).toHaveLength(1)
    expect(filterEvents(EVS, { ...F0, domain: 'payment' })).toHaveLength(2)
    expect(filterEvents(EVS, F0)).toHaveLength(3)
  })
  it('query 命中 项目名/编号/摘要/类型', () => {
    expect(filterEvents(EVS, { ...F0, query: 'p-2' })).toHaveLength(1)
    expect(filterEvents(EVS, { ...F0, query: '初验款' })).toHaveLength(1)
    expect(filterEvents(EVS, { ...F0, query: '延期' })).toHaveLength(1)
    expect(filterEvents(EVS, { ...F0, query: '不存在' })).toHaveLength(0)
  })
})

describe('groupEventsByDate', () => {
  it('按日分组保持输入顺序(新在前)', () => {
    const g = groupEventsByDate(EVS)
    expect(g.map((x) => x.date)).toEqual(['2026-06-11', '2026-06-10'])
    expect(g[0].items).toHaveLength(2)
  })
})
