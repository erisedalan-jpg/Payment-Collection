import { describe, it, expect } from 'vitest'
import { projectItems, timesheetItems } from './items'
import type { Project, ProjectPmis } from '@/types/analysis'
import type { IssueRow } from '@/lib/yitian/compliance'

const p = (id: string, over: Partial<Project> = {}): Project => ({
  projectId: id, projectName: 'N' + id, projectManager: 'M', orgL4: 'L4',
  ...(over as object),
} as Project)

describe('projectItems', () => {
  it('无关注原因的项目不产出事项', () => {
    expect(projectItems([p('A')], {}, ['回款延期'])).toEqual([])
  })

  it('orgL4 缺失 → 数据异常;勾选了才产出', () => {
    const anomalous = [p('A', { orgL4: '' })]
    expect(projectItems(anomalous, {}, ['数据异常'])).toEqual([
      { kind: 'project', projectId: 'A', reasons: ['数据异常'] },
    ])
    // 未勾选「数据异常」→ 不产出
    expect(projectItems(anomalous, {}, ['回款延期'])).toEqual([])
  })

  it('allowedReasons 为空 → 全部过滤掉', () => {
    expect(projectItems([p('A', { orgL4: '' })], {}, [])).toEqual([])
  })

  it('同一项目多原因合并为一条事项', () => {
    const items = projectItems([p('A', { orgL4: '' })], {}, ['数据异常', '回款延期'])
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('project')
  })
})

describe('timesheetItems', () => {
  const row = (empId: string, codes: string[]): IssueRow => ({
    date: '2026-07-01', empId, empName: 'X', l4: '', l31: '', type: '',
    customer: '', workOrder: '', hours: 8, ok: 2, codes, msgs: [], snippet: '',
  })

  it('按工号聚合,按问题码计数', () => {
    const items = timesheetItems(
      [row('A1', ['MISS_SUMMARY']), row('A1', ['MISS_SUMMARY']), row('A1', ['TYPE_MISMATCH'])],
      ['MISS_SUMMARY', 'TYPE_MISMATCH'])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'timesheet', employId: 'A1' })
    const issues = (items[0] as { issues: { code: string; count: number }[] }).issues
    expect(issues.find((i) => i.code === 'MISS_SUMMARY')!.count).toBe(2)
    expect(issues.find((i) => i.code === 'TYPE_MISMATCH')!.count).toBe(1)
  })

  it('一行多个问题码 → 每个码各计一次', () => {
    const items = timesheetItems([row('A1', ['MISS_SUMMARY', 'MISS_NEXT'])],
                                 ['MISS_SUMMARY', 'MISS_NEXT'])
    const issues = (items[0] as { issues: { code: string; count: number }[] }).issues
    expect(issues).toHaveLength(2)
  })

  it('allowedCodes 过滤生效;过滤后无码的人不产出', () => {
    expect(timesheetItems([row('A1', ['TYPE_MISMATCH'])], ['MISS_SUMMARY'])).toEqual([])
  })

  it('issues 带中文 label(卡片直接用,不必再查表)', () => {
    const items = timesheetItems([row('A1', ['MISS_SUMMARY'])], ['MISS_SUMMARY'])
    const issues = (items[0] as { issues: { label: string }[] }).issues
    expect(issues[0].label).toBe('缺少工作概述')
  })

  it('多人各自成条,按工号排序', () => {
    const items = timesheetItems([row('B2', ['MISS_SUMMARY']), row('A1', ['MISS_SUMMARY'])],
                                 ['MISS_SUMMARY'])
    expect(items.map((i) => (i as { employId: string }).employId)).toEqual(['A1', 'B2'])
  })

  // I-2:工时卡副标题此前恒为「统计区间  ~ 」——PushItem 的 timesheet 分支根本没有 start/end 字段。
  it('带 start/end 时原样透传到每条事项(供后端拼「统计区间」副标题)', () => {
    const items = timesheetItems([row('A1', ['MISS_SUMMARY'])], ['MISS_SUMMARY'],
                                 '2026-07-01', '2026-07-07')
    expect(items[0]).toMatchObject({ start: '2026-07-01', end: '2026-07-07' })
  })

  it('不传 start/end 时默认空串,不是 undefined(后端据此判断是否显示副标题)', () => {
    const items = timesheetItems([row('A1', ['MISS_SUMMARY'])], ['MISS_SUMMARY'])
    expect(items[0]).toMatchObject({ start: '', end: '' })
  })

  it('多人共享同一次传入的 start/end', () => {
    const items = timesheetItems(
      [row('B2', ['MISS_SUMMARY']), row('A1', ['MISS_SUMMARY'])],
      ['MISS_SUMMARY'], '2026-07-01', '2026-07-07')
    for (const it of items) {
      expect(it).toMatchObject({ start: '2026-07-01', end: '2026-07-07' })
    }
  })
})

// M-6:「与后端 REASON_WHITELIST 逐字一致」这条断言必须真的读后端源码比对(见
// ./reasonWhitelistSync.test.ts),不能在 TS 侧把同一份字面量再抄一遍 —— 那样改后端不改
// 这里照样绿,防不住跨语言两份副本漂移。该用例需要 node:fs,与本文件其余纯函数测试
// 分文件放置(本文件走全局 jsdom 环境,sync 检查走 node 环境,避免共享 setupFiles 冲突)。
