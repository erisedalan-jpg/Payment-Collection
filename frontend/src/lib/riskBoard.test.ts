import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import { projectRiskLevel, openRiskCount, buildRiskRows, riskSummary } from './riskBoard'

const rec = (lvl: string, status: string) => ({ 风险等级: lvl, 风险状态: status })

describe('projectRiskLevel / openRiskCount', () => {
  it('未关闭记录取最高等级', () => {
    const pmis = { riskRecords: [rec('中', '处理中'), rec('高', '未关闭')] } as unknown as ProjectPmis
    expect(projectRiskLevel(pmis)).toBe('高')
    expect(openRiskCount(pmis)).toBe(2)
  })
  it('忽略已关闭记录:仅未关闭的中→中', () => {
    const pmis = { riskRecords: [rec('高', '已关闭'), rec('中', '跟进中')] } as unknown as ProjectPmis
    expect(projectRiskLevel(pmis)).toBe('中')
    expect(openRiskCount(pmis)).toBe(1)
  })
  it('全部已关闭 → 无风险, openRiskCount=0', () => {
    const pmis = { riskRecords: [rec('高', '已关闭')] } as unknown as ProjectPmis
    expect(projectRiskLevel(pmis)).toBe('无风险')
    expect(openRiskCount(pmis)).toBe(0)
  })
  it('无记录/未定义 → 无风险', () => {
    expect(projectRiskLevel(undefined)).toBe('无风险')
    expect(projectRiskLevel({ riskRecords: [] } as unknown as ProjectPmis)).toBe('无风险')
  })
  it('未关闭但等级空 → 无风险(有未关闭记录但不分级)', () => {
    const pmis = { riskRecords: [rec('', '未关闭')] } as unknown as ProjectPmis
    expect(projectRiskLevel(pmis)).toBe('无风险')
    expect(openRiskCount(pmis)).toBe(1)
  })
})

describe('buildRiskRows', () => {
  const projects = [
    { projectId: 'P1', projectName: '甲', orgL4: '交付一组', projectManager: '张三' },
    { projectId: 'P2', projectName: '乙', orgL4: '', projectManager: '' },
  ] as unknown as Project[]
  const pmisMap = {
    P1: { status: { 项目级别: 'A级' }, customer: { 行业: '金融', 合同总额: 2000000 },
          riskRecords: [rec('高', '未关闭')] },
    P2: { status: {}, customer: {}, riskRecords: [] },
  } as unknown as Record<string, ProjectPmis>

  it('字段映射与缺省归一,含异常项目(orgL4 空)', () => {
    const rows = buildRiskRows(projects, pmisMap)
    expect(rows).toHaveLength(2)
    const [a, b] = rows
    expect(a).toMatchObject({ projectId: 'P1', orgL4: '交付一组', projectLevel: 'A级',
      manager: '张三', industry: '金融', riskLevel: '高', openRisks: 1, contractAmount: 2000000 })
    expect(b).toMatchObject({ projectId: 'P2', orgL4: '未指定', projectLevel: '未指定',
      manager: '未指定', industry: '未指定', riskLevel: '无风险', openRisks: 0, contractAmount: 0 })
  })
})

describe('riskSummary', () => {
  it('四类互斥分区与健康度/有风险', () => {
    const rows = [
      { riskLevel: '高' }, { riskLevel: '高' }, { riskLevel: '中' },
      { riskLevel: '低' }, { riskLevel: '无风险' }, { riskLevel: '无风险' },
    ] as any
    const s = riskSummary(rows)
    expect(s).toMatchObject({ total: 6, noRisk: 2, high: 2, mid: 1, low: 1, hasRisk: 4 })
    expect(s.healthPct).toBeCloseTo(2 / 6)
    expect(s.total).toBe(s.noRisk + s.high + s.mid + s.low)
  })
  it('空列表 healthPct=null', () => {
    expect(riskSummary([]).healthPct).toBeNull()
  })
})

import { RISK_DIMENSIONS, RISK_METRICS, groupRisk, riskOverview } from './riskBoard'

const RR = [
  { orgL4: '一组', riskLevel: '高', openRisks: 2, contractAmount: 100 },
  { orgL4: '一组', riskLevel: '无风险', openRisks: 0, contractAmount: 200 },
  { orgL4: '二组', riskLevel: '中', openRisks: 1, contractAmount: 300 },
] as any

describe('风险契约面/聚合', () => {
  it('维度与统计清单', () => {
    expect(RISK_DIMENSIONS.map((d) => d.key)).toEqual(['riskLevel', 'orgL4', 'projectLevel', 'manager', 'industry'])
    expect(RISK_METRICS.map((m) => m.key)).toEqual(['projectCount', 'hasRiskCount', 'openRiskSum', 'contractAmount'])
  })
  it('groupRisk 按维分桶算统计,默认项目数降序', () => {
    const gs = groupRisk(RR, 'orgL4')
    expect(gs.map((g) => g.key)).toEqual(['一组', '二组'])   // 2 > 1
    const g1 = gs.find((g) => g.key === '一组')!
    expect(g1).toMatchObject({ projectCount: 2, hasRiskCount: 1, openRiskSum: 2, contractAmount: 300 })
  })
  it('riskOverview 四类计数 + total + healthPct, 按 total 降序', () => {
    const ov = groupRisk.length && riskOverview(RR, 'orgL4')
    expect(ov.map((r) => r.key)).toEqual(['一组', '二组'])
    const o1 = ov.find((r) => r.key === '一组')!
    expect(o1).toMatchObject({ 高: 1, 中: 0, 低: 0, 无风险: 1, total: 2 })
    expect(o1.healthPct).toBeCloseTo(0.5)
    const o2 = ov.find((r) => r.key === '二组')!
    expect(o2.healthPct).toBeCloseTo(0)   // 无 无风险
  })
})
