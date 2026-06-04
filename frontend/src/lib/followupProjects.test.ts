import { describe, it, expect } from 'vitest'
import {
  followupDeptProjects,
  deptWindowNodes,
  deptUrgency,
  applyProjDropdown,
  pendingNodes,
} from './followupProjects'

const NOW = new Date('2026-06-04T00:00:00')

const NODES: any[] = [
  { orgL4: 'A', projectId: 'P1', projectName: '甲', projectManager: '张', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-05-01', actualPaymentRatio: 0, projectAmount: 1000000, projectCompletion: '0.6' },
  { orgL4: 'A', projectId: 'P1', projectName: '甲', projectManager: '张', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-08', actualPaymentRatio: 0.5, projectAmount: 1000000, projectCompletion: '0.8' },
  { orgL4: 'A', projectId: 'P2', projectName: '乙', projectManager: '李', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-25', actualPaymentRatio: 0, projectAmount: 500000 },
  { orgL4: 'B', projectId: 'P3', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-10', actualPaymentRatio: 0, projectAmount: 0 },
]

describe('followupDeptProjects', () => {
  it('按部门聚合项目（金额万/最早日期/完成率/flw）', () => {
    const ps = followupDeptProjects(NODES, 'A', { P1: { flw: true } })
    expect(ps.map((p) => p.projectId).sort()).toEqual(['P1', 'P2'])
    const p1 = ps.find((p) => p.projectId === 'P1')!
    expect(p1.projectAmountWan).toBe(100)
    expect(p1.earliestPlanDate).toBe('2026-05-01')
    expect(p1.completion).toBe('0.8')
    expect(p1.flw).toBe(true)
    expect(p1.nodes).toHaveLength(2)
  })
})

describe('deptWindowNodes', () => {
  it('delay 档：仅延期节点', () => {
    expect(deptWindowNodes(NODES, 'A', 'delay', NOW)).toHaveLength(1)
  })
  it('d7 档：7天内未满额未过期', () => {
    const r = deptWindowNodes(NODES, 'A', 'd7', NOW)
    expect(r.map((n: any) => n.planDate)).toEqual(['2026-06-08'])
  })
  it('空档：该部门全部', () => {
    expect(deptWindowNodes(NODES, 'A', '', NOW)).toHaveLength(3)
  })
})

describe('deptUrgency', () => {
  it('紧迫度分桶（延期优先）', () => {
    const wn = deptWindowNodes(NODES, 'A', '', NOW)
    const u = deptUrgency(wn, NOW)
    expect(u.delay).toBe(1)
    expect(u.d7).toBe(1)
    expect(u.d30).toBe(1)
  })
})

describe('applyProjDropdown', () => {
  const projs = followupDeptProjects(NODES, 'A', { P1: { flw: true } })
  it('flw 只留已跟进', () => {
    expect(applyProjDropdown(projs, 'flw', NOW).map((p) => p.projectId)).toEqual(['P1'])
  })
  it('noflw 只留未跟进', () => {
    expect(applyProjDropdown(projs, 'noflw', NOW).map((p) => p.projectId)).toEqual(['P2'])
  })
  it('all 不过滤', () => {
    expect(applyProjDropdown(projs, 'all', NOW)).toHaveLength(2)
  })
})

describe('pendingNodes', () => {
  it('排除实际回款>=1 的节点', () => {
    const r = pendingNodes([
      { actualPaymentRatio: 0.5 }, { actualPaymentRatio: 1 }, { actualPaymentRatio: null },
    ] as any)
    expect(r).toHaveLength(2)
  })
})
