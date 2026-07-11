import { describe, it, expect } from 'vitest'
import { buildTodoQueue } from './todoQueue'
import type { PayNodeRow } from './paymentPmis'
import type { MilestoneProject } from './milestoneAnalytics'
import type { RiskReason } from './riskReasons'

// 固定 now，避免日历脆弱
const NOW = new Date(2026, 6, 11) // 2026-07-11 (月份 0-based)
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function payNode(over: Partial<PayNodeRow>): PayNodeRow {
  return {
    projectId: 'P', projectName: '项目', stage: '款', planDate: '', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0,
    projectManager: '', status: '', dept: '', orgL3_1: '', projStage: '', tier: '', progress: '',
    ...over,
  }
}
function ms(projectId: string, nodes: MilestoneProject['nodes']): MilestoneProject {
  return { projectId, projectName: projectId + '名', manager: '', orgL4: '', orgL3_1: '', orgL3: '', projectType: '', contract: 0, status: '正常', nodes }
}
function prow(projectId: string, cats: string[], overspendAmount: number) {
  return { projectId, projectName: projectId + '名', riskReasons: cats.map((c) => ({ category: c, detail: '', tone: 'danger' } as RiskReason)), overspendAmount }
}

describe('buildTodoQueue', () => {
  it('回款：延期→已延期桶(rank0)，今日到期→今到期(rank1)，窗口内→临期(rank2)', () => {
    const nodes: PayNodeRow[] = [
      payNode({ projectId: 'A', stage: 's1', status: '延期', planDate: ymd(2026, 6, 1), unpaidAmount: 1200000 }),
      payNode({ projectId: 'B', stage: 's2', status: '待回款', planDate: ymd(2026, 7, 11), unpaidAmount: 800000 }),
      payNode({ projectId: 'C', stage: 's3', status: '待回款', planDate: ymd(2026, 7, 15), unpaidAmount: 600000 }),
    ]
    const r = buildTodoQueue(nodes, [], [], NOW, 7)
    expect(r.counts['回款已延期']).toBe(1)
    expect(r.counts['回款临期']).toBe(2) // 今到期 + 临期
    expect(r.items.map((i) => i.stateLabel)).toEqual(['已延期', '今到期', '临期'])
  })

  it('窗口 7→30：窗口外临期节点在 7 天时不计、30 天时计入', () => {
    const nodes: PayNodeRow[] = [payNode({ projectId: 'D', stage: 's', status: '待回款', planDate: ymd(2026, 7, 25), unpaidAmount: 100000 })]
    expect(buildTodoQueue(nodes, [], [], NOW, 7).counts['回款临期']).toBe(0)
    expect(buildTodoQueue(nodes, [], [], NOW, 30).counts['回款临期']).toBe(1)
  })

  it('延期节点即使 planDate 落窗口也只进已延期，不双计', () => {
    const nodes: PayNodeRow[] = [payNode({ projectId: 'E', stage: 's', status: '延期', planDate: ymd(2026, 7, 12), unpaidAmount: 500000 })]
    const r = buildTodoQueue(nodes, [], [], NOW, 7)
    expect(r.counts['回款已延期']).toBe(1)
    expect(r.counts['回款临期']).toBe(0)
  })

  it('里程碑：planDate<今且未完成=滞后(rank3)，窗口内=临期(rank4)，已完成(actualDate非空)不计', () => {
    const projects: MilestoneProject[] = [
      ms('M1', [{ name: '终验', planDate: ymd(2026, 7, 1), actualDate: '' } as any]),
      ms('M2', [{ name: '初验', planDate: ymd(2026, 7, 13), actualDate: '' } as any]),
      ms('M3', [{ name: '到货', planDate: ymd(2026, 7, 1), actualDate: ymd(2026, 7, 2) } as any]),
    ]
    const r = buildTodoQueue([], projects, [], NOW, 7)
    expect(r.counts['里程碑']).toBe(2)
    expect(r.items.map((i) => i.stateLabel)).toEqual(['里程碑滞后', '里程碑临期'])
  })

  it('成本超支：命中 交付成本超支/总成本超支大于5000 入队，一项目一条，金额降序', () => {
    const rows = [
      prow('X', ['总成本超支大于5000'], 80000),
      prow('Y', ['交付成本超支', '总成本超支大于5000'], 50000), // 多原因只出一条
      prow('Z', ['总成本超支小于5000'], 3000), // 不入
    ]
    const r = buildTodoQueue([], [], rows as any, NOW, 7)
    expect(r.counts['成本超支']).toBe(2)
    expect(r.items.filter((i) => i.bucket === '成本超支').map((i) => i.projectId)).toEqual(['X', 'Y'])
  })

  it('混合桶整体按 urgencyRank 升序：已延期 < 今到期 < 临期 < 里程碑 < 超支', () => {
    const nodes: PayNodeRow[] = [
      payNode({ projectId: 'A', stage: 's', status: '延期', planDate: ymd(2026, 6, 1), unpaidAmount: 100 }),
      payNode({ projectId: 'B', stage: 's', status: '待回款', planDate: ymd(2026, 7, 11), unpaidAmount: 100 }),
    ]
    const projects: MilestoneProject[] = [ms('M', [{ name: '终验', planDate: ymd(2026, 7, 1), actualDate: '' } as any])]
    const rows = [prow('X', ['交付成本超支'], 60000)]
    const r = buildTodoQueue(nodes, projects, rows as any, NOW, 7)
    expect(r.items.map((i) => i.urgencyRank)).toEqual([0, 1, 3, 5])
  })
})
