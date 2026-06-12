import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, filterProjectRows, distinctOptions, paymentStatusOf, type ProjectFilters } from './projectList'

const PAY0 = { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }

function proj(over: Partial<Project> = {}): Project {
  return {
    projectId: 'QABJ-SS-1', projectName: '终端安全项目', projectManager: '何平', orgL4: '小微部',
    isPresale: false, relatedClosedId: '', payment: { ...PAY0 },
    deliveryCosts: [], health: { progressAbnormal: false, riskAbnormal: false, costAbnormal: false, paymentAbnormal: false, overall: '健康' },
    ...over,
  } as Project
}

const PMIS: Record<string, ProjectPmis> = {
  'QABJ-SS-1': {
    progress: { 完工进展: 0.2, 里程碑进度状态: '正常', 项目阶段: '项目执行', 计划终验: '2028-01-31' },
    status: { 项目状态: '实施中', 是否暂停: false, 评级: 'C', 评分: 25.0, 项目级别: 'P3', 项目类型: '交付项目' },
    cost: { 总预算: 654051.9, 核算: 208745.13, 剩余预算: 445306.77, 消耗比: 0.319, 超支: false, 成本状态: '正常' },
    risk: { 未关闭风险数: 2, 风险记录数: 3, 最高等级: '中', 闭环率: 0.33 },
    customer: { 最终客户: '北京海聚博源', 合同编号: 'QAX1', 签约形式: null, 行业: '企业', 合同总额: 5276000.0 },
  } as unknown as ProjectPmis,
}

describe('paymentStatusOf', () => {
  it('relatedNodeCount=0 → 无节点', () => {
    expect(paymentStatusOf(proj())).toBe('无节点')
  })
  it('delayedCount>0 → 延期', () => {
    expect(paymentStatusOf(proj({ payment: { ...PAY0, relatedNodeCount: 2, delayedCount: 1 } }))).toBe('延期')
  })
  it('remainingTotal<=0 且 actualTotal>0 → 已回清', () => {
    expect(paymentStatusOf(proj({ payment: { ...PAY0, relatedNodeCount: 2, actualTotal: 100, remainingTotal: 0 } }))).toBe('已回清')
  })
  it('其余 → 回款中', () => {
    expect(paymentStatusOf(proj({ payment: { ...PAY0, relatedNodeCount: 2, actualTotal: 50, remainingTotal: 50 } }))).toBe('回款中')
  })
  it('remainingTotal 为负(超收) → 已回清', () => {
    expect(paymentStatusOf(proj({ payment: { ...PAY0, relatedNodeCount: 2, actualTotal: 120, remainingTotal: -20 } }))).toBe('已回清')
  })
})

describe('buildProjectRows', () => {
  it('join projectPmis 取 阶段/客户/完工/风险/消耗比/项目状态', () => {
    const [r] = buildProjectRows([proj()], PMIS)
    expect(r.stage).toBe('项目执行')
    expect(r.customer).toBe('北京海聚博源')
    expect(r.progress).toBe(0.2)
    expect(r.riskLevel).toBe('中')
    expect(r.openRisks).toBe(2)
    expect(r.costRatio).toBe(0.319)
    expect(r.projectStatus).toBe('实施中')
    expect(r.health).toBe('健康')
    expect(r.contractAmount).toBe(5276000.0)
    expect(r.projectLevel).toBe('P3')
    expect(r.projectType).toBe('交付项目')
  })
  it('pmis 缺失时取占位默认值', () => {
    const [r] = buildProjectRows([proj({ projectId: 'NO-PMIS' })], PMIS)
    expect(r.stage).toBe('-')
    expect(r.customer).toBe('-')
    expect(r.contractAmount).toBeNull()
    expect(r.projectLevel).toBe('-')
    expect(r.projectType).toBe('-')
    expect(r.progress).toBeNull()
    expect(r.riskLevel).toBe('无')
    expect(r.costRatio).toBeNull()
  })
  it('relatedClosedId 非空 → hasClosed=true', () => {
    const [r] = buildProjectRows([proj({ isPresale: true, relatedClosedId: 'OLD-1' })], {})
    expect(r.isPresale).toBe(true)
    expect(r.hasClosed).toBe(true)
  })
})

const F0: ProjectFilters = { search: '', orgL4: '', stage: '', projectStatus: '', health: '', riskLevel: '', paymentStatus: '', presale: '', paused: '', overspend: '' }

describe('filterProjectRows', () => {
  const rows = buildProjectRows(
    [proj(), proj({ projectId: 'QAX-2', projectName: '售前服务-某局', projectManager: '李四', isPresale: true, relatedClosedId: 'OLD-9', health: { progressAbnormal: true, riskAbnormal: false, costAbnormal: false, paymentAbnormal: false, overall: '关注' } })],
    PMIS,
  )
  it('search 命中 项目名/编号/客户/经理 任一（大小写不敏感）', () => {
    expect(filterProjectRows(rows, { ...F0, search: '李四' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, search: 'qax-2' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, search: '海聚' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, search: '不存在' })).toHaveLength(0)
  })
  it('按健康度与售前过滤', () => {
    expect(filterProjectRows(rows, { ...F0, health: '关注' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, presale: 'yes' })[0].projectId).toBe('QAX-2')
    expect(filterProjectRows(rows, { ...F0, presale: 'no' })[0].projectId).toBe('QABJ-SS-1')
  })
  it("搜索 '-' 不命中占位字段(客户缺失为 '-')", () => {
    // X9 行四个搜索字段中只有 customer 占位 '-' 含连字符 → 不应命中
    const only = buildProjectRows([proj({ projectId: 'X9', projectName: '纯中文名' })], {})
    expect(filterProjectRows(only, { ...F0, search: '-' })).toHaveLength(0)
  })
})

describe('orgL4 列与筛选(P5.5 用户反馈)', () => {
  it('build 取 orgL4,filter 按服务组过滤', () => {
    const rows = buildProjectRows(
      [proj(), proj({ projectId: 'X2', projectName: '乙', orgL4: 'B组' } as any)],
      {},
    )
    expect(rows[0].orgL4).toBe('小微部')
    expect(filterProjectRows(rows, { ...F0, orgL4: 'B组' })).toHaveLength(1)
    expect(distinctOptions(rows, 'orgL4').sort()).toEqual(['B组', '小微部'])
  })
})

describe('distinctOptions', () => {
  it('去重且剔除空与占位 -', () => {
    const rows = buildProjectRows([proj(), proj({ projectId: 'NO-PMIS' })], PMIS)
    expect(distinctOptions(rows, 'stage')).toEqual(['项目执行'])
  })
})

describe('paused/overspend 扩展(P4 风险焦点行)', () => {
  const PM2: Record<string, any> = {
    'QABJ-SS-1': { status: { 是否暂停: true }, cost: { 超支: true } },
  }
  it('build 取 是否暂停/超支 bool', () => {
    const [r] = buildProjectRows([proj()], PM2 as any)
    expect(r.paused).toBe(true)
    expect(r.overspend).toBe(true)
    const [r2] = buildProjectRows([proj({ projectId: 'NO-PMIS' })], PM2 as any)
    expect(r2.paused).toBe(false)
    expect(r2.overspend).toBe(false)
  })
  it('filter paused=yes / overspend=yes', () => {
    const rows = buildProjectRows([proj(), proj({ projectId: 'X2', projectName: '乙' })], PM2 as any)
    expect(filterProjectRows(rows, { ...F0, paused: 'yes' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, overspend: 'yes' })[0].projectId).toBe('QABJ-SS-1')
  })
})
