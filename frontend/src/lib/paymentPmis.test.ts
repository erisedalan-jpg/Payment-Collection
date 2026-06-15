import { describe, it, expect } from 'vitest'
import type { Project, ProjectPaymentPmis, ProjectPmis } from '@/types/analysis'
import {
  TIER_HIGH, TIER_MID, deriveTier, deriveProgress, deriveDept, deriveStage,
  rateColorPmis, PAY_FACET_DIMS, filterProjects, projectPaymentRows, summaryByDim,
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
  const base = { viewMode: 'global' as const, viewL4: '', viewPM: '', naguanOn: false, naguanExclude: {} }
  it('global 全量', () => {
    expect(filterProjects(ps, base).map((p) => p.projectId)).toEqual(['A', 'B', 'C'])
  })
  it('l4 视角按 orgL4', () => {
    expect(filterProjects(ps, { ...base, viewMode: 'l4', viewL4: '组1' }).map((p) => p.projectId)).toEqual(['A', 'C'])
  })
  it('pm 视角按 projectManager', () => {
    expect(filterProjects(ps, { ...base, viewMode: 'pm', viewPM: '李四' }).map((p) => p.projectId)).toEqual(['B', 'C'])
  })
  it('纳管开启排除 naguanExclude', () => {
    expect(filterProjects(ps, { ...base, naguanOn: true, naguanExclude: { B: true } }).map((p) => p.projectId)).toEqual(['A', 'C'])
  })
  it('纳管关闭不排除', () => {
    expect(filterProjects(ps, { ...base, naguanOn: false, naguanExclude: { B: true } }).length).toBe(3)
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
