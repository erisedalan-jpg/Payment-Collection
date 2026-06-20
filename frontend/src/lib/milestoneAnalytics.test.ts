import { describe, it, expect } from 'vitest'
import {
  normalizeStatus, buildMilestoneProjects, statusKpis,
  reminderBuckets, finalAcceptStats, availableYears,
  deptAbnormalTop15, deptComplianceRate, nodeDistribution, nodesForDrill,
} from './milestoneAnalytics'

function mp(over: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L', orgL3_1: '', projectType: '', contract: 0, status: '正常', nodes: [], ...over }
}

describe('reminderBuckets', () => {
  const now = new Date(2026, 2, 10) // 2026-03-10（季 Q1: 01-01..03-31）
  it('未来窗口 + 已完成(actualDate 非空)不计 + 优先级归类', () => {
    const ps = [
      mp({ projectId: 'A', nodes: [{ name: '终验', planDate: '2026-03-12', actualDate: '', priority: 'high' }] }),   // 7天内
      mp({ projectId: 'B', nodes: [{ name: '到货', planDate: '2026-03-30', actualDate: '', priority: 'low' }] }),    // 30天/季内
      mp({ projectId: 'C', nodes: [{ name: '初验', planDate: '2026-03-15', actualDate: '2026-03-09', priority: 'mid' }] }), // 已完成→不计
    ]
    const w = reminderBuckets(ps, now).windows
    expect(w['7d']).toMatchObject({ high: 1, mid: 0, low: 0, projectCount: 1 })
    expect(w['30d']).toMatchObject({ high: 1, low: 1, projectCount: 2 })
    expect(w.quarter).toMatchObject({ high: 1, low: 1, projectCount: 2 })
  })
})

describe('finalAcceptStats', () => {
  const ps = [
    mp({ projectId: 'A', contract: 1000000, nodes: [{ name: '终验', planDate: '2026-02-10', actualDate: '2026-02-20', priority: 'high' }] }),
    mp({ projectId: 'B', contract: 2000000, nodes: [{ name: '服务完成', planDate: '2026-05-10', actualDate: '', priority: 'high' }] }),
    mp({ projectId: 'C', contract: 500000, nodes: [{ name: '到货', planDate: '2026-02-01', actualDate: '', priority: 'low' }] }), // 无终验/服务完成→不计
  ]
  it('按季分桶：计划/实际数 + 金额(万) + 完成判定', () => {
    const r = finalAcceptStats(ps, 'quarter')
    expect(r.periods).toEqual(['2026Q1', '2026Q2'])
    expect(r.planCount).toEqual([1, 1])
    expect(r.actualCount).toEqual([1, 0])     // 仅 A 实际完成
    expect(r.planAmountWan).toEqual([100, 200])
    expect(r.actualAmountWan).toEqual([100, 0])
  })
  it('按月 + year 过滤', () => {
    const r = finalAcceptStats(ps, 'month', 2026)
    expect(r.periods).toEqual(['2026-02', '2026-05'])
    const r2 = finalAcceptStats(ps, 'month', 2025)
    expect(r2.periods).toEqual([])
  })
})

describe('availableYears', () => {
  const ps = [
    mp({ nodes: [{ name: '终验', planDate: '2025-12-01', actualDate: '', priority: 'high' }] }),
    mp({ nodes: [{ name: '到货', planDate: '2026-03-01', actualDate: '', payStage: '到货款', priority: 'high' }] }),
  ]
  it('finalAccept 取终验/服务完成年份', () => {
    expect(availableYears(ps, 'finalAccept')).toEqual([2025])
  })
  it('node 取分布相关节点年份', () => {
    expect(availableYears(ps, 'node')).toEqual([2025, 2026])
  })
})

describe('normalizeStatus', () => {
  it('正常/延期/严重延期 原样', () => {
    expect(normalizeStatus('正常')).toBe('正常')
    expect(normalizeStatus('延期')).toBe('延期')
    expect(normalizeStatus('严重延期')).toBe('严重延期')
  })
  it('超期未发布/空/null/未知 → 未发布', () => {
    expect(normalizeStatus('超期未发布')).toBe('未发布')
    expect(normalizeStatus('')).toBe('未发布')
    expect(normalizeStatus(null)).toBe('未发布')
    expect(normalizeStatus(undefined)).toBe('未发布')
    expect(normalizeStatus('其它怪值')).toBe('未发布')
  })
})

const projects = [
  { projectId: 'A', projectName: '甲', projectManager: '张', orgL4: 'L1', orgL3_1: 'S1', isPresale: false, paymentPmis: { contract: 1000000 } },
  { projectId: 'B', projectName: '乙', projectManager: '李', orgL4: 'L1', orgL3_1: 'S1', isPresale: true, relatedClosedId: 'R', paymentPmis: { contract: 2000000 } },
  { projectId: 'C', projectName: '丙', projectManager: '王', orgL4: '', orgL3_1: '', isPresale: false, paymentPmis: { contract: 0 } },
] as any
const pmis = {
  A: { progress: { 里程碑进度状态: '正常' }, status: { 项目类型: '正常实施类' } },
  B: { progress: { 里程碑进度状态: '严重延期' }, status: { 项目类型: '售前服务类' } },
  C: { progress: { 里程碑进度状态: '' }, status: { 项目类型: '特殊支持类' } },
} as any
const milestones = {
  A: [{ name: '终验', planDate: '2026-03-01', actualDate: '', priority: 'high' }],
  R: [{ name: '初验', planDate: '2026-02-01', actualDate: '', priority: 'high' }],
} as any

describe('buildMilestoneProjects', () => {
  it('装配字段 + 状态归一', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones)
    expect(ps).toHaveLength(3)
    const a = ps.find((p) => p.projectId === 'A')!
    expect(a).toMatchObject({ projectName: '甲', manager: '张', orgL4: 'L1', projectType: '正常实施类', contract: 1000000, status: '正常' })
    expect(ps.find((p) => p.projectId === 'C')!.status).toBe('未发布')
  })
  it('售前节点回退原项目号(B 本号无节点 → 用 R)', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones)
    expect(ps.find((p) => p.projectId === 'B')!.nodes.map((n) => n.name)).toEqual(['初验'])
  })
  it('本号有节点时不回退；皆无得空数组', () => {
    const ms2 = { ...milestones, B: [{ name: '到货', planDate: '2026-01-01', actualDate: '', priority: 'mid' }] } as any
    const ps = buildMilestoneProjects(projects, pmis, ms2)
    expect(ps.find((p) => p.projectId === 'B')!.nodes.map((n) => n.name)).toEqual(['到货'])
    expect(ps.find((p) => p.projectId === 'C')!.nodes).toEqual([])
  })
  it('标签剔除：excludeOn + excludedIds 命中被剔', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones, { excludeOn: true, excludedIds: { C: true } })
    expect(ps.map((p) => p.projectId)).toEqual(['A', 'B'])
  })
  it('excludeOn=false 时 excludedIds 不生效', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones, { excludeOn: false, excludedIds: { C: true } })
    expect(ps).toHaveLength(3)
  })
})

describe('statusKpis', () => {
  it('按归一状态计数', () => {
    const ps = buildMilestoneProjects(projects, pmis, milestones)
    expect(statusKpis(ps)).toEqual({ total: 3, normal: 1, delayed: 0, severe: 1, unpublished: 1 })
  })
})

describe('deptAbnormalTop15 / deptComplianceRate', () => {
  const ps = [
    mp({ projectId: '1', orgL4: 'D1', status: '延期' }),
    mp({ projectId: '2', orgL4: 'D1', status: '严重延期' }),
    mp({ projectId: '3', orgL4: 'D1', status: '正常' }),
    mp({ projectId: '4', orgL4: 'D2', status: '未发布' }),
    mp({ projectId: '5', orgL4: '', status: '延期' }), // orgL4 空→排除
  ]
  it('按异常数降序 + 排除空部门', () => {
    const r = deptAbnormalTop15(ps)
    expect(r.map((x) => x.orgL4)).toEqual(['D1', 'D2'])
    expect(r[0]).toMatchObject({ orgL4: 'D1', delayed: 1, severe: 1, unpublished: 0, abnormal: 2 })
    expect(r[1]).toMatchObject({ orgL4: 'D2', unpublished: 1, abnormal: 1 })
  })
  it('合规率=正常/部门总数×100,按 deptOrder', () => {
    const r = deptComplianceRate(ps, ['D1', 'D2'])
    expect(r).toEqual([{ orgL4: 'D1', rate: 33.3 }, { orgL4: 'D2', rate: 0 }])
  })
})

describe('nodeDistribution / nodesForDrill', () => {
  const ps = [
    mp({ projectId: 'A', orgL4: 'D1', status: '正常', nodes: [
      { name: '到货', planDate: '2026-03-05', actualDate: '', payStage: '到货款', priority: 'high' }, // arrival(有payStage)
      { name: '到货', planDate: '2026-03-20', actualDate: '', payStage: '', priority: 'low' },          // 到货无payStage→不计
      { name: '终验', planDate: '2026-06-10', actualDate: '', priority: 'high' },                       // finalAccept(无需payStage)
    ] }),
    mp({ projectId: 'B', orgL4: 'D2', status: '延期', nodes: [
      { name: '服务完成', planDate: '2026-03-15', actualDate: '', priority: 'high' },                   // serviceDone(3月)
    ] }),
  ]
  it('按月按系列计数(payStage 条件)', () => {
    const d = nodeDistribution(ps, 2026)
    expect(d.arrival[2]).toBe(1)      // 3月 1 个到货(有payStage)
    expect(d.serviceDone[2]).toBe(1)  // 3月 1 个服务完成
    expect(d.finalAccept[5]).toBe(1)  // 6月 1 个终验
    expect(d.arrival.reduce((s, n) => s + n, 0)).toBe(1) // 无payStage的到货未计
  })
  it('year 过滤', () => {
    expect(nodeDistribution(ps, 2025).arrival.every((n) => n === 0)).toBe(true)
  })
  it('下钻取该系列+月份行', () => {
    const rows = nodesForDrill(ps, 'serviceDone', 2, 2026) // 3月=index2
    expect(rows).toEqual([{ projectId: 'B', projectName: 'x', manager: '', orgL4: 'D2', node: '服务完成', planDate: '2026-03-15', status: '延期' }])
  })
})
