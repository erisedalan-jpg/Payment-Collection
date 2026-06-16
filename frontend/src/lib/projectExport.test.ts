import { describe, it, expect } from 'vitest'
import { buildExportSheets } from './projectExport'

const ctx = {
  projects: [{ projectId: 'P1', projectName: '甲' }, { projectId: 'P2', projectName: '乙' }] as any,
  rows: [{ projectId: 'P1', projectName: '甲', tags: ['BH项目', '框架合同'] }] as any,
  assignments: { P1: ['BH项目', '框架合同'] },
  followup: [{ 记录编号: 'FU-1', 项目编号: 'P1', 跟进人: '张' }, { 记录编号: 'FU-2', 项目编号: 'P2' }] as any,
  paymentNodes: { P1: [{ stage: '到货', planDate: '2026-01-01', status: '已达成', expectedPayment: 100 }] } as any,
  milestones: { P1: [{ name: '终验', planDate: '2026-03-01', priority: 'high' }] } as any,
}

describe('buildExportSheets', () => {
  it('按范围产 sheet，跟进/节点/里程碑按筛选项目集过滤', () => {
    const sheets = buildExportSheets(['list', 'tags', 'followup', 'nodes', 'milestones'], ctx as any)
    const names = sheets.map((s) => s.name)
    expect(names).toEqual(['项目清单', '项目标签', '跟进记录', '回款节点', '里程碑'])
    const tagSheet = sheets.find((s) => s.name === '项目标签')!
    expect(tagSheet.rows[0]['标签']).toBe('BH项目、框架合同')
    const fu = sheets.find((s) => s.name === '跟进记录')!
    expect(fu.rows.every((r: any) => r['项目编号'] === 'P1')).toBe(true)
  })
  it('只选清单→单 sheet', () => {
    const sheets = buildExportSheets(['list'], ctx as any)
    expect(sheets.map((s) => s.name)).toEqual(['项目清单'])
  })
})
