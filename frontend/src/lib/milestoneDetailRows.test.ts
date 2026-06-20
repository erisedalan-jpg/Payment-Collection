import { describe, it, expect } from 'vitest'
import { buildDelayedRows } from './milestoneDetailRows'

function mp(over: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...over }
}

describe('buildDelayedRows', () => {
  const now = new Date(2026, 2, 10) // 2026-03-10
  it('仅非正常项目;延期节点=planDate<今且未完成的去重节点名', () => {
    const ps = [
      mp({ projectId: 'A', status: '正常' }), // 正常→不出
      mp({ projectId: 'B', status: '延期', nodes: [
        { name: '到货', planDate: '2026-02-01', actualDate: '', priority: 'low' },   // 过期未完→延期节点
        { name: '初验', planDate: '2026-02-05', actualDate: '2026-02-06', priority: 'mid' }, // 已完→不计
        { name: '终验', planDate: '2026-05-01', actualDate: '', priority: 'high' },   // 未来→不计
      ] }),
      mp({ projectId: 'C', status: '严重延期', nodes: [] }), // 无延期节点→'-'
    ]
    const rows = buildDelayedRows(ps, now)
    expect(rows.map((r) => r.projectId)).toEqual(['B', 'C'])
    expect(rows.find((r) => r.projectId === 'B')!.delayedNodes).toBe('到货')
    expect(rows.find((r) => r.projectId === 'C')!.delayedNodes).toBe('-')
    expect(rows.find((r) => r.projectId === 'B')).toMatchObject({ projectType: 'T', orgL3: 'L3', orgL4: 'L4', status: '延期' })
  })
})
