import { describe, it, expect } from 'vitest'
import { buildDelayedRows, buildReminderRows, reminderRange, reminderStat, buildPlanRows } from './milestoneDetailRows'

function mp(over: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...over }
}

describe('buildReminderRows / reminderStat (含已完成)', () => {
  const now = new Date(2026, 2, 10) // 2026-03-10
  const ps = [
    mp({ projectId: 'A', manager: '张', contract: 1234567, nodes: [
      { name: '到货', planDate: '2026-03-12', actualDate: '', payStage: '到货款', priority: 'high' }, // 区间内未完成,关联回款
      { name: '初验', planDate: '2026-04-05', actualDate: '', payStage: '', priority: 'mid' },          // 区间内未完成
      { name: '终验', planDate: '2026-03-15', actualDate: '2026-03-16', priority: 'high' },             // 区间内已完成
      { name: '关闭', planDate: '2026-02-01', actualDate: '', priority: 'low' },                        // 过期未完成
    ] }),
  ]

  it('区间内全部节点成行(含已完成),新字段齐', () => {
    const rows = buildReminderRows(ps, now, { start: '2026-03-01', end: '2026-03-31' })
    // 到货(03-12)、终验(03-15) 在 03-01..03-31;初验(04-05)出区间;关闭(02-01)出区间
    expect(rows.map((r) => r.node).sort()).toEqual(['到货', '终验'])
    const arr = rows.find((r) => r.node === '到货')!
    expect(arr).toMatchObject({ contract: 1234567, actualDate: '', done: '否', linked: '是', priority: 'high', priorityLabel: '高', urgency: 'urgent', overdue: false })
    const fin = rows.find((r) => r.node === '终验')!
    expect(fin).toMatchObject({ actualDate: '2026-03-16', done: '是', urgency: '', overdue: false })
  })

  it('已完成节点 done=是、urgency 空;逾期未完成 overdue=true', () => {
    const rows = buildReminderRows(ps, now, null) // null=全部
    const close = rows.find((r) => r.node === '关闭')!
    expect(close).toMatchObject({ done: '否', overdue: true }) // 02-01<今且未完成
    expect(rows.find((r) => r.node === '终验')!.done).toBe('是')
  })

  it('range=null 取全部到期节点;闭区间端点含', () => {
    expect(buildReminderRows(ps, now, null)).toHaveLength(4)
    // 端点 03-12 含于 [03-12, 03-12]
    expect(buildReminderRows(ps, now, { start: '2026-03-12', end: '2026-03-12' }).map((r) => r.node)).toEqual(['到货'])
  })

  it('reminderRange 三档:start=今,end 正确', () => {
    expect(reminderRange(now, 'd7')).toEqual({ start: '2026-03-10', end: '2026-03-17' })
    expect(reminderRange(now, 'm1')).toEqual({ start: '2026-03-10', end: '2026-04-10' })
    expect(reminderRange(now, 'quarter')).toEqual({ start: '2026-01-01', end: '2026-03-31' })
  })

  it('reminderStat 四项:total/done/undone/overdue', () => {
    const rows = buildReminderRows(ps, now, null)
    const s = reminderStat(rows)
    expect(s).toEqual({ total: 4, done: 1, undone: 3, overdue: 1 })
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


describe('buildPlanRows', () => {
  it('每项目一行 + 节点类型计划/实际日期映射', () => {
    const ps = [mp({ projectId: 'A', projectName: '甲', contract: 1234567, orgL3: 'L3', orgL3_1: 'L31', orgL4: 'L4', manager: '张', projectType: 'T', nodes: [
      { name: '到货', planDate: '2026-03-01', actualDate: '2026-03-05', priority: 'high' },
      { name: '终验', planDate: '2026-06-01', actualDate: '', priority: 'high' },
    ] })]
    const rows = buildPlanRows(ps)
    expect(rows).toHaveLength(1)
    const r = rows[0] as any
    expect(r).toMatchObject({ projectId: 'A', projectName: '甲', contract: 1234567, orgL3: 'L3', orgL3_1: 'L31', orgL4: 'L4', manager: '张', projectType: 'T' })
    expect(r['计划_到货']).toBe('2026-03-01')
    expect(r['实际_到货']).toBe('2026-03-05')
    expect(r['计划_终验']).toBe('2026-06-01')
    expect(r['实际_终验']).toBe('')
    expect(r['计划_初验']).toBe('') // 无该节点
  })
})
