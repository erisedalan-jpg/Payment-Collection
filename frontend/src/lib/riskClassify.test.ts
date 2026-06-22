import { describe, it, expect } from 'vitest'
import type { RiskReason } from './riskReasons'
import { classifyProjects, type RiskClassEntry } from './riskClassify'

// 最小化输入行，与 InputRow 兼容
function makeRow(overrides: {
  projectId?: string
  projectName?: string
  health?: string
  isAnomalous?: boolean
  riskReasons?: RiskReason[]
}) {
  return {
    projectId: overrides.projectId ?? 'P001',
    projectName: overrides.projectName ?? '测试项目',
    health: overrides.health ?? '健康',
    isAnomalous: overrides.isAnomalous ?? false,
    riskReasons: overrides.riskReasons ?? [],
  }
}

describe('classifyProjects', () => {
  // 场景1：空输入
  it('空输入返回长度为 6 的数组，每类 count=0，projects=[]', () => {
    const result = classifyProjects([])
    expect(result).toHaveLength(6)
    for (const entry of result) {
      expect(entry.count).toBe(0)
      expect(entry.projects).toEqual([])
    }
  })

  // 场景2：顺序固定
  it('返回数组 category 顺序固定', () => {
    const result = classifyProjects([])
    const categories = result.map((e) => e.category)
    expect(categories).toEqual([
      '回款延期',
      '里程碑滞后',
      '成本超支',
      '风险未闭环',
      '数据异常',
      '健康度低',
    ])
  })

  // 场景3：回款延期命中
  it('回款延期命中：riskReasons 含回款延期时计入对应类', () => {
    const row = makeRow({
      projectId: 'P100',
      riskReasons: [{ category: '回款延期', detail: '2个延期节点', tone: 'warn' }],
    })
    const result = classifyProjects([row])
    const entry = result.find((e) => e.category === '回款延期')!
    expect(entry.count).toBe(1)
    expect(entry.projects[0].projectId).toBe('P100')
  })

  // 场景4：数据异常命中
  it('isAnomalous=true 且 riskReasons 含数据异常时计入数据异常类', () => {
    const row = makeRow({
      projectId: 'P200',
      isAnomalous: true,
      riskReasons: [{ category: '数据异常', detail: '服务组 L4 缺失', tone: 'mut' }],
    })
    const result = classifyProjects([row])
    const entry = result.find((e) => e.category === '数据异常')!
    expect(entry.count).toBe(1)
    expect(entry.projects[0].projectId).toBe('P200')
  })

  // 场景5：健康度低
  it('health="关注" 时健康度低 count=1', () => {
    const row = makeRow({ projectId: 'P301', health: '关注' })
    const result = classifyProjects([row])
    const entry = result.find((e) => e.category === '健康度低')!
    expect(entry.count).toBe(1)
  })

  it('health="风险" 时健康度低 count=1', () => {
    const row = makeRow({ projectId: 'P302', health: '风险' })
    const result = classifyProjects([row])
    const entry = result.find((e) => e.category === '健康度低')!
    expect(entry.count).toBe(1)
  })

  it('health="健康" 时健康度低 count=0', () => {
    const row = makeRow({ projectId: 'P303', health: '健康' })
    const result = classifyProjects([row])
    const entry = result.find((e) => e.category === '健康度低')!
    expect(entry.count).toBe(0)
  })

  // 场景6：tone 校验
  it('各类 tone 符合规范', () => {
    const result = classifyProjects([])
    const toneMap: Record<string, RiskClassEntry['tone']> = {
      回款延期: 'warn',
      里程碑滞后: 'warn',
      成本超支: 'danger',
      风险未闭环: 'danger',
      数据异常: 'mut',
      健康度低: 'danger',
    }
    for (const entry of result) {
      expect(entry.tone).toBe(toneMap[entry.category])
    }
  })

  // 场景7：一个项目同时命中多类（不互斥）
  it('一个项目同时命中多类时分别计入各类', () => {
    const row = makeRow({
      projectId: 'P400',
      health: '风险',
      riskReasons: [
        { category: '回款延期', detail: '3个延期节点', tone: 'warn' },
        { category: '成本超支', detail: '超支 2.0 万', tone: 'danger' },
      ],
    })
    const result = classifyProjects([row])
    expect(result.find((e) => e.category === '回款延期')!.count).toBe(1)
    expect(result.find((e) => e.category === '成本超支')!.count).toBe(1)
    expect(result.find((e) => e.category === '健康度低')!.count).toBe(1)
    // 未命中的类 count 仍为 0
    expect(result.find((e) => e.category === '里程碑滞后')!.count).toBe(0)
    expect(result.find((e) => e.category === '风险未闭环')!.count).toBe(0)
    expect(result.find((e) => e.category === '数据异常')!.count).toBe(0)
  })

  // 场景8：detail 透传
  it('前5类 detail 透传自 riskReasons.detail', () => {
    const row = makeRow({
      projectId: 'P500',
      projectName: '透传项目',
      riskReasons: [
        { category: '里程碑滞后', detail: '里程碑状态:滞后', tone: 'warn' },
        { category: '风险未闭环', detail: '5 个未关闭风险', tone: 'danger' },
      ],
    })
    const result = classifyProjects([row])
    const msEntry = result.find((e) => e.category === '里程碑滞后')!
    expect(msEntry.projects[0].detail).toBe('里程碑状态:滞后')
    const riskEntry = result.find((e) => e.category === '风险未闭环')!
    expect(riskEntry.projects[0].detail).toBe('5 个未关闭风险')
  })

  it('健康度低 detail 固定为 "健康度评级: " + health', () => {
    const row = makeRow({ projectId: 'P501', health: '关注' })
    const result = classifyProjects([row])
    const entry = result.find((e) => e.category === '健康度低')!
    expect(entry.projects[0].detail).toBe('健康度评级: 关注')
  })
})
