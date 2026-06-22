import { describe, it, expect } from 'vitest'
import type { Event } from '@/types/analysis'
import { filterEvents, groupEventsByDate, distinctEventTypes, type ActivityFilters } from './activity'

const EVS = [
  { date: '2026-06-11', type: '到账', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「初验款」到账 25 万', amount: 250000 },
  { date: '2026-06-11', type: '阶段变更', domain: 'project', projectId: 'P-2', projectName: '乙', summary: '项目规划 → 项目执行' },
  { date: '2026-06-10', type: '延期发生', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「b」正常实施中 → 延期' },
] as unknown as Event[]

const F0: ActivityFilters = { domain: '', query: '', types: [], l4: '' }

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
  it('types 为空数组时不过滤', () => {
    expect(filterEvents(EVS, { ...F0, types: [] })).toHaveLength(3)
  })
  it('types 命中时只保留匹配类型', () => {
    expect(filterEvents(EVS, { ...F0, types: ['到账'] })).toHaveLength(1)
    expect(filterEvents(EVS, { ...F0, types: ['到账', '延期发生'] })).toHaveLength(2)
  })
  it('types 未命中时返回空', () => {
    expect(filterEvents(EVS, { ...F0, types: ['不存在类型'] })).toHaveLength(0)
  })
  it('l4 为空字符串时不过滤', () => {
    const pidL4: Record<string, string> = { 'P-1': 'L4-A', 'P-2': 'L4-B' }
    expect(filterEvents(EVS, { ...F0, l4: '' }, pidL4)).toHaveLength(3)
  })
  it('l4 命中时只保留匹配 L4 的项目', () => {
    const pidL4: Record<string, string> = { 'P-1': 'L4-A', 'P-2': 'L4-B' }
    expect(filterEvents(EVS, { ...F0, l4: 'L4-A' }, pidL4)).toHaveLength(2)
    expect(filterEvents(EVS, { ...F0, l4: 'L4-B' }, pidL4)).toHaveLength(1)
  })
  it('l4 命中但 pidL4 未含该项目时，视作 orgL4 为空字符串（被排除）', () => {
    const pidL4: Record<string, string> = { 'P-2': 'L4-B' }
    // P-1 无映射，视为 ''，不等于 L4-A，故 P-1 的 2 条事件不进结果
    expect(filterEvents(EVS, { ...F0, l4: 'L4-A' }, pidL4)).toHaveLength(0)
  })
  it('pidL4 未传时，l4 非空则全部排除', () => {
    // 无 pidL4 映射，所有事件 orgL4 视作 ''，不等于任何非空 l4
    expect(filterEvents(EVS, { ...F0, l4: 'L4-A' })).toHaveLength(0)
  })
  it('types + l4 + domain + query 组合过滤', () => {
    const pidL4: Record<string, string> = { 'P-1': 'L4-A', 'P-2': 'L4-B' }
    // 只保留 L4-A、domain=payment、类型=到账
    const result = filterEvents(EVS, { domain: 'payment', query: '', types: ['到账'], l4: 'L4-A' }, pidL4)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('到账')
  })
})

describe('groupEventsByDate', () => {
  it('按日分组保持输入顺序(新在前)', () => {
    const g = groupEventsByDate(EVS)
    expect(g.map((x) => x.date)).toEqual(['2026-06-11', '2026-06-10'])
    expect(g[0].items).toHaveLength(2)
  })
})

describe('distinctEventTypes', () => {
  it('返回去重的事件类型', () => {
    const types = distinctEventTypes(EVS)
    expect(types).toContain('到账')
    expect(types).toContain('阶段变更')
    expect(types).toContain('延期发生')
    expect(types).toHaveLength(3)
  })
  it('结果稳定字典排序（无重复）', () => {
    const types = distinctEventTypes(EVS)
    const sorted = [...types].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    expect(types).toEqual(sorted)
  })
  it('重复类型只出现一次', () => {
    const evs = [
      ...EVS,
      { date: '2026-06-12', type: '到账', domain: 'payment', projectId: 'P-3', projectName: '丙', summary: '到账' },
    ] as unknown as Event[]
    const types = distinctEventTypes(evs)
    expect(types.filter((t) => t === '到账')).toHaveLength(1)
  })
  it('空数组返回空数组', () => {
    expect(distinctEventTypes([])).toEqual([])
  })
})
