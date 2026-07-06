import { describe, it, expect } from 'vitest'
import type { Project, ProjectPaymentPmis, ProjectPmis, PaymentNodePmis, PaymentRecordsEntry } from '@/types/analysis'
import {
  TIER_HIGH, TIER_MID, deriveTier, deriveProgress, deriveDept, deriveStage,
  rateColorPmis, PAY_FACET_DIMS, filterProjects, projectPaymentRows, summaryByDim,
  paymentNodeRows, nodeSummary, progressBuckets, pmisRiskGroups, l4SummaryRow,
  type DimSummary,
} from './paymentPmis'

const pm = (o: Partial<ProjectPaymentPmis>): ProjectPaymentPmis => ({ ...o })
const proj = (o: Partial<Project>): Project => ({ projectId: 'P0', ...o } as Project)

describe('deriveTier（金额档四档边界）', () => {
  it('≥100万 → 100万以上', () => {
    expect(deriveTier(TIER_HIGH)).toBe('100万以上')
    expect(deriveTier(2_000_000)).toBe('100万以上')
  })
  it('[50万,100万) → 50-100万', () => {
    expect(deriveTier(TIER_MID)).toBe('50-100万')
    expect(deriveTier(999_999)).toBe('50-100万')
  })
  it('(0,50万) → 50万以下', () => {
    expect(deriveTier(1)).toBe('50万以下')
    expect(deriveTier(499_999)).toBe('50万以下')
  })
  it('null/0/负 → 未知', () => {
    expect(deriveTier(null)).toBe('未知')
    expect(deriveTier(undefined)).toBe('未知')
    expect(deriveTier(0)).toBe('未知')
  })
})

describe('deriveProgress（进度态边界）', () => {
  it('ratio≥0.999 → 已全额回款（含>1 超额）', () => {
    expect(deriveProgress(100, 0.999)).toBe('已全额回款')
    expect(deriveProgress(100, 1)).toBe('已全额回款')
    expect(deriveProgress(100, 1.05)).toBe('已全额回款')
  })
  it('0<ratio<0.999 → 部分回款', () => {
    expect(deriveProgress(100, 0.5)).toBe('部分回款')
  })
  it('ratio==0 或 null 且 contract>0 → 未回款', () => {
    expect(deriveProgress(100, 0)).toBe('未回款')
    expect(deriveProgress(100, null)).toBe('未回款')
  })
  it('无合同 / null/undefined → 未知', () => {
    expect(deriveProgress(null, null)).toBe('未知')
    expect(deriveProgress(0, 0)).toBe('未知')
    expect(deriveProgress(null, undefined)).toBe('未知')
    expect(deriveProgress(undefined, undefined)).toBe('未知')
  })
})

describe('deriveDept / deriveStage', () => {
  it('部门取 orgL4，空→未指定', () => {
    expect(deriveDept(proj({ orgL4: '交付一组' }))).toBe('交付一组')
    expect(deriveDept(proj({ orgL4: '' }))).toBe('未指定')
    expect(deriveDept(proj({}))).toBe('未指定')
  })
  it('阶段取 projectPmis[pid].progress.项目阶段，空/缺→未指定', () => {
    const map: Record<string, ProjectPmis> = {
      P1: { progress: { 项目阶段: '实施' } } as ProjectPmis,
      P2: { progress: {} } as ProjectPmis,
    }
    expect(deriveStage('P1', map)).toBe('实施')
    expect(deriveStage('P2', map)).toBe('未指定')
    expect(deriveStage('P3', map)).toBe('未指定')
    expect(deriveStage('P1', undefined)).toBe('未指定')
  })
})

describe('rateColorPmis（完成率三态色，对齐既有 0.8/0.5 阈值，输出令牌）', () => {
  it('≥0.8 → ok-text；≥0.5 → warn-text；<0.5 → danger-text；null → mut', () => {
    expect(rateColorPmis(0.8)).toBe('var(--ok-text)')
    expect(rateColorPmis(0.5)).toBe('var(--warn-text)')
    expect(rateColorPmis(0.49)).toBe('var(--danger-text)')
    expect(rateColorPmis(null)).toBe('var(--mut)')
  })
})

describe('PAY_FACET_DIMS', () => {
  it('四维：部门/阶段/金额档/进度态', () => {
    expect(PAY_FACET_DIMS.map((d) => d.key)).toEqual(['dept', 'stage', 'tier', 'progress'])
  })
})

describe('filterProjects（视角/纳管，不复用 filterNodes）', () => {
  const ps = [
    proj({ projectId: 'A', orgL4: '组1', projectManager: '张三' }),
    proj({ projectId: 'B', orgL4: '组2', projectManager: '李四' }),
    proj({ projectId: 'C', orgL4: '组1', projectManager: '李四' }),
  ]
  const base = { viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  it('global 全量', () => {
    expect(filterProjects(ps, base).map((p) => p.projectId)).toEqual(['A', 'B', 'C'])
  })
  it('l4 视角按 orgL4', () => {
    expect(filterProjects(ps, { ...base, viewMode: 'l4', viewL4: '组1' }).map((p) => p.projectId)).toEqual(['A', 'C'])
  })
  it('pm 视角按 projectManager', () => {
    expect(filterProjects(ps, { ...base, viewMode: 'pm', viewPM: '李四' }).map((p) => p.projectId)).toEqual(['B', 'C'])
  })
  it('排除开启时剔除 excludedIds', () => {
    expect(filterProjects(ps, { ...base, excludeActive: true, excludedIds: { B: true } }).map((p) => p.projectId)).toEqual(['A', 'C'])
  })
  it('排除关闭时不剔除', () => {
    expect(filterProjects(ps, { ...base, excludeActive: false, excludedIds: { B: true } }).length).toBe(3)
  })
  it('orgL4 空项目恒排除（独立于 excludeActive）', () => {
    const withEmpty = [...ps, { projectId: 'X', projectName: '空', orgL4: '' } as any]
    expect(filterProjects(withEmpty, base).map((p) => p.projectId)).not.toContain('X')
    expect(filterProjects(withEmpty, { ...base, excludeActive: false }).map((p) => p.projectId)).not.toContain('X')
  })
})

describe('projectPaymentRows / summaryByDim', () => {
  // nodes/records 构造：让全部模式下 paymentPmisInRange 返回与旧 paymentPmis 一致的数值
  const nodesA: PaymentNodePmis[] = [
    { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.5, expectedPayment: 1_000_000, unpaidAmount: 500_000, reached: true, status: '已回款' } as PaymentNodePmis,
    { stage: '终验', planDate: '2026-03-01', actualDate: '', payRatio: 0.3, expectedPayment: 300_000, unpaidAmount: 150_000, reached: false, status: '延期' } as PaymentNodePmis,
    { stage: '质保', planDate: '2026-06-01', actualDate: '', payRatio: 0.2, expectedPayment: 200_000, unpaidAmount: 200_000, reached: false, status: '待回款' } as PaymentNodePmis,
  ]
  const nodesB: PaymentNodePmis[] = [
    { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-02', payRatio: 0.5, expectedPayment: 500_000, unpaidAmount: 0, reached: true, status: '已回款' } as PaymentNodePmis,
    { stage: '终验', planDate: '2026-02-01', actualDate: '2026-02-05', payRatio: 0.5, expectedPayment: 500_000, unpaidAmount: 0, reached: true, status: '已回款' } as PaymentNodePmis,
  ]
  const payNodes: Record<string, PaymentNodePmis[]> = { A: nodesA, B: nodesB }
  // 流水：A 回了 100 万，B 回了 100 万
  const recA: PaymentRecordsEntry = { records: [{ amount: 1_000_000, date: '2026-01-05' } as any] }
  const recB: PaymentRecordsEntry = { records: [{ amount: 1_000_000, date: '2026-02-05' } as any] }
  const payRec: Record<string, PaymentRecordsEntry> = { A: recA, B: recB }

  const ps = [
    proj({ projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1',
      overspendAmount: 0,
      paymentPmis: pm({ contract: 2_000_000, fromOrigin: false }) }),
    proj({ projectId: 'B', projectName: '乙', projectManager: '李四', orgL4: '组1',
      overspendAmount: 5000,
      paymentPmis: pm({ contract: 1_000_000, fromOrigin: true }) }),
  ]
  const map: Record<string, ProjectPmis> = { A: { progress: { 项目阶段: '实施' } } as ProjectPmis }

  it('行字段映射齐全（含派生维度与下钻兼容列）——全部模式，区间重算', () => {
    const rows = projectPaymentRows(ps, map, payNodes, payRec)
    const a = rows.find((r) => r.projectId === 'A')!
    // A: nodes 全部(start/end空)→全3节点 expectedTotal=1_500_000, actualTotal=流水100万, ratio=1000000/1500000
    expect(a).toMatchObject({
      projectName: '甲', projectManager: '张三', dept: '组1', stage: '实施',
      tier: '100万以上', contract: 2_000_000, actualTotal: 1_000_000,
      expectedTotal: 1_500_000, nodeCount: 3, reachedCount: 1, delayedCount: 1,
      fromOrigin: false, projectAmount: 2_000_000, orgL4: '组1',
    })
    // 分母改为合同 contract=2_000_000：1_000_000/2_000_000=0.5
    expect(a.paymentRatio).toBeCloseTo(1_000_000 / 2_000_000, 4)
    expect(a.progress).toBe('部分回款')
    expect(a.paymentStatus).toBe('部分回款')
    const b = rows.find((r) => r.projectId === 'B')!
    expect(b.stage).toBe('未指定')
    // B: nodes 2节点 expected=1_000_000, actual=流水100万, ratio=1
    expect(b.paymentRatio).toBeCloseTo(1, 4)
    expect(b.progress).toBe('已全额回款')
  })

  it('contract/actualTotal/paymentRatio 缺失按 0/null', () => {
    const rows = projectPaymentRows([proj({ projectId: 'X', paymentPmis: null })], {})
    expect(rows[0]).toMatchObject({ contract: 0, actualTotal: 0, paymentRatio: null, tier: '未知', progress: '未知' })
  })

  it('summaryByDim rate=已回/合同(Σactual/Σcontract)，加 remainingSum，按合同Σ降序', () => {
    const rows = projectPaymentRows(ps, map, payNodes, payRec)
    const s = summaryByDim(rows, 'dept')
    expect(s).toHaveLength(1)
    // actualSum=2_000_000, contractSum=2_000_000+1_000_000=3_000_000, rate=2_000_000/3_000_000
    expect(s[0]).toMatchObject({ value: '组1', projectCount: 2, contractSum: 3_000_000, actualSum: 2_000_000, delayedNodeSum: 1 })
    expect(s[0].rate).toBeCloseTo(2_000_000 / 3_000_000, 6)
    // remainingSum: A=unpaid之和=500_000+150_000+200_000=850_000, B=0
    expect(s[0].remainingSum).toBeCloseTo(850_000, 0)
  })

  it('summaryByDim 分母(contractSum) 0 → rate null；contract>0 时 rate=actual/contract（即使 expected=0）', () => {
    // 无 nodes → expectedTotal=0, actualSum=0; contract=500_000>0 → rate=0/500_000=0（不再 null）
    const rows = projectPaymentRows([proj({ projectId: 'Z', orgL4: '组9', paymentPmis: pm({ contract: 500_000 }) })], {})
    expect(summaryByDim(rows, 'dept')[0].rate).toBeCloseTo(0)
    // contract=0 → contractSum=0 → rate null
    const rows0 = projectPaymentRows([proj({ projectId: 'Y', orgL4: '组10', paymentPmis: pm({ contract: 0 }) })], {})
    expect(summaryByDim(rows0, 'dept')[0].rate).toBeNull()
  })

  it('区间收窄：节点/计划随区间，已回款/完成率恒全时', () => {
    // 只取 2026-01 区间：节点侧(nodeCount/expectedTotal)按 planDate∈区间；已回款/完成率恒全时(全站统一口径)
    const rows = projectPaymentRows(ps, map, payNodes, payRec, '2026-01-01', '2026-01-31')
    const a = rows.find((r) => r.projectId === 'A')!
    // A 节点侧 2026-01：nodes[0] expected=1_000_000；已回款=全时流水100万；contract=2_000_000
    expect(a.nodeCount).toBe(1)
    expect(a.expectedTotal).toBe(1_000_000)
    expect(a.actualTotal).toBe(1_000_000)
    expect(a.paymentRatio).toBeCloseTo(1_000_000 / 2_000_000, 4)
    const b = rows.find((r) => r.projectId === 'B')!
    // B 节点侧 2026-01：nodes[0] expected=500_000（计划随区间）
    expect(b.nodeCount).toBe(1)
    expect(b.expectedTotal).toBe(500_000)
    // 已回款恒全时：B 流水100万到账2026-02-05 虽在所选区间外，仍全额计入 → actualTotal=1_000_000（原区间口径=0）
    expect(b.actualTotal).toBe(1_000_000)
    // 完成率恒全时 = 全时流水/合同 = 1_000_000/1_000_000 = 1（原区间口径=0）
    expect(b.paymentRatio).toBeCloseTo(1, 4)
  })

  it('全部不变式：全部模式 actualTotal=Σ流水，summaryByDim.rate=Σactual/Σcontract', () => {
    const rows = projectPaymentRows(ps, map, payNodes, payRec, '', '')
    // actualTotal 等于流水之和
    const a = rows.find((r) => r.projectId === 'A')!
    const b = rows.find((r) => r.projectId === 'B')!
    expect(a.actualTotal).toBe(1_000_000)
    expect(b.actualTotal).toBe(1_000_000)
    const s = summaryByDim(rows, 'dept')
    const conSum = a.contract + b.contract  // 2_000_000 + 1_000_000 = 3_000_000
    const actSum = a.actualTotal + b.actualTotal
    expect(s[0].rate).toBeCloseTo(actSum / conSum, 6)
  })

  it('projectPaymentRows 行含 delayedAmount=Σ延期节点未收(全部模式)', () => {
    const rows = projectPaymentRows(ps, map, payNodes, payRec)
    // A: nodesA 中 终验(延期,unpaidAmount=150_000) → delayedAmount=150_000
    const a = rows.find((r) => r.projectId === 'A')!
    expect(a.delayedAmount).toBe(150_000)
    // B: nodesB 中无延期节点 → delayedAmount=0
    const b = rows.find((r) => r.projectId === 'B')!
    expect(b.delayedAmount).toBe(0)
  })

  it('summaryByDim 新增 nodeSum/reachedSum/delayedProjectCount/delayedAmountSum', () => {
    const rows = projectPaymentRows(ps, map, payNodes, payRec)
    const s = summaryByDim(rows, 'dept')[0]
    // A: nodeCount=3, reachedCount=1, delayedCount=1; B: nodeCount=2, reachedCount=2, delayedCount=0
    expect(s.nodeSum).toBe(5)
    expect(s.reachedSum).toBe(3)
    // delayedProjectCount: 有延期节点(delayedCount>0)的项目数 → A有1，B没有 → 1
    expect(s.delayedProjectCount).toBe(1)
    expect(s.delayedAmountSum).toBe(150_000)
  })

  it('全部不变式:summaryByDim 新字段=全量口径', () => {
    const rows = projectPaymentRows(ps, map, payNodes, payRec, '', '')
    const s = summaryByDim(rows, 'dept')[0]
    // nodeSum = Σ行 nodeCount
    const totalNodeSum = rows.reduce((acc, r) => acc + r.nodeCount, 0)
    expect(s.nodeSum).toBe(totalNodeSum)
    // reachedSum = Σ行 reachedCount
    const totalReachedSum = rows.reduce((acc, r) => acc + r.reachedCount, 0)
    expect(s.reachedSum).toBe(totalReachedSum)
    // delayedProjectCount = count(行中 delayedCount>0)
    const totalDelayedProjectCount = rows.filter((r) => r.delayedCount > 0).length
    expect(s.delayedProjectCount).toBe(totalDelayedProjectCount)
    // delayedAmountSum = Σ行 delayedAmount；fixture 中 A 延期节点 unpaidAmount=150_000 → 非零有判别力
    const totalDelayedAmountSum = rows.reduce((acc, r) => acc + (r.delayedAmount ?? 0), 0)
    expect(s.delayedAmountSum).toBe(totalDelayedAmountSum)
    expect(s.delayedAmountSum).toBeGreaterThan(0)
  })
})

describe('projectPaymentRows projectLevel（3E，供 /payment/projects 表格化用）', () => {
  it('取 pmisMap[pid].status.项目级别；缺失/空 → \'-\'', () => {
    const rows = projectPaymentRows(
      [proj({ projectId: 'A' }), proj({ projectId: 'B' })],
      { A: { status: { 项目级别: 'P1' } } as ProjectPmis },
    )
    expect(rows.find((r) => r.projectId === 'A')!.projectLevel).toBe('P1')
    expect(rows.find((r) => r.projectId === 'B')!.projectLevel).toBe('-')
  })
})

describe('paymentNodeRows（扁平化 + 维度 join 到所属项目）', () => {
  const projects = [
    proj({ projectId: 'A', projectName: '甲', orgL4: '组1',
      payment: { relatedNodeCount: 2, expectedTotal: 2_000_000, actualTotal: 1_000_000, remainingTotal: 1_000_000, paymentRatio: 0.5, delayedCount: 1 },
      paymentPmis: pm({ contract: 2_000_000 }) }),
  ]
  const pmisMap: Record<string, ProjectPmis> = { A: { progress: { 项目阶段: '实施' } } as ProjectPmis }
  const nodes: Record<string, PaymentNodePmis[]> = {
    A: [
      { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.7, expectedPayment: 1_400_000, reached: true, status: '已回款' },
      { stage: '终验', planDate: '2026-03-01', actualDate: '', payRatio: 0.3, expectedPayment: 600_000, reached: false, status: '延期' },
    ],
    GHOST: [{ stage: '到货', status: '待回款' } as PaymentNodePmis],
  }
  it('仅在册项目的节点入表，带 dept/projStage/tier/progress', () => {
    const rows = paymentNodeRows(nodes, projects, pmisMap)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ projectId: 'A', projectName: '甲', stage: '到货', status: '已回款', dept: '组1', projStage: '实施', tier: '100万以上', progress: '部分回款' })
    expect(rows.every((r) => r.projectId === 'A')).toBe(true)
  })
  it('paymentNodes 缺失 → 空数组', () => {
    expect(paymentNodeRows(undefined, projects, pmisMap)).toEqual([])
  })
})

describe('nodeSummary（节点三态计数 + 计划回款Σ）', () => {
  it('按 status 计数，expectedTotal 求和', () => {
    const projects = [proj({ projectId: 'A', orgL4: '测试组', paymentPmis: pm({ contract: 100 }) })]
    const nodes: Record<string, PaymentNodePmis[]> = {
      A: [
        { stage: '到货', status: '已回款', expectedPayment: 70 } as PaymentNodePmis,
        { stage: '终验', status: '延期', expectedPayment: 30 } as PaymentNodePmis,
        { stage: '驻场', status: '待回款', expectedPayment: 10 } as PaymentNodePmis,
        { stage: '阶段', status: '部分回款', expectedPayment: 5 } as PaymentNodePmis,
        { stage: '质保', status: '质保期', expectedPayment: 5 } as PaymentNodePmis,
      ],
    }
    const s = nodeSummary(paymentNodeRows(nodes, projects, {}))
    expect(s).toEqual({ total: 5, reached: 1, delayed: 1, pending: 3, expectedTotal: 120 })
  })
})

describe('progressBuckets（3 互斥桶，未知单列计数）', () => {
  it('已全额/部分/未回款三桶按固定序，未知不入桶', () => {
    // 提供 nodes/records 使 paymentPmisInRange 算出正确 ratio
    // B: expectedPayment=80 ≠ contract=100，确保 rate=actual/expectedSum(40/80=0.5) 与
    //    回退口径 rate=actual/contractSum(40/100=0.4) 数值不同，有判别力
    const bkNodes: Record<string, PaymentNodePmis[]> = {
      A: [{ stage: '到货', planDate: '2026-01-01', expectedPayment: 100, unpaidAmount: 0, reached: true, status: '已回款' } as PaymentNodePmis],
      B: [{ stage: '到货', planDate: '2026-01-01', expectedPayment: 80, unpaidAmount: 40, reached: false, status: '部分回款' } as PaymentNodePmis],
      C: [{ stage: '到货', planDate: '2026-01-01', expectedPayment: 100, unpaidAmount: 100, reached: false, status: '待回款' } as PaymentNodePmis],
    }
    const bkRec: Record<string, PaymentRecordsEntry> = {
      A: { records: [{ amount: 100, date: '2026-01-05' } as any] },
      B: { records: [{ amount: 40, date: '2026-01-05' } as any] },
      C: { records: [] },
    }
    const rows = projectPaymentRows([
      proj({ projectId: 'A', orgL4: '组1', paymentPmis: pm({ contract: 100 }) }),
      proj({ projectId: 'B', orgL4: '组1', paymentPmis: pm({ contract: 100 }) }),
      proj({ projectId: 'C', orgL4: '组1', paymentPmis: pm({ contract: 100 }) }),
      proj({ projectId: 'D', orgL4: '组1', paymentPmis: pm({ contract: 0 }) }),
    ], {}, bkNodes, bkRec)
    const { buckets, unknown } = progressBuckets(rows)
    expect(buckets.map((b) => b.key)).toEqual(['已全额回款', '部分回款', '未回款'])
    expect(buckets.map((b) => b.projectCount)).toEqual([1, 1, 1])
    // rate = 已回/合同(contractSum)，B: actual=40, contractSum=100 → rate=40/100=0.4
    expect(buckets[1].rate).toBeCloseTo(40 / 100, 6)
    expect(buckets[1].expectedSum).toBe(80)
    // C: actualSum=0, contractSum=100 → rate=0
    expect(buckets[2].rate).toBeCloseTo(0 / 100, 6)
    expect(unknown).toBe(1)
  })
})

describe('pmisRiskGroups（PMIS 风险三类）', () => {
  const projects = [
    proj({ projectId: 'A', projectName: '甲', orgL4: '组1', overspendAmount: 8000,
      paymentPmis: pm({ contract: 3_000_000 }) }),
    proj({ projectId: 'B', projectName: '乙', orgL4: '组2', overspendAmount: 0,
      paymentPmis: pm({ contract: 1_000_000 }) }),
    proj({ projectId: 'C', projectName: '丙', orgL4: '组3', overspendAmount: 3000,
      paymentPmis: pm({ contract: 500_000 }) }),
  ]
  // paymentNodes 同时给 paymentNodeRows 和 projectPaymentRows 用
  const riskNodes: Record<string, PaymentNodePmis[]> = {
    // A: 1个延期节点，expected=3_000_000，B: 1个延期节点，expected=1_000_000
    A: [{ stage: '终验', planDate: '2026-05-01', status: '延期', expectedPayment: 3_000_000, unpaidAmount: 2_700_000, reached: false } as PaymentNodePmis],
    B: [{ stage: '到货', planDate: '2026-02-01', status: '延期', expectedPayment: 1_000_000, unpaidAmount: 100_000, reached: true } as PaymentNodePmis],
    C: [{ stage: '验收', planDate: '2026-03-01', status: '待回款', expectedPayment: 500_000, unpaidAmount: 500_000, reached: false } as PaymentNodePmis],
  }
  // 流水：A 300_000/3_000_000=0.1<0.3 → lowPayment; B 900_000/1_000_000=0.9≥0.3 → 不入; C 0→0<0.3 → lowPayment
  const riskRec: Record<string, PaymentRecordsEntry> = {
    A: { records: [{ amount: 300_000, date: '2026-01-01' } as any] },
    B: { records: [{ amount: 900_000, date: '2026-02-01' } as any] },
    C: { records: [] },
  }
  it('延期节点按 planDate 升序；低回款<0.3 且 contract>0 按 contract 降序 Top10；超支>0 按金额降序', () => {
    const rows = projectPaymentRows(projects, {}, riskNodes, riskRec)
    const g = pmisRiskGroups(rows, paymentNodeRows(riskNodes, projects, {}))
    expect(g.delayedNodes.map((n) => n.projectId)).toEqual(['B', 'A'])
    // A: ratio=300_000/3_000_000=0.1<0.3 ✓; B: 0.9≥0.3; C: 0<0.3 ✓ → [A,C] by contract desc
    expect(g.lowPayment.map((r) => r.projectId)).toEqual(['A', 'C'])
    expect(g.overspend.map((r) => r.projectId)).toEqual(['A', 'C'])
    expect(g.overspend.map((r) => r.overspendAmount)).toEqual([8000, 3000])
  })
})

describe('paymentNodeRows 金额与经理字段(3B)', () => {
  it('节点行带 receivedAmount/unpaidAmount/projectManager', () => {
    const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组',
      paymentPmis: { contract: 2000000 } }] as any
    const paymentNodes = { P1: [
      { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.7, expectedPayment: 700000,
        receivedAmount: 300000, unpaidAmount: 400000, status: '部分回款' },
    ] } as any
    const rows = paymentNodeRows(paymentNodes, projects)
    expect(rows[0].receivedAmount).toBe(300000)
    expect(rows[0].unpaidAmount).toBe(400000)
    expect(rows[0].projectManager).toBe('张三')
  })
})

describe('paymentNodeRows actualRatio(3C)', () => {
  it('节点行带 actualRatio', () => {
    const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: 'A', paymentPmis: { contract: 100 } }] as any
    const paymentNodes = { P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.7,
      expectedPayment: 100, receivedAmount: 60, unpaidAmount: 40, actualRatio: 0.6, status: '部分回款' }] } as any
    expect(paymentNodeRows(paymentNodes, projects)[0].actualRatio).toBe(0.6)
  })
})

describe('paymentNodeRows orgL3_1(3D)', () => {
  it('节点行带 orgL3_1(取自 project)', () => {
    const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: 'A', orgL3_1: '三部一组', paymentPmis: { contract: 100 } }] as any
    const paymentNodes = { P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.7, actualRatio: 0, expectedPayment: 100, receivedAmount: 0, unpaidAmount: 100, status: '待回款' }] } as any
    expect(paymentNodeRows(paymentNodes, projects)[0].orgL3_1).toBe('三部一组')
  })
})

describe('paymentNodeRows 硬排除（orgL4 空）', () => {
  it('paymentNodeRows 跳过 orgL4 空项目', () => {
    const projects = [{ projectId: 'X', projectName: '空', orgL4: '' } as any]
    const nodes = { X: [{ stage: '阶段1', planDate: '2026-01-01', expectedPayment: 100, receivedAmount: 0, unpaidAmount: 100, status: '待回款' } as any] }
    expect(paymentNodeRows(nodes, projects).length).toBe(0)
  })
})

describe('l4SummaryRow 回款数据表总计', () => {
  const mk = (o: Partial<DimSummary>): DimSummary => ({
    value: 'X', projectCount: 0, contractSum: 0, actualSum: 0, rate: null,
    delayedNodeSum: 0, remainingSum: 0, nodeSum: 0, reachedSum: 0,
    delayedProjectCount: 0, delayedAmountSum: 0, ...o,
  })

  it('计数/金额列求和，比率列按口径重算(非百分比相加)', () => {
    const rows: DimSummary[] = [
      mk({ value: 'A', projectCount: 2, contractSum: 1_000_000, actualSum: 600_000, rate: 0.6, delayedNodeSum: 1, nodeSum: 4, reachedSum: 2, delayedProjectCount: 1, delayedAmountSum: 50_000 }),
      mk({ value: 'B', projectCount: 3, contractSum: 3_000_000, actualSum: 900_000, rate: 0.3, delayedNodeSum: 2, nodeSum: 6, reachedSum: 3, delayedProjectCount: 2, delayedAmountSum: 150_000 }),
    ]
    const t = l4SummaryRow(rows)
    expect(t.projectCount).toBe(5)
    expect(t.contractSum).toBe(4_000_000)
    expect(t.actualSum).toBe(1_500_000)
    expect(t.rate).toBeCloseTo(0.375)          // 1_500_000/4_000_000，不是 0.6+0.3
    expect(t.delayedProjectCount).toBe(3)
    expect(t.delayedNodeSum).toBe(3)
    expect(t.delayedAmountSum).toBe(200_000)
    expect(t.nodeSum).toBe(10)
    expect(t.reachedSum).toBe(5)
    expect(t.reachedRatio).toBeCloseTo(0.5)     // 5/10
  })

  it('分母为 0 时比率为 null', () => {
    const t = l4SummaryRow([mk({ contractSum: 0, actualSum: 0, nodeSum: 0, reachedSum: 0 })])
    expect(t.rate).toBeNull()
    expect(t.reachedRatio).toBeNull()
  })

  it('空输入 → 全 0、两比率 null', () => {
    const t = l4SummaryRow([])
    expect(t.contractSum).toBe(0)
    expect(t.projectCount).toBe(0)
    expect(t.rate).toBeNull()
    expect(t.reachedRatio).toBeNull()
  })
})
