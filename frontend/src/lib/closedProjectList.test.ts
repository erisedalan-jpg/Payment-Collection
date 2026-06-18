import { describe, it, expect } from 'vitest'
import { buildClosedRows, filterClosedRows, type ClosedRow } from './closedProjectList'
import type { ClosedProject } from '@/types/analysis'

function cp(over: Partial<any> = {}): any {
  return {
    projectId: 'C-1', projectName: '甲', projectManager: '张三', orgL4: '安全A组', orgL3_1: '三部一组',
    合同编号: 'HT-1',
    customer: { 最终客户: '客A', 签约单位: '甲单位', 合同总额: 1000000, 行业: '金融' },
    status: { 项目状态: '已验收', 项目级别: 'B', 项目类型: '实施项目', 评级: 'A' },
    progress: { 项目阶段: '项目收尾', 完工进展: 1 },
    cost: { 消耗比: 1.2, 项目超支: true, 交付超支: true },
    closeInfo: { 关闭时间: '2025-08-15', 计划终验时间: '2025-07-01', 是否正常关闭: '是' },
    ...over,
  }
}

describe('buildClosedRows', () => {
  it('扁平化关键列', () => {
    const r = buildClosedRows([cp() as ClosedProject])[0]
    expect(r.projectId).toBe('C-1')
    expect(r.customer).toBe('客A')
    expect(r.signParty).toBe('甲单位')
    expect(r.contractAmount).toBe(1000000)
    expect(r.orgL4).toBe('安全A组')
    expect(r.orgL3_1).toBe('三部一组')
    expect(r.projectType).toBe('实施项目')
    expect(r.projectLevel).toBe('B')
    expect(r.rating).toBe('A')
    expect(r.stage).toBe('项目收尾')
    expect(r.projectStatus).toBe('已验收')
    expect(r.closedAt).toBe('2025-08-15')
    expect(r.costRatio).toBe(1.2)
    expect(r.overspend).toBe(true)
  })
})

describe('filterClosedRows', () => {
  const rows = buildClosedRows([
    cp() as ClosedProject,
    cp({ projectId: 'C-2', projectName: '乙', projectManager: '李四',
         orgL4: '安全B组', orgL3_1: '三部二组',
         status: { 项目状态: '已关闭', 项目级别: 'A', 项目类型: '售前服务类', 评级: 'B' },
         progress: { 项目阶段: '已结项' } }) as ClosedProject,
  ])
  it('搜索匹配 名/编号/客户/经理', () => {
    expect(filterClosedRows(rows, { search: '李四' }).map(r => r.projectId)).toEqual(['C-2'])
  })
  it('空筛选返回全部', () => {
    expect(filterClosedRows(rows, { search: '' }).length).toBe(2)
  })
})
