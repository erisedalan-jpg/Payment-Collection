import { describe, it, expect } from 'vitest'
import { riskReasons } from './riskReasons'
import type { Project, ProjectPmis } from '@/types/analysis'

// 最小健康项目：orgL4 非空，各指标正常
function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    projectId: 'P001',
    projectName: '测试项目',
    orgL4: '交付一组',
    payment: {
      delayedCount: 0,
      relatedNodeCount: 2,
      actualTotal: 100,
      remainingTotal: 50,
      expectedTotal: 150,
      paymentRatio: 0.67,
    },
    overspendAmount: 0,
    ...overrides,
  } as Project
}

// 最小 ProjectPmis：各维度正常
function basePmis(overrides: Partial<ProjectPmis> = {}): ProjectPmis {
  return {
    matched: true,
    progress: {
      里程碑进度状态: '正常',
    },
    cost: {
      消耗比: 0.8,
      项目超支: false,
    },
    risk: {
      未关闭风险数: 0,
    },
    ...overrides,
  } as unknown as ProjectPmis
}

describe('riskReasons — 数据异常短路', () => {
  it('orgL4 为空 → 仅返回 [数据异常]，不含其它', () => {
    const p = baseProject({ orgL4: '', payment: { delayedCount: 3, relatedNodeCount: 3, actualTotal: 0, remainingTotal: 100, expectedTotal: 100, paymentRatio: 0 } })
    const pmis = basePmis({ progress: { 里程碑进度状态: '滞后' }, cost: { 消耗比: 1.5, 项目超支: true }, risk: { 未关闭风险数: 2 } })
    const result = riskReasons(p, pmis)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('数据异常')
    expect(result[0].tone).toBe('mut')
  })

  it('orgL4 纯空白也短路', () => {
    const p = baseProject({ orgL4: '   ' })
    const result = riskReasons(p)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('数据异常')
  })
})

describe('riskReasons — 回款延期', () => {
  it('delayedCount > 0 命中回款延期', () => {
    const p = baseProject({ payment: { delayedCount: 3, relatedNodeCount: 3, actualTotal: 0, remainingTotal: 100, expectedTotal: 100, paymentRatio: 0 } })
    const result = riskReasons(p)
    expect(result.some((r) => r.category === '回款延期')).toBe(true)
    const r = result.find((r) => r.category === '回款延期')!
    expect(r.detail).toContain('3')
    expect(r.tone).toBe('warn')
  })

  it('delayedCount = 0 不命中回款延期', () => {
    const p = baseProject({ payment: { delayedCount: 0, relatedNodeCount: 2, actualTotal: 50, remainingTotal: 50, expectedTotal: 100, paymentRatio: 0.5 } })
    const result = riskReasons(p)
    expect(result.some((r) => r.category === '回款延期')).toBe(false)
  })

  it('payment 缺失（无节点项目）不命中回款延期', () => {
    const p = baseProject({ payment: undefined })
    const result = riskReasons(p)
    expect(result.some((r) => r.category === '回款延期')).toBe(false)
  })
})

describe('riskReasons — 里程碑滞后', () => {
  it('里程碑进度状态含「滞后」命中', () => {
    const pmis = basePmis({ progress: { 里程碑进度状态: '整体滞后' } })
    const result = riskReasons(baseProject(), pmis)
    expect(result.some((r) => r.category === '里程碑滞后')).toBe(true)
    expect(result.find((r) => r.category === '里程碑滞后')!.tone).toBe('warn')
  })

  it('里程碑进度状态含「延期」命中', () => {
    const pmis = basePmis({ progress: { 里程碑进度状态: '延期' } })
    const result = riskReasons(baseProject(), pmis)
    expect(result.some((r) => r.category === '里程碑滞后')).toBe(true)
  })

  it('里程碑进度状态含「超期」命中', () => {
    const pmis = basePmis({ progress: { 里程碑进度状态: '部分超期' } })
    const result = riskReasons(baseProject(), pmis)
    expect(result.some((r) => r.category === '里程碑滞后')).toBe(true)
  })

  it('里程碑进度状态为「正常」不命中', () => {
    const pmis = basePmis({ progress: { 里程碑进度状态: '正常' } })
    const result = riskReasons(baseProject(), pmis)
    expect(result.some((r) => r.category === '里程碑滞后')).toBe(false)
  })

  it('pmis 缺失时不命中里程碑滞后', () => {
    const result = riskReasons(baseProject())
    expect(result.some((r) => r.category === '里程碑滞后')).toBe(false)
  })
})

describe('riskReasons — 成本超支拆分', () => {
  it('overspendAmount > 0 命中总成本超支', () => {
    const p = baseProject({ overspendAmount: 12000 })
    const result = riskReasons(p)
    const r = result.find((x) => x.category === '总成本超支')
    expect(r).toBeTruthy()
    expect(r!.detail).toContain('1.2')
  })
  it('PMIS 项目超支 flag 命中总成本超支(无 overspendAmount 时)', () => {
    const p = baseProject({})
    const pmis = { cost: { 项目超支: true } } as any
    expect(riskReasons(p, pmis).some((x) => x.category === '总成本超支')).toBe(true)
  })
  it('cost.交付超支===true 命中交付成本超支', () => {
    const p = baseProject({})
    const pmis = { cost: { 交付超支: true } } as any
    expect(riskReasons(p, pmis).some((x) => x.category === '交付成本超支')).toBe(true)
  })
  it('总/交付可同时出现', () => {
    const p = baseProject({ overspendAmount: 5000 })
    const pmis = { cost: { 交付超支: true } } as any
    const cats = riskReasons(p, pmis).map((x) => x.category)
    expect(cats).toContain('总成本超支')
    expect(cats).toContain('交付成本超支')
  })

  it('overspendAmount ≤ 0、项目超支 false、消耗比 < 1 均不命中总成本超支', () => {
    const p = baseProject({ overspendAmount: 0 })
    const pmis = basePmis({ cost: { 项目超支: false, 消耗比: 0.8 } })
    const result = riskReasons(p, pmis)
    expect(result.some((r) => r.category === '总成本超支')).toBe(false)
  })
})

describe('riskReasons — 风险未闭环', () => {
  it('未关闭风险数 > 0 命中', () => {
    const pmis = basePmis({ risk: { 未关闭风险数: 2 } })
    const result = riskReasons(baseProject(), pmis)
    expect(result.some((r) => r.category === '风险未闭环')).toBe(true)
    const r = result.find((r) => r.category === '风险未闭环')!
    expect(r.detail).toContain('2')
    expect(r.tone).toBe('danger')
  })

  it('未关闭风险数 = 0 不命中', () => {
    const pmis = basePmis({ risk: { 未关闭风险数: 0 } })
    const result = riskReasons(baseProject(), pmis)
    expect(result.some((r) => r.category === '风险未闭环')).toBe(false)
  })

  it('未关闭风险数 = null 不命中', () => {
    const pmis = basePmis({ risk: { 未关闭风险数: null } })
    const result = riskReasons(baseProject(), pmis)
    expect(result.some((r) => r.category === '风险未闭环')).toBe(false)
  })
})

describe('riskReasons — 健康项目返回空数组', () => {
  it('各指标正常 → 返回空数组', () => {
    const p = baseProject()
    const pmis = basePmis()
    const result = riskReasons(p, pmis)
    expect(result).toHaveLength(0)
  })
})

describe('riskReasons — 组合：多类同时命中时顺序', () => {
  it('顺序为 回款延期→里程碑滞后→总成本超支→交付成本超支→风险未闭环', () => {
    const p = baseProject({
      payment: { delayedCount: 1, relatedNodeCount: 2, actualTotal: 0, remainingTotal: 100, expectedTotal: 100, paymentRatio: 0 },
      overspendAmount: 5000,
    })
    const pmis = basePmis({
      progress: { 里程碑进度状态: '延期' },
      cost: { 消耗比: 1.2, 项目超支: true, 交付超支: true },
      risk: { 未关闭风险数: 3 },
    })
    const result = riskReasons(p, pmis)
    const categories = result.map((r) => r.category)
    expect(categories).toContain('回款延期')
    expect(categories).toContain('里程碑滞后')
    expect(categories).toContain('总成本超支')
    expect(categories).toContain('交付成本超支')
    expect(categories).toContain('风险未闭环')
    // 顺序验证
    expect(categories.indexOf('回款延期')).toBeLessThan(categories.indexOf('里程碑滞后'))
    expect(categories.indexOf('里程碑滞后')).toBeLessThan(categories.indexOf('总成本超支'))
    expect(categories.indexOf('总成本超支')).toBeLessThan(categories.indexOf('交付成本超支'))
    expect(categories.indexOf('交付成本超支')).toBeLessThan(categories.indexOf('风险未闭环'))
  })
})
