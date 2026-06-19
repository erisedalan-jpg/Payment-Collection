import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import {
  buildInsightRows, groupInsight, insightCross, insightPivot,
  INSIGHT_DIMENSIONS, INSIGHT_METRICS,
} from './projectPivot'

const PAY0 = { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }

// orgL4 非空 = 正常项目（buildInsightRows 排除 isAnomalous，即 orgL4 为空的项目）
const PROJECTS = [
  { projectId: 'P-1', projectName: '甲', projectManager: '何平', orgL4: '交付一组',
    payment: { ...PAY0, relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 600, delayedCount: 1 },
    deliveryCosts: [], health: { overall: '风险' } },
  { projectId: 'P-2', projectName: '乙', projectManager: '何平', orgL4: '交付二组',
    payment: { ...PAY0, relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 1000 },
    deliveryCosts: [], health: { overall: '健康' } },
  { projectId: 'P-3', projectName: '丙', projectManager: '李四', orgL4: '交付一组',
    payment: { ...PAY0 }, deliveryCosts: [], health: { overall: '健康' } },
] as unknown as Project[]

const PMIS = {
  'P-1': { progress: { 项目阶段: '项目执行', 完工进展: 0.2 }, status: { 项目状态: '实施中' }, risk: { 最高等级: '高' },
           cost: { 消耗比: 0.5 }, customer: { 行业: '银行', 签约单位: null, 合同总额: 2000000 } },
  'P-2': { progress: { 项目阶段: '项目执行', 完工进展: 0.8 }, status: { 项目状态: '已验收' }, risk: {},
           cost: {}, customer: { 行业: '银行', 合同总额: 1000000 } },
} as unknown as Record<string, ProjectPmis>

describe('buildInsightRows', () => {
  it('join 取 7 维字段与指标原料,空值归一', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    expect(rows).toHaveLength(3)
    const [r1, , r3] = rows
    expect(r1.stage).toBe('项目执行')
    expect(r1.riskLevel).toBe('高')
    expect(r1.industry).toBe('银行')
    expect(r1.signType).toBe('未指定')   // null 归一
    expect(r1.contractAmount).toBe(2000000)
    expect(r1.delayed).toBe(true)
    expect(r3.stage).toBe('未指定')      // 无 pmis
    expect(r3.riskLevel).toBe('无')
    expect(r3.health).toBe('健康')
    expect(r3.progress).toBeNull()
  })
})

describe('groupInsight', () => {
  it('单维分桶 6 指标(均值忽略空,完成率 Σ/Σ,延期计数)', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const gs = groupInsight(rows, ['manager'])
    const he = gs.find((g) => g.key === '何平')!
    expect(he.projectCount).toBe(2)
    expect(he.contractAmount).toBe(3000000)
    expect(he.avgProgress).toBeCloseTo(0.5)      // (0.2+0.8)/2
    expect(he.avgCostRatio).toBeCloseTo(0.5)     // 仅 P-1 有值
    expect(he.paymentRatio).toBeCloseTo(0.8)     // 1600/2000
    expect(he.delayedProjects).toBe(1)
    const li = gs.find((g) => g.key === '李四')!
    expect(li.avgProgress).toBeNull()            // 全空 → null
    expect(li.paymentRatio).toBeNull()           // Σexpected=0 → null
  })
  it('多维桶 key 以 / 连接且 values 对应', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const gs = groupInsight(rows, ['health', 'manager'])
    expect(gs.map((g) => g.key).sort()).toEqual(['健康 / 何平', '健康 / 李四', '风险 / 何平'])
  })
})

describe('insightCross / insightPivot', () => {
  it('交叉矩阵:行列按指标合计降序,格=指标(null→0),index 留组', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const m = insightCross(rows, 'health', 'manager', 'projectCount')
    expect(m.rows).toEqual(['健康', '风险'])     // 2 > 1
    expect(m.cols).toEqual(['何平', '李四'])     // 2 > 1
    expect(m.cells).toEqual([[1, 1], [1, 0]])
    expect(m.index['风险']['何平'].rows[0].projectId).toBe('P-1')
  })
  it('rate 指标:桶存在但无数据 → 格为 NaN(展示层显 -),不与真实 0% 混淆', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const m = insightCross(rows, 'health', 'manager', 'paymentRatio')
    const r = m.rows.indexOf('健康')
    const c = m.cols.indexOf('李四')
    expect(Number.isNaN(m.cells[r][c])).toBe(true)   // P-3 Σexpected=0 → null → NaN
    const c2 = m.cols.indexOf('何平')
    expect(m.cells[r][c2]).toBeCloseTo(1)            // P-2 1000/1000,真实值不受影响
  })

  it('透视:colDims 空退化单列合计', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const p = insightPivot(rows, ['manager'], [], 'contractAmount')
    expect(p.cols).toEqual([{ key: '', label: '合计' }])
    expect(p.rows[0].key).toBe('何平')           // 3000000 > 0
    expect(p.cells[0][0]).toBe(3000000)
  })
})

describe('契约面', () => {
  it('7 维度 6 指标', () => {
    expect(INSIGHT_DIMENSIONS.map((d) => d.label)).toEqual(['阶段', '项目状态', '风险等级', '项目经理', '服务组', '行业', '签约单位', '健康度', '评级', '超支', '暂停'])
    expect(INSIGHT_METRICS.map((m) => m.key)).toEqual(['projectCount', 'contractAmount', 'avgProgress', 'avgCostRatio', 'paymentRatio', 'delayedProjects'])
  })
})
