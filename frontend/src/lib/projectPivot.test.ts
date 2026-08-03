import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import {
  buildInsightRows, groupInsight, insightCross, insightPivot,
  INSIGHT_DIMENSIONS, INSIGHT_METRICS,
} from './projectPivot'

const PAY0 = { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }

// orgL4 非空 = 正常项目；orgL4 为空/undefined = 异常项目(回款列置 0/false，行本身保留)
const PROJECTS = [
  // paymentPmis.actualTotal(流水净额)与 payment.actualTotal(节点已收)【刻意取不同值】——
  // 回款完成率的分子必须是流水,读成节点已收时下面的比率断言才会红。
  { projectId: 'P-1', projectName: '甲', projectManager: '何平', orgL4: '交付一组',
    payment: { ...PAY0, relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 600, delayedCount: 1 },
    paymentPmis: { contract: 2000000, actualTotal: 750 },
    deliveryCosts: [], health: { overall: '风险' } },
  { projectId: 'P-2', projectName: '乙', projectManager: '何平', orgL4: '交付二组',
    payment: { ...PAY0, relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 1000 },
    paymentPmis: { contract: 1000000, actualTotal: 900 },
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
    expect(r1.contractAmount).toBe(2000000)   // 取自 paymentPmis.contract(售前已回退),不是 customer.合同总额
    expect(r1.recordTotal).toBe(750)          // 流水净额,与节点已收 600 不是一回事
    expect(r1.delayed).toBe(true)
    expect(r3.stage).toBe('未指定')      // 无 pmis
    expect(r3.riskLevel).toBe('无')
    expect(r3.health).toBe('健康')
    expect(r3.progress).toBeNull()
  })
  it('异常项目(orgL4 空)保留在行里但回款列置 0/false', () => {
    // 构造含异常项目的列表
    const anomProject = { projectId: 'P-X', projectName: '异常甲', projectManager: '测试员',
      // orgL4 undefined = isAnomalous → true
      payment: { ...PAY0, expectedTotal: 5000, actualTotal: 3000, delayedCount: 2 },
      deliveryCosts: [], health: { overall: '健康' } } as unknown as Project
    const rows = buildInsightRows([anomProject], {})
    // 行本身保留(不被过滤)
    expect(rows).toHaveLength(1)
    expect(rows[0].projectId).toBe('P-X')
    // 回款列置 0/false
    expect(rows[0].expectedTotal).toBe(0)
    expect(rows[0].actualTotal).toBe(0)
    expect(rows[0].delayed).toBe(false)
    // 非回款列正常
    expect(rows[0].projectName).toBe('异常甲')
    expect(rows[0].health).toBe('健康')
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
    // 分子=Σ流水 750+900=1650(不是 Σ节点已收 1600),分母=Σ合同 2000000+1000000
    // ★ 必须指定精度:toBeCloseTo 默认只比到小数点后 2 位,而本例是 5.5e-4 量级 ——
    // 不指定精度时,分子读成节点已收(1600)也照样通过,这条断言就成了摆设。
    expect(he.paymentRatio).toBeCloseTo(1650 / 3_000_000, 8)
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
    // P-2: 流水 900 / 合同 1000000(节点已收是 1000,读错就会得 0.001)
    expect(m.cells[r][c2]).toBeCloseTo(900 / 1_000_000, 8)   // 同上,精度必须指定
  })

  it('透视:colDims 空退化单列合计', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const p = insightPivot(rows, ['manager'], [], 'contractAmount')
    expect(p.cols).toEqual([{ key: '', label: '合计' }])
    expect(p.rows[0].key).toBe('何平')           // 3000000 > 0
    expect(p.cells[0][0]).toBe(3000000)
  })
})

describe('buildInsightRows', () => {
  it('含 projectLevel 维度,不再有 rating', () => {
    const pmis = { 'P-1': { status: { 项目级别: 'A级' } } } as unknown as Record<string, ProjectPmis>
    const projects = [{ projectId: 'P-1', projectName: '甲', orgL4: '交付一组', payment: { ...PAY0 }, health: {} }] as unknown as Project[]
    const r = buildInsightRows(projects, pmis)[0] as unknown as Record<string, unknown>
    expect(r.projectLevel).toBe('A级')
    expect('rating' in r).toBe(false)
  })
})

describe('回款完成率口径(与全站主口径同源)', () => {
  it('售前项目 customer.合同总额 为空时,分母取 paymentPmis.contract,比率不会超过 100%', () => {
    // 这是 2026-08-03 审查逮到的实际形态:生产 676 个在建项目里 373 个(55%)是售前,
    // 它们的 customer.合同总额 为空,而节点已收照样计入分子 —— 旧口径下全域算出 107.57%,
    // 11 个 L4 桶里 8 个 >100%,最高 424.9%。修复后全域回到 47.85%,与主口径逐位吻合。
    const presale = [{
      projectId: 'S-1', projectName: '售前甲', projectManager: '张三', orgL4: '交付一组',
      payment: { ...PAY0, expectedTotal: 1000, actualTotal: 944000 },
      paymentPmis: { contract: 1180000, actualTotal: 944000 },
      deliveryCosts: [], health: {},
    }] as unknown as Project[]
    // customer 里【没有】合同总额 —— 售前项目在 PMIS 客户表里就是这样
    const pmis = { 'S-1': { customer: { 行业: '银行' } } } as unknown as Record<string, ProjectPmis>
    const [row] = buildInsightRows(presale, pmis)
    expect(row.contractAmount).toBe(1180000)
    const g = groupInsight([row], ['manager'])[0]
    expect(g.paymentRatio).toBeCloseTo(944000 / 1180000)
    expect(g.paymentRatio!).toBeLessThanOrEqual(1)   // 旧口径下这里是 Infinity(分母 0)
  })
})

describe('契约面', () => {
  it('维度去评级加项目级别;6 指标', () => {
    expect(INSIGHT_DIMENSIONS.map((d) => d.label)).toEqual(['阶段', '项目状态', '风险等级', '项目经理', '服务组', '项目级别', '行业', '签约单位', '健康度', '超支', '暂停', 'TOP1000', '象限'])
    expect(INSIGHT_DIMENSIONS.map((d) => d.key)).not.toContain('rating')
    expect(INSIGHT_METRICS.map((m) => m.key)).toEqual(['projectCount', 'contractAmount', 'avgProgress', 'avgCostRatio', 'paymentRatio', 'delayedProjects'])
  })
  it('buildInsightRows 映射 top1000/quadrant', () => {
    const projects = [{ projectId: 'P-1', projectName: '甲', orgL4: '组', payment: { ...PAY0 }, health: {}, top1000: '是', quadrant: 'M1 战略核心区' }] as unknown as Project[]
    const r = buildInsightRows(projects, {})[0]
    expect(r.top1000).toBe('是')
    expect(r.quadrant).toBe('M1 战略核心区')
  })
})
