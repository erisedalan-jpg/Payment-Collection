import { describe, it, expect } from 'vitest'
import { filterNodes, type FilterOpts } from './filterNodes'

const NODES: any[] = [
  { projectId: 'P1', orgL4: '北京服务组', projectManager: '张三', planMonth: '2026-02' },
  { projectId: 'P2', orgL4: '上海一服务组', projectManager: '李四', planMonth: '2026-05' },
  { projectId: 'P3', orgL4: '北京服务组', projectManager: '张三', planMonth: '2027-03' },
  { projectId: 'P4', orgL4: '上海一服务组', projectManager: '王五', planMonth: '' },
]

function opts(over: Partial<FilterOpts> = {}): FilterOpts {
  return {
    filterYear: 'all', viewMode: 'global', viewL4: '', viewPM: '',
    excludeActive: false, excludedIds: {}, ...over,
  }
}

describe('filterNodes', () => {
  it('all returns everything', () => {
    expect(filterNodes(NODES, opts()).map((n) => n.projectId)).toEqual(['P1', 'P2', 'P3', 'P4'])
  })
  it('plain year filters by planMonth within that year', () => {
    expect(filterNodes(NODES, opts({ filterYear: '2026' })).map((n) => n.projectId)).toEqual(['P1', 'P2'])
  })
  it('quarter filters by month range', () => {
    expect(filterNodes(NODES, opts({ filterYear: '2026-Q1' })).map((n) => n.projectId)).toEqual(['P1'])
  })
  it('upto-year is cumulative (<= year-12)', () => {
    expect(filterNodes(NODES, opts({ filterYear: 'upto2026' })).map((n) => n.projectId)).toEqual(['P1', 'P2'])
  })
  it('upto-quarter uses the same exact quarter range as a normal quarter (faithful to app.js)', () => {
    // upto2026-Q2 → range [2026-04, 2026-06]; P1(2026-02) excluded, P2(2026-05) included
    expect(filterNodes(NODES, opts({ filterYear: 'upto2026-Q2' })).map((n) => n.projectId)).toEqual(['P2'])
  })
  it('nodes without planMonth are excluded in year filters', () => {
    expect(filterNodes(NODES, opts({ filterYear: '2026' })).some((n) => n.projectId === 'P4')).toBe(false)
  })
  it('l4 view filters by orgL4', () => {
    expect(filterNodes(NODES, opts({ viewMode: 'l4', viewL4: '北京服务组' })).map((n) => n.projectId)).toEqual(['P1', 'P3'])
  })
  it('pm view filters by projectManager', () => {
    expect(filterNodes(NODES, opts({ viewMode: 'pm', viewPM: '李四' })).map((n) => n.projectId)).toEqual(['P2'])
  })
  it('naguan excludes flagged projectIds when on', () => {
    const r = filterNodes(NODES, opts({ excludeActive: true, excludedIds: { P2: true } }))
    expect(r.map((n) => n.projectId)).toEqual(['P1', 'P3', 'P4'])
  })
  it('view + year combine', () => {
    const r = filterNodes(NODES, opts({ viewMode: 'l4', viewL4: '北京服务组', filterYear: '2026' }))
    expect(r.map((n) => n.projectId)).toEqual(['P1'])
  })
})
