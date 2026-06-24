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

  it('映射 top1000/quadrant(缺省→否/未指定)', () => {
    const ps = [
      { projectId: 'T1', projectName: 't1', orgL4: '组', projectManager: '甲', top1000: '是', quadrant: 'M1 战略核心区' },
      { projectId: 'T2', projectName: 't2', orgL4: '组', projectManager: '乙' },
    ] as unknown as Project[]
    const [a, b] = buildRiskRows(ps, {})
    expect(a.top1000).toBe('是')
    expect(a.quadrant).toBe('M1 战略核心区')
    expect(b.top1000).toBe('否')
    expect(b.quadrant).toBe('未指定')
  })

  it('新增项目维度 + 风险大类/小类(仅未关闭,无风险→[无风险])', () => {
    const rec = (lvl: string, status: string, major: string, minor: string) => ({ 风险等级: lvl, 风险状态: status, 风险大类: major, 风险小类: minor })
    const projects = [
      { projectId: 'A', projectName: 'a', orgL4: '组', projectManager: '甲', health: { overall: '风险' } },
      { projectId: 'B', projectName: 'b', orgL4: '组', projectManager: '乙' },
    ] as unknown as Project[]
    const pmisMap = {
      A: { status: { 项目级别: 'P1', 项目状态: '实施中' }, progress: { 项目阶段: '执行' }, customer: {},
           riskRecords: [rec('高', '已识别', '客户侧风险', '其它'), rec('中', '已识别', '成本超支风险', ''), rec('低', '已关闭', '质量风险', 'x')] },
      B: { status: {}, progress: {}, customer: {}, riskRecords: [] },
    } as unknown as Record<string, ProjectPmis>
    const [a, b] = buildRiskRows(projects, pmisMap)
    expect(a.projectStatus).toBe('实施中')
    expect(a.stage).toBe('执行')
    expect(a.health).toBe('风险')
    expect([...a.riskMajorCats].sort()).toEqual(['客户侧风险', '成本超支风险'])  // 已关闭的质量风险被排除
    expect(a.riskMinorCats).toEqual(['其它'])                                   // 仅非空去重(成本超支的小类空被滤)
    expect(b.health).toBe('无数据')
    expect(b.riskMajorCats).toEqual(['无风险'])  // 无未关闭风险
    expect(b.riskMinorCats).toEqual(['无风险'])
  })

  it('有未关闭风险但大类/小类全空 → [未分类]', () => {
    const projects = [{ projectId: 'C', projectName: 'c', orgL4: '组', projectManager: '甲' }] as unknown as Project[]
    const pmisMap = {
      C: { status: {}, progress: {}, customer: {},
           riskRecords: [{ 风险等级: '中', 风险状态: '已识别', 风险大类: '', 风险小类: '  ' }] },
    } as unknown as Record<string, ProjectPmis>
    const [c] = buildRiskRows(projects, pmisMap)
    expect(c.riskMajorCats).toEqual(['未分类'])
    expect(c.riskMinorCats).toEqual(['未分类'])
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

import { RISK_DIMENSIONS, RISK_METRICS, groupRisk, groupRiskDims, riskPivot } from './riskBoard'

const RR = [
  { orgL4: '一组', riskLevel: '高', openRisks: 2, contractAmount: 100 },
  { orgL4: '一组', riskLevel: '无风险', openRisks: 0, contractAmount: 200 },
  { orgL4: '二组', riskLevel: '中', openRisks: 1, contractAmount: 300 },
] as any

describe('风险契约面/聚合', () => {
  it('维度与统计清单', () => {
    expect(RISK_DIMENSIONS.map((d) => d.key)).toEqual([
      'riskLevel', 'riskMajorCats', 'riskMinorCats',
      'orgL4', 'projectLevel', 'manager', 'industry', 'top1000', 'quadrant', 'projectStatus', 'stage', 'health',
    ])
    expect(RISK_METRICS.map((m) => m.key)).toEqual(['projectCount', 'hasRiskCount', 'openRiskSum', 'contractAmount'])
  })
  it('groupRisk 按维分桶算统计,默认项目数降序', () => {
    const gs = groupRisk(RR, 'orgL4')
    expect(gs.map((g) => g.key)).toEqual(['一组', '二组'])   // 2 > 1
    const g1 = gs.find((g) => g.key === '一组')!
    expect(g1).toMatchObject({ projectCount: 2, hasRiskCount: 1, openRiskSum: 2, contractAmount: 300 })
  })
})

const MR = [
  { projectId: 'A', riskLevel: '高', openRisks: 2, contractAmount: 100, orgL4: '一组', riskMajorCats: ['客户侧风险', '成本超支风险'] },
  { projectId: 'B', riskLevel: '中', openRisks: 1, contractAmount: 200, orgL4: '一组', riskMajorCats: ['客户侧风险'] },
  { projectId: 'C', riskLevel: '无风险', openRisks: 0, contractAmount: 300, orgL4: '二组', riskMajorCats: ['无风险'] },
] as any

describe('多值炸开 groupRiskDims / riskPivot', () => {
  it('多值维 riskMajorCats 炸开:项目跨桶重复,∑>总数', () => {
    const gs = groupRiskDims(MR, ['riskMajorCats'])
    const m = Object.fromEntries(gs.map((g) => [g.key, g.projectCount]))
    expect(m['客户侧风险']).toBe(2)   // A,B
    expect(m['成本超支风险']).toBe(1) // A
    expect(m['无风险']).toBe(1)       // C
    expect(gs.reduce((s, g) => s + g.projectCount, 0)).toBe(4)  // >3 总数
  })
  it('单值维 orgL4 零回归:∑=总数', () => {
    const gs = groupRiskDims(MR, ['orgL4'])
    expect(gs.reduce((s, g) => s + g.projectCount, 0)).toBe(3)
  })
  it('riskPivot 行 orgL4 × 列 riskLevel,index 留桶供下钻', () => {
    const p = riskPivot(MR, ['orgL4'], ['riskLevel'], 'projectCount')
    expect(p.rows.map((r) => r.key)).toContain('一组')
    expect(p.index['一组']?.['高']?.rows.map((r: any) => r.projectId)).toEqual(['A'])
  })
})
