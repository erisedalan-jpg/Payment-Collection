import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectPage, RISK_COLUMNS, fmtDateCell } from './projectPage'

const PROJECTS = [
  { projectId: 'P-1', projectName: '终端安全', projectManager: '何平', orgL4: 'A组', isPresale: false, relatedClosedId: '',
    payment: { relatedNodeCount: 1, expectedTotal: 100, actualTotal: 0, remainingTotal: 100, paymentRatio: 0, delayedCount: 0 },
    deliveryCosts: [], health: { overall: '健康' } },
  { projectId: 'P-2', projectName: '售前服务-某局', projectManager: '李四', orgL4: 'B组', isPresale: true, relatedClosedId: 'OLD-9',
    payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
    deliveryCosts: [], health: { overall: '关注' } },
] as unknown as Project[]

const PMIS = {
  'P-1': { status: { 项目状态: '实施中' } },
  'OLD-9': { source: '已关闭', team: { 项目名称: '某局一期', 项目经理: '王五' }, customer: { 最终客户: '某局', 合同总额: 1000000 } },
} as unknown as Record<string, ProjectPmis>

describe('buildProjectPage', () => {
  it('命中项目：带 pmis，无 relatedClosedId', () => {
    const pg = buildProjectPage(PROJECTS, PMIS, 'P-1')
    expect(pg.project?.projectId).toBe('P-1')
    expect((pg.pmis as any)?.status?.项目状态).toBe('实施中')
    expect(pg.closedId).toBe('')
    expect(pg.closedPmis).toBeNull()
  })
  it('售前整合项目：closedPmis 正确取原项目', () => {
    const pg = buildProjectPage(PROJECTS, PMIS, 'P-2')
    expect(pg.closedId).toBe('OLD-9')
    expect((pg.closedPmis as any)?.team?.项目名称).toBe('某局一期')
  })
  it('未知 id → project null，各字段为 null/空', () => {
    const pg = buildProjectPage(PROJECTS, PMIS, 'NOPE')
    expect(pg.project).toBeNull()
    expect(pg.pmis).toBeNull()
    expect(pg.closedId).toBe('')
    expect(pg.closedPmis).toBeNull()
  })
})

describe('RISK_COLUMNS / fmtDateCell', () => {
  it('风险列为 13 列裁剪且键为真实表头', () => {
    expect(RISK_COLUMNS.map((c) => c.key)).toEqual([
      '风险编码', '风险名称', '风险描述', '风险等级', '风险状态', '风险大类', '风险小类',
      '识别日期', '计划应对完成日期', '实际应对完成日期', '是否超期', '待办任务', '责任人',
    ])
  })
  it('风险描述与待办任务列有 wrap 属性', () => {
    const descCol = RISK_COLUMNS.find((c) => c.key === '风险描述')
    const todoCol = RISK_COLUMNS.find((c) => c.key === '待办任务')
    expect(descCol?.wrap).toBe(true)
    expect(todoCol?.wrap).toBe(true)
  })
  it('风险小类列存在且无 date 标记', () => {
    const col = RISK_COLUMNS.find((c) => c.key === '风险小类')
    expect(col).toBeTruthy()
    expect(col?.date).toBeFalsy()
  })
  it('fmtDateCell 取 ISO 前 10 位，空值显示 -', () => {
    expect(fmtDateCell('2025-09-19T00:00:00')).toBe('2025-09-19')
    expect(fmtDateCell(null)).toBe('-')
    expect(fmtDateCell('')).toBe('-')
  })
})
