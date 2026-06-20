import { describe, it, expect } from 'vitest'
import { buildDelayedRows, buildReminderRows, reminderStat } from './milestoneDetailRows'

function mp(over: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...over }
}

describe('buildReminderRows / reminderStat', () => {
  const now = new Date(2026, 2, 10) // 2026-03-10; 7d→03-17, 30d→04-09, 季→01-01..03-31
  const ps = [
    mp({ projectId: 'A', manager: '张', nodes: [
      { name: '到货', planDate: '2026-03-12', actualDate: '', payStage: '到货款', priority: 'high' }, // 7d内,关联回款
      { name: '初验', planDate: '2026-04-05', actualDate: '', payStage: '', priority: 'mid' },          // 30d内
      { name: '终验', planDate: '2026-03-15', actualDate: '2026-03-09', priority: 'high' },             // 已完→不计
    ] }),
  ]
  it('7天窗:仅 planDate∈[今,今+7]且未完成', () => {
    const rows = buildReminderRows(ps, now, '7d')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ projectId: 'A', node: '到货', planDate: '2026-03-12', payStage: '到货款', linked: '是', priority: 'high', priorityLabel: '高', urgency: 'urgent' })
  })
  it('30天窗含初验(未关联回款)', () => {
    const rows = buildReminderRows(ps, now, '30d')
    expect(rows.map((r) => r.node).sort()).toEqual(['初验', '到货'])
    expect(rows.find((r) => r.node === '初验')!.linked).toBe('否')
  })
  it('reminderStat 统计', () => {
    const rows = buildReminderRows(ps, now, '30d')
    const s = reminderStat(rows, now)
    expect(s.projectCount).toBe(1)
    expect(s.nodeCount).toBe(2)
    expect(s.within7).toBe(1) // 仅到货 03-12 在 7 天内
  })
})

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
