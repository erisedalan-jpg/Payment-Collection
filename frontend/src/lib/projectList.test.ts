import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, filterProjectRows, paymentStatusOf, type ProjectFilters } from './projectList'
import { NO_TAG_VALUE } from '@/lib/tagFilter'

const PAY0 = { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }

function proj(over: Partial<Project> = {}): Project {
  return {
    projectId: 'QABJ-SS-1', projectName: '终端安全项目', projectManager: '何平', orgL4: '小微部',
    isPresale: false, relatedClosedId: '', customer: '北京海聚博源', payment: { ...PAY0 },
    deliveryCosts: [], health: { progressAbnormal: false, riskAbnormal: false, costAbnormal: false, paymentAbnormal: false, overall: '健康' },
    ...over,
  } as Project
}

const PMIS: Record<string, ProjectPmis> = {
  'QABJ-SS-1': {
    progress: { 完工进展: 0.2, 里程碑进度状态: '正常', 项目阶段: '项目执行', 终验时间: '2028-01-31' },
    status: { 项目状态: '实施中', 是否暂停: false, 评级: 'C', 评分: 25.0, 项目级别: 'P3', 项目类型: '交付项目' },
    cost: { 总预算: 654051.9, 核算: 208745.13, 剩余预算: 445306.77, 消耗比: 0.319, 项目超支: false, 成本状态: '正常' },
    risk: { 未关闭风险数: 2, 风险记录数: 3, 最高等级: '中', 闭环率: 0.33 },
    customer: { 最终客户: '北京海聚博源', 合同编号: 'QAX1', 签约单位: null, 行业: '企业', 合同总额: 5276000.0 },
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
    const [r] = buildProjectRows([proj({ projectId: 'NO-PMIS', customer: '' as any })], PMIS)
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
  it('售前项目本合同为空 → 合同金额回退原项目合同(paymentPmis.contract)', () => {
    // 售前服务类本项目 customer.合同总额 恒空；paymentPmis.contract 已由后端回退为原项目合同
    const [r] = buildProjectRows(
      [proj({ projectId: 'QAX-SF', isPresale: true, relatedClosedId: 'OLD-1', paymentPmis: { contract: 1_180_000 } as any })],
      {},
    )
    expect(r.contractAmount).toBe(1_180_000)
  })
  it('售前但原项目合同缺失(paymentPmis.contract 无值) → 仍为 null(显 -)', () => {
    const [r] = buildProjectRows(
      [proj({ projectId: 'QAX-SF2', isPresale: true, relatedClosedId: 'OLD-2', paymentPmis: {} as any })],
      {},
    )
    expect(r.contractAmount).toBeNull()
  })
  it('非售前不回退：本合同空且非售前 → null(即便有 paymentPmis.contract)', () => {
    const [r] = buildProjectRows(
      [proj({ projectId: 'QAX-ND', isPresale: false, paymentPmis: { contract: 999 } as any })],
      {},
    )
    expect(r.contractAmount).toBeNull()
  })
  it('从 Project 取 top1000/quadrant', () => {
    const [r] = buildProjectRows([proj({ top1000: '是', quadrant: 'M1 战略核心区' } as Partial<Project>)], {})
    expect(r.top1000).toBe('是')
    expect(r.quadrant).toBe('M1 战略核心区')
  })
  it('缺省 top1000→否 / quadrant→空', () => {
    const [r] = buildProjectRows([proj({ projectId: 'X9' })], {})
    expect(r.top1000).toBe('否')
    expect(r.quadrant).toBe('')
  })
  it('buildProjectRows 带出 signUnit(占位 -)', () => {
    const rows = buildProjectRows(
      [{ projectId: 'P1', signUnit: '上海伟仕佳杰科技有限公司' } as any,
       { projectId: 'P2' } as any],
      {},
    )
    expect(rows[0].signUnit).toBe('上海伟仕佳杰科技有限公司')
    expect(rows[1].signUnit).toBe('-')
  })
  it('setupDate 取 status.立项日期(缺 pmis → null)', () => {
    const withDate = buildProjectRows([proj()], {
      'QABJ-SS-1': { ...(PMIS['QABJ-SS-1'] as any), status: { ...(PMIS['QABJ-SS-1'] as any).status, 立项日期: '2019-06-24' } },
    } as any)[0]
    expect(withDate.setupDate).toBe('2019-06-24')
    expect(buildProjectRows([proj()], {})[0].setupDate).toBeNull()
  })
})

// Step 1: ProjectFilters 收窄后的基准对象（只含 search/presale/paused/overspend/tags/riskCategory）
const F0: ProjectFilters = { search: '', presale: '', paused: '', overspend: '', tags: [], riskCategory: '' }

describe('filterProjectRows', () => {
  const rows = buildProjectRows(
    [proj(), proj({ projectId: 'QAX-2', projectName: '售前服务-某局', projectManager: '李四', customer: '' as any, isPresale: true, relatedClosedId: 'OLD-9', health: { progressAbnormal: true, riskAbnormal: false, costAbnormal: false, paymentAbnormal: false, overall: '关注' } })],
    PMIS,
  )
  it('search 命中 项目名/编号/客户/经理 任一（大小写不敏感）', () => {
    expect(filterProjectRows(rows, { ...F0, search: '李四' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, search: 'qax-2' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, search: '海聚' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, search: '不存在' })).toHaveLength(0)
  })
  it('presale 过滤', () => {
    expect(filterProjectRows(rows, { ...F0, presale: 'yes' })[0].projectId).toBe('QAX-2')
    expect(filterProjectRows(rows, { ...F0, presale: 'no' })[0].projectId).toBe('QABJ-SS-1')
  })
  it("搜索 '-' 不命中占位字段(客户缺失为 '-')", () => {
    const only = buildProjectRows([proj({ projectId: 'X9', projectName: '纯中文名' })], {})
    expect(filterProjectRows(only, { ...F0, search: '-' })).toHaveLength(0)
  })
})

describe('标签筛选', () => {
  it('按标签多选过滤(并集 OR)', () => {
    const rows = [
      { projectId: 'A', tags: ['BH项目'] },
      { projectId: 'B', tags: ['框架合同'] },
      { projectId: 'C', tags: [] },
    ] as any
    expect(filterProjectRows(rows, { ...F0, tags: ['BH项目', '框架合同'] }).map((r) => r.projectId)).toEqual(['A', 'B'])
    expect(filterProjectRows(rows, { ...F0, tags: [] }).length).toBe(3)
  })

  it('无标签(NO_TAG_VALUE) 只留无标签行', () => {
    const rows = [
      { projectId: 'A', tags: ['x'] },
      { projectId: 'B', tags: [] },
    ] as any
    expect(filterProjectRows(rows, { ...F0, tags: [NO_TAG_VALUE] }).map((r) => r.projectId)).toEqual(['B'])
  })

  it('选标签 → OR 命中', () => {
    const rows = [
      { projectId: 'A', tags: ['x'] },
      { projectId: 'B', tags: [] },
    ] as any
    expect(filterProjectRows(rows, { ...F0, tags: ['x'] }).map((r) => r.projectId)).toEqual(['A'])
  })

  it('混选 无标签+标签 → 并集', () => {
    const rows = [
      { projectId: 'A', tags: ['x'] },
      { projectId: 'B', tags: [] },
    ] as any
    expect(filterProjectRows(rows, { ...F0, tags: [NO_TAG_VALUE, 'x'] }).map((r) => r.projectId)).toEqual(['A', 'B'])
  })

  it('tags 空数组 → 不过滤，返回全部', () => {
    const rows = [
      { projectId: 'A', tags: ['x'] },
      { projectId: 'B', tags: [] },
    ] as any
    expect(filterProjectRows(rows, { ...F0, tags: [] }).map((r) => r.projectId)).toEqual(['A', 'B'])
  })
})

describe('isAnomalous 标记', () => {
  it('orgL4 空行标 isAnomalous=true', () => {
    const rows = buildProjectRows([
      { projectId: 'A', projectName: 'a', orgL4: '组1' } as any,
      { projectId: 'X', projectName: 'x', orgL4: '' } as any,
    ], {})
    expect(rows.find((r) => r.projectId === 'A')!.isAnomalous).toBe(false)
    expect(rows.find((r) => r.projectId === 'X')!.isAnomalous).toBe(true)
  })
})

describe('riskCategory 过滤', () => {
  // 构建测试行（直接 cast，不走 buildProjectRows 避免 PMIS 依赖）
  const makeRow = (id: string, health: string, categories: string[]): any => ({
    projectId: id, projectName: id, customer: '-', contractAmount: null,
    projectLevel: '-', projectType: '-', projectManager: '-', orgL4: '组1',
    stage: '-', progress: null, projectStatus: '-', riskLevel: '-', openRisks: 0,
    costRatio: null, paymentRatio: null, paymentStatus: '-',
    health, isPresale: false, hasClosed: false, paused: false, overspend: false,
    tags: [], isAnomalous: false,
    riskReasons: categories.map(cat => ({ category: cat, detail: `${cat}详情`, tone: 'warn' as const })),
  })

  const rows = [
    makeRow('A', '健康', ['回款延期']),
    makeRow('B', '关注', ['里程碑滞后', '总成本超支大于5000']),
    makeRow('C', '风险', []),
    makeRow('D', '健康', []),
  ]

  it('riskCategory="" → 不过滤，返回全部', () => {
    expect(filterProjectRows(rows, { ...F0, riskCategory: '' })).toHaveLength(4)
  })
  it('riskCategory="回款延期" → 只含 riskReasons 含此类的行', () => {
    const res = filterProjectRows(rows, { ...F0, riskCategory: '回款延期' })
    expect(res.map(r => r.projectId)).toEqual(['A'])
  })
  it('riskCategory="总成本超支大于5000" → 只含命中行', () => {
    const res = filterProjectRows(rows, { ...F0, riskCategory: '总成本超支大于5000' })
    expect(res.map(r => r.projectId)).toEqual(['B'])
  })
  it('riskCategory="健康度低" → health∈{关注,风险}', () => {
    const res = filterProjectRows(rows, { ...F0, riskCategory: '健康度低' })
    expect(res.map(r => r.projectId).sort()).toEqual(['B', 'C'])
  })
  it('riskCategory="数据异常" → 无命中时返回空', () => {
    const res = filterProjectRows(rows, { ...F0, riskCategory: '数据异常' })
    expect(res).toHaveLength(0)
  })
  it('riskCategory="成本超支"（首页桶名）→ 命中含总成本超支或交付成本超支的行，不命中无超支行', () => {
    const rows2 = [
      makeRow('X1', '健康', ['总成本超支大于5000']),
      makeRow('X2', '健康', ['交付成本超支']),
      makeRow('X3', '健康', ['回款延期']),
    ]
    const res = filterProjectRows(rows2, { ...F0, riskCategory: '成本超支' })
    expect(res.map(r => r.projectId).sort()).toEqual(['X1', 'X2'])
  })
})

describe('paused/overspend 扩展(P4 风险焦点行)', () => {
  const PM2: Record<string, any> = {
    'QABJ-SS-1': { status: { 是否暂停: true }, cost: { 项目超支: true } },
  }
  it('build 取 是否暂停/项目超支 bool', () => {
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
  it('[守护] cost.项目超支:true 且不含旧键超支 → overspend=true', () => {
    const pmGuard: Record<string, any> = {
      'QABJ-SS-1': { status: {}, cost: { 项目超支: true } },
    }
    expect(pmGuard['QABJ-SS-1'].cost).not.toHaveProperty('超支')
    const [r] = buildProjectRows([proj()], pmGuard as any)
    expect(r.overspend).toBe(true)
  })
})

describe('V4.0.1 三个日期字段', () => {
  const pmisMap = {
    'SS-1': { status: { 立项日期: '2026-01-01' },
              progress: { 终验时间: '2026-08-01', 实际终验时间: '2026-08-20' } },
    'OLD-9': { status: { 立项日期: '2024-03-15' } },
    'N-1': { status: { 立项日期: '2025-05-05' },
             progress: { 终验时间: '2026-07-01', 实际终验时间: null } },
  } as any

  it('售前项目的 originSetupDate 取原项目的立项日期', () => {
    const rows = buildProjectRows(
      [{ projectId: 'SS-1', isPresale: true, relatedClosedId: 'OLD-9' } as any], pmisMap)
    expect(rows[0].originSetupDate).toBe('2024-03-15')
    // 反向断言:绝不能等于本项目立项日期 —— 取错不会报错
    expect(rows[0].originSetupDate).not.toBe('2026-01-01')
    expect(rows[0].setupDate).toBe('2026-01-01')
  })

  it('无 relatedClosedId 的项目 originSetupDate 为 null', () => {
    const rows = buildProjectRows([{ projectId: 'N-1' } as any], pmisMap)
    expect(rows[0].originSetupDate).toBeNull()
  })

  it('relatedClosedId 指向不存在的项目时为 null,不抛错', () => {
    const rows = buildProjectRows(
      [{ projectId: 'SS-1', relatedClosedId: 'NOT-EXIST' } as any], pmisMap)
    expect(rows[0].originSetupDate).toBeNull()
  })

  it('计划/实际终验时间直取 progress,不重算', () => {
    const rows = buildProjectRows([{ projectId: 'SS-1' } as any], pmisMap)
    expect(rows[0].plannedFinalAcceptDate).toBe('2026-08-01')
    expect(rows[0].actualFinalAcceptDate).toBe('2026-08-20')
  })

  it('实际终验为 null 时字段为 null,不落成空串', () => {
    const rows = buildProjectRows([{ projectId: 'N-1' } as any], pmisMap)
    expect(rows[0].plannedFinalAcceptDate).toBe('2026-07-01')
    expect(rows[0].actualFinalAcceptDate).toBeNull()
  })

  it('progress 整体缺失时两个终验字段均为 null', () => {
    const rows = buildProjectRows([{ projectId: 'OLD-9' } as any], pmisMap)
    expect(rows[0].plannedFinalAcceptDate).toBeNull()
    expect(rows[0].actualFinalAcceptDate).toBeNull()
  })
})
