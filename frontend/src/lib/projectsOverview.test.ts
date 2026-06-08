import { describe, it, expect } from 'vitest'
import { filterOverviewProjects, projectsOverviewSummary } from './projectsOverview'

const PROJECTS = [
  { projectId: 'P1', amountTier: '100万以上' },
  { projectId: 'P2', amountTier: '100万以上' },
  { projectId: 'P3', amountTier: '50万以下' },
]

describe('filterOverviewProjects', () => {
  it('按 amountTier 过滤', () => {
    expect(filterOverviewProjects(PROJECTS, '100万以上', false, {}).map((p) => p.projectId)).toEqual(['P1', 'P2'])
  })
  it('纳管开启时排除 naguanExclude', () => {
    expect(filterOverviewProjects(PROJECTS, '100万以上', true, { P2: true }).map((p) => p.projectId)).toEqual(['P1'])
  })
  it('纳管关闭时不排除', () => {
    expect(filterOverviewProjects(PROJECTS, '100万以上', false, { P2: true }).map((p) => p.projectId)).toEqual(['P1', 'P2'])
  })
})

describe('projectsOverviewSummary', () => {
  const NODES: any[] = [
    { projectId: 'P1', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0 },
    { projectId: 'P2', isPaymentRelated: true, nodeStatus: '加资源可提前', expectedPayment: 500000, actualPayment: 500000 },
    { projectId: 'X9', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 999, actualPayment: 0 },
    { projectId: 'P1', isPaymentRelated: false, nodeStatus: '正常实施中', expectedPayment: 9999, actualPayment: 0 },
  ]
  it('仅统计 displayProjects 内的关联节点', () => {
    const s = projectsOverviewSummary([{ projectId: 'P1' }, { projectId: 'P2' }], NODES)
    expect(s.projectCount).toBe(2)
    expect(s.nodeCount).toBe(2)
    expect(s.totalActual).toBe(500000)
    expect(s.totalRemaining).toBe(1000000)
    expect(s.rate).toBeCloseTo(1 / 3)
    expect(s.adv).toBe(1)
    expect(s.reached).toBe(0)
    expect(s.delayed).toBe(1)
  })
})

describe('filterOverviewProjects 空 tier=全部', () => {
  const projs = [
    { projectId: 'A', amountTier: '100万以上' },
    { projectId: 'B', amountTier: '50万以下' },
  ] as any
  it('空 tier 返回全部（仅纳管过滤）', () => {
    expect(filterOverviewProjects(projs, '', false, {}).map((p: any) => p.projectId)).toEqual(['A', 'B'])
  })
  it('指定 tier 仍按档过滤', () => {
    expect(filterOverviewProjects(projs, '50万以下', false, {}).map((p: any) => p.projectId)).toEqual(['B'])
  })
})
