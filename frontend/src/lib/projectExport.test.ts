import { describe, it, expect } from 'vitest'
import { buildExportSheets } from './projectExport'

const ctx = {
  projects: [{ projectId: 'P1', projectName: '甲' }, { projectId: 'P2', projectName: '乙' }] as any,
  rows: [{ projectId: 'P1', projectName: '甲', tags: ['BH项目', '框架合同'] }] as any,
  assignments: { P1: ['BH项目', '框架合同'] },
  followup: [{ 记录编号: 'FU-1', 项目编号: 'P1', 跟进人: '张' }, { 记录编号: 'FU-2', 项目编号: 'P2' }] as any,
  paymentNodes: { P1: [{ stage: '到货', planDate: '2026-01-01', status: '已回款', expectedPayment: 100 }] } as any,
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

describe('buildExportSheets 合同金额单位', () => {
  it('「合同金额(万)」列导出万元值而非元值', () => {
    const ctx = {
      rows: [{ projectId: 'P1', projectName: '甲', contractAmount: 1180000, tags: [] }],
      projects: [], assignments: {}, followup: [], paymentNodes: {}, milestones: {},
    } as any
    const sheets = buildExportSheets(['list'], ctx)
    const row = sheets[0].rows[0]
    expect(row['合同金额(万)']).toBe(118) // 1,180,000 元 → 118 万
  })

  it('合同金额为 null 时导出空串', () => {
    const ctx = {
      rows: [{ projectId: 'P2', projectName: '乙', contractAmount: null, tags: [] }],
      projects: [], assignments: {}, followup: [], paymentNodes: {}, milestones: {},
    } as any
    const row = buildExportSheets(['list'], ctx)[0].rows[0]
    expect(row['合同金额(万)']).toBe('')
  })
})

describe('buildExportSheets 按可见列导出(listColumns)', () => {
  const base = { projects: [], assignments: {}, followup: [], paymentNodes: {}, milestones: {} }

  it('按 listColumns 导出:排除操作列、riskReasons 取 category、formatter 生效', () => {
    const sheets = buildExportSheets(['list'], {
      ...base,
      rows: [{
        projectId: 'P1', projectName: '甲', contractAmount: 1180000,
        health: '关注', riskReasons: [{ category: '回款延期' }, { category: '里程碑滞后' }],
        tags: ['BH项目'],
      }],
      listColumns: [
        { key: 'projectName', label: '项目名称' },
        { key: 'contractAmount', label: '合同金额(万)', formatter: (v: any) => (v == null ? '-' : String(v / 10000)) },
        { key: 'health', label: '健康度' },
        { key: 'riskReasons', label: '关注原因' },
        { key: 'action', label: '操作' }, // 应被排除
      ],
    } as any)
    const row = sheets[0].rows[0]
    expect(Object.keys(row)).toEqual(['项目名称', '合同金额(万)', '健康度', '关注原因']) // 无「操作」列
    expect(row['项目名称']).toBe('甲')
    expect(row['合同金额(万)']).toBe('118') // 列 formatter 生效
    expect(row['健康度']).toBe('关注') // 字符串直取
    expect(row['关注原因']).toBe('回款延期、里程碑滞后') // 数组取 category 拼接
  })

  it('不传 listColumns 回退固定列(向后兼容,仍含标签列)', () => {
    const row = buildExportSheets(['list'], {
      ...base,
      rows: [{ projectId: 'P1', projectName: '甲', tags: ['BH项目'] }],
    } as any)[0].rows[0]
    expect(row['项目编号']).toBe('P1')
    expect(row['标签']).toBe('BH项目')
  })
})
