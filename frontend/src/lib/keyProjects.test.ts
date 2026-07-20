import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import { isKeyProject, buildKeyProjectRows, buildProgressRowBase, followDate, followBy } from './keyProjects'

const proj = (over: Partial<Project> = {}): Project => ({
  projectId: 'P1', projectName: '甲', projectManager: '何平', orgL4: 'A组',
  isPresale: false, relatedClosedId: '', top1000: '是', customer: '某客户',
  paymentPmis: { contract: 2_000_000 } as any,
  payment: {} as any, deliveryCosts: [], health: {} as any, ...over,
} as Project)
const pmis = (over: Record<string, any> = {}): ProjectPmis => ({
  status: { 项目级别: 'P3' }, risk: { 最高等级: '中', 未关闭风险数: 2 },
  customer: { 最终客户: '某客户' }, team: { AR: 'AR张', SR: 'SR李' }, ...over,
} as unknown as ProjectPmis)

describe('isKeyProject', () => {
  it('top1000=是 且 合同>100万 → 入选', () => {
    expect(isKeyProject(proj({ top1000: '是', paymentPmis: { contract: 1_000_001 } as any }), pmis())).toBe(true)
  })
  it('top1000=是 且 合同<=100万 但级别P1 → 入选', () => {
    expect(isKeyProject(proj({ top1000: '是', paymentPmis: { contract: 500_000 } as any }), pmis({ status: { 项目级别: 'P1' } }))).toBe(true)
  })
  it('top1000=是 但 合同<=100万 且非P1 → 不入选', () => {
    expect(isKeyProject(proj({ top1000: '是', paymentPmis: { contract: 1_000_000 } as any }), pmis({ status: { 项目级别: 'P3' } }))).toBe(false)
  })
  it('top1000=否 即便合同大 → 不入选', () => {
    expect(isKeyProject(proj({ top1000: '否', paymentPmis: { contract: 9_000_000 } as any }), pmis())).toBe(false)
  })
  it('pmis 缺项(undefined):合同>100万 仍入选;合同<=100万 不入选(读不到P1)', () => {
    expect(isKeyProject(proj({ top1000: '是', paymentPmis: { contract: 1_000_001 } as any }), undefined)).toBe(true)
    expect(isKeyProject(proj({ top1000: '是', paymentPmis: { contract: 1_000_000 } as any }), undefined)).toBe(false)
  })
})

describe('buildKeyProjectRows', () => {
  it('拼行:列字段 + 合并进展 + 风险显示', () => {
    const current = { P1: { weekProgress: '本周X', weekProgressEditTime: '2026-06-24 10:00:00', weekProgressEditBy: 'u1' } }
    const [r] = buildKeyProjectRows([proj()], { P1: pmis() }, current)
    expect(r.projectId).toBe('P1')
    expect(r.customer).toBe('某客户')
    expect(r.ar).toBe('AR张')
    expect(r.sr).toBe('SR李')
    expect(r.contractWan).toBe(200)
    expect(r.riskLevel).toBe('中')
    expect(r.openRisks).toBe(2)
    expect(r.weekProgress).toBe('本周X')
    expect(r.followDate).toBe('2026-06-24 10:00:00')
    expect(r.followBy).toBe('u1')
  })
  it('只保留重点项目', () => {
    const rows = buildKeyProjectRows([proj({ projectId: 'A', top1000: '是' }), proj({ projectId: 'B', top1000: '否' })],
      { A: pmis(), B: pmis() }, {})
    expect(rows.map((r) => r.projectId)).toEqual(['A'])
  })
})

const mk = (top1000: string, contract: number | null, level: string) => ({
  p: { top1000, paymentPmis: { contract } } as any,
  pmis: { status: { 项目级别: level } } as any,
})

describe('isKeyProject 新口径: P1 || (TOP1000 && 合同>100万)', () => {
  it('P1 且非 TOP1000 → 入选(旧口径不入选)', () => {
    const { p, pmis: pm } = mk('否', 50_000, 'P1'); expect(isKeyProject(p, pm)).toBe(true)
  })
  it('TOP1000 且合同>100万且非 P1 → 入选', () => {
    const { p, pmis: pm } = mk('是', 2_000_000, 'P2'); expect(isKeyProject(p, pm)).toBe(true)
  })
  it('TOP1000 但合同<=100万且非 P1 → 不入选', () => {
    const { p, pmis: pm } = mk('是', 1_000_000, 'P2'); expect(isKeyProject(p, pm)).toBe(false)
  })
  it('非 TOP1000、非 P1、合同>100万 → 不入选', () => {
    const { p, pmis: pm } = mk('否', 5_000_000, 'P3'); expect(isKeyProject(p, pm)).toBe(false)
  })
})

describe('buildProgressRowBase 客户取 Project.customer(单一来源)', () => {
  it('读 p.customer(售前/非售前都一样,口径在后端算好)', () => {
    const p1 = { projectId: 'A', customer: '已算好的客户', paymentPmis: { contract: 0 } } as any
    expect(buildProgressRowBase(p1, {} as any, {}).customer).toBe('已算好的客户')
    const p2 = { projectId: 'B', customer: '', paymentPmis: { contract: 0 } } as any
    expect(buildProgressRowBase(p2, {} as any, {}).customer).toBe('-')   // 空 → '-'
  })
})

describe('followDate / followBy', () => {
  it('跟进日期取两格较大非空', () => {
    expect(followDate({ weekProgressEditTime: '2026-06-24 10:00:00', nextPlanEditTime: '2026-06-25 09:00:00' })).toBe('2026-06-25 09:00:00')
    expect(followDate({ weekProgressEditTime: '2026-06-24 10:00:00' })).toBe('2026-06-24 10:00:00')
    expect(followDate({})).toBe('')
  })
  it('跟进人去重并列', () => {
    expect(followBy({ weekProgressEditBy: 'u1', nextPlanEditBy: 'u1' })).toBe('u1')
    expect(followBy({ weekProgressEditBy: 'u1', nextPlanEditBy: 'u2' })).toBe('u1、u2')
    expect(followBy({ weekProgressEditBy: 'u1' })).toBe('u1')
    expect(followBy({})).toBe('')
  })
})

describe('buildProgressRowBase setupDate', () => {
  it('setupDate 取 st.立项日期(缺→null)', () => {
    const r = buildProgressRowBase(proj(), pmis({ status: { 项目级别: 'P3', 立项日期: '2020-03-19' } }), {})
    expect(r.setupDate).toBe('2020-03-19')
    expect(buildProgressRowBase(proj(), pmis(), {}).setupDate).toBeNull()
  })
})

describe('V4.0.1 终验两字段', () => {
  it('buildProgressRowBase 带出计划/实际终验时间', () => {
    const row = buildProgressRowBase(
      { projectId: 'P1' } as any,
      { progress: { 终验时间: '2026-07-01', 实际终验时间: '2026-07-15' } } as any,
      {} as any)
    expect(row.plannedFinalAcceptDate).toBe('2026-07-01')
    expect(row.actualFinalAcceptDate).toBe('2026-07-15')
  })

  it('实际未发生时为 null,不落成空串', () => {
    const row = buildProgressRowBase(
      { projectId: 'P1' } as any,
      { progress: { 终验时间: '2026-07-01', 实际终验时间: null } } as any,
      {} as any)
    expect(row.actualFinalAcceptDate).toBeNull()
  })

  it('pmis 整体缺失时两字段均为 null,不抛错', () => {
    const row = buildProgressRowBase({ projectId: 'P1' } as any, undefined, {} as any)
    expect(row.plannedFinalAcceptDate).toBeNull()
    expect(row.actualFinalAcceptDate).toBeNull()
  })
})
