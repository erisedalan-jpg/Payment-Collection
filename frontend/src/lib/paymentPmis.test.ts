import { describe, it, expect } from 'vitest'
import type { Project, ProjectPaymentPmis, ProjectPmis, PaymentNodePmis } from '@/types/analysis'
import {
  TIER_HIGH, TIER_MID, deriveTier, deriveProgress, deriveDept, deriveStage,
  rateColorPmis, PAY_FACET_DIMS, filterProjects, projectPaymentRows, summaryByDim,
  paymentNodeRows, nodeSummary, progressBuckets, pmisRiskGroups,
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
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 0.999 }))).toBe('已全额回款')
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 1 }))).toBe('已全额回款')
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 1.05 }))).toBe('已全额回款')
  })
  it('0<ratio<0.999 → 部分回款', () => {
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 0.5 }))).toBe('部分回款')
  })
  it('ratio==0 或 null 且 contract>0 → 未回款', () => {
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 0 }))).toBe('未回款')
    expect(deriveProgress(pm({ contract: 100, paymentRatio: null }))).toBe('未回款')
  })
  it('无合同 / 无 pmis → 未知', () => {
    expect(deriveProgress(pm({ contract: null, paymentRatio: null }))).toBe('未知')
    expect(deriveProgress(pm({ contract: 0, paymentRatio: 0 }))).toBe('未知')
    expect(deriveProgress(null)).toBe('未知')
    expect(deriveProgress(undefined)).toBe('未知')
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
})

describe('projectPaymentRows / summaryByDim', () => {
  const ps = [
    proj({ projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1',
      overspendAmount: 0, paymentPmis: pm({ contract: 2_000_000, actualTotal: 1_000_000, paymentRatio: 0.5, expectedTotal: 1_500_000, nodeCount: 3, reachedCount: 1, delayedCount: 1, fromOrigin: false }) }),
    proj({ projectId: 'B', projectName: '乙', projectManager: '李四', orgL4: '组1',
      overspendAmount: 5000, paymentPmis: pm({ contract: 1_000_000, actualTotal: 1_000_000, paymentRatio: 1, expectedTotal: 1_000_000, nodeCount: 2, reachedCount: 2, delayedCount: 0, fromOrigin: true }) }),
  ]
  const map: Record<string, ProjectPmis> = { A: { progress: { 项目阶段: '实施' } } as ProjectPmis }
  it('行字段映射齐全（含派生维度与下钻兼容列）', () => {
    const rows = projectPaymentRows(ps, map)
    const a = rows.find((r) => r.projectId === 'A')!
    expect(a).toMatchObject({
      projectName: '甲', projectManager: '张三', dept: '组1', stage: '实施',
      tier: '100万以上', progress: '部分回款', contract: 2_000_000, actualTotal: 1_000_000,
      paymentRatio: 0.5, expectedTotal: 1_500_000, nodeCount: 3, reachedCount: 1, delayedCount: 1,
      fromOrigin: false, projectAmount: 2_000_000, paymentStatus: '部分回款', orgL4: '组1',
    })
    const b = rows.find((r) => r.projectId === 'B')!
    expect(b.stage).toBe('未指定')
    expect(b.progress).toBe('已全额回款')
  })
  it('contract/actualTotal/paymentRatio 缺失按 0/null', () => {
    const rows = projectPaymentRows([proj({ projectId: 'X', paymentPmis: null })], {})
    expect(rows[0]).toMatchObject({ contract: 0, actualTotal: 0, paymentRatio: null, tier: '未知', progress: '未知' })
  })
  it('summaryByDim 按 dept 加权完成率（Σ÷Σ，非单项目率平均），按合同Σ降序', () => {
    const rows = projectPaymentRows(ps, map)
    const s = summaryByDim(rows, 'dept')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ value: '组1', projectCount: 2, contractSum: 3_000_000, actualSum: 2_000_000, delayedNodeSum: 1 })
    expect(s[0].rate).toBeCloseTo(2_000_000 / 3_000_000, 6)
  })
  it('summaryByDim 分母 0 → rate null', () => {
    const rows = projectPaymentRows([proj({ projectId: 'Z', orgL4: '组9', paymentPmis: pm({ contract: 0 }) })], {})
    expect(summaryByDim(rows, 'dept')[0].rate).toBeNull()
  })
})

describe('paymentNodeRows（扁平化 + 维度 join 到所属项目）', () => {
  const projects = [
    proj({ projectId: 'A', projectName: '甲', orgL4: '组1', paymentPmis: pm({ contract: 2_000_000, paymentRatio: 0.5 }) }),
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
    const projects = [proj({ projectId: 'A', paymentPmis: pm({ contract: 100 }) })]
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
    const rows = projectPaymentRows([
      proj({ projectId: 'A', paymentPmis: pm({ contract: 100, paymentRatio: 1, actualTotal: 100 }) }),
      proj({ projectId: 'B', paymentPmis: pm({ contract: 100, paymentRatio: 0.5, actualTotal: 50 }) }),
      proj({ projectId: 'C', paymentPmis: pm({ contract: 100, paymentRatio: 0, actualTotal: 0 }) }),
      proj({ projectId: 'D', paymentPmis: pm({ contract: 0 }) }),
    ], {})
    const { buckets, unknown } = progressBuckets(rows)
    expect(buckets.map((b) => b.key)).toEqual(['已全额回款', '部分回款', '未回款'])
    expect(buckets.map((b) => b.projectCount)).toEqual([1, 1, 1])
    expect(buckets[1].rate).toBeCloseTo(0.5, 6)
    expect(unknown).toBe(1)
  })
})

describe('pmisRiskGroups（PMIS 风险三类）', () => {
  const projects = [
    proj({ projectId: 'A', projectName: '甲', orgL4: '组1', overspendAmount: 8000, paymentPmis: pm({ contract: 3_000_000, paymentRatio: 0.1, actualTotal: 300_000 }) }),
    proj({ projectId: 'B', projectName: '乙', orgL4: '组2', overspendAmount: 0, paymentPmis: pm({ contract: 1_000_000, paymentRatio: 0.9, actualTotal: 900_000 }) }),
    proj({ projectId: 'C', projectName: '丙', orgL4: '组3', overspendAmount: 3000, paymentPmis: pm({ contract: 500_000, paymentRatio: null, actualTotal: 0 }) }),
  ]
  const nodes: Record<string, PaymentNodePmis[]> = {
    A: [{ stage: '终验', planDate: '2026-05-01', status: '延期', expectedPayment: 100 } as PaymentNodePmis],
    B: [{ stage: '到货', planDate: '2026-02-01', status: '延期', expectedPayment: 50 } as PaymentNodePmis],
  }
  it('延期节点按 planDate 升序；低回款<0.3 且 contract>0 按 contract 降序 Top10；超支>0 按金额降序', () => {
    const rows = projectPaymentRows(projects, {})
    const g = pmisRiskGroups(rows, paymentNodeRows(nodes, projects, {}))
    expect(g.delayedNodes.map((n) => n.projectId)).toEqual(['B', 'A'])
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
