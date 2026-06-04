import { describe, it, expect } from 'vitest'
import { DATA_CHECKS, dataQualityRows, dataQualityDrill } from './dataQuality'

const NODES: any[] = [
  { projectId: 'P1', tier: '100万以上', projectAmount: 0, projectManager: '张', orgL4: '北京', isPaymentRelated: true, actualPaymentRatio: null },
  { projectId: 'P2', tier: '100万以上', projectAmount: 100, projectManager: '', orgL4: '', isPaymentRelated: true, actualPaymentRatio: '150%' },
  { projectId: 'P3', tier: '50万以下', projectAmount: 50, projectManager: '李', orgL4: '上海', isPaymentRelated: false, actualPaymentRatio: null },
]

describe('DATA_CHECKS', () => {
  it('5 项检查，去掉死检查', () => {
    expect(DATA_CHECKS).toHaveLength(5)
    expect(DATA_CHECKS.map((c) => c.name)).toEqual([
      '缺少项目金额', '实际回款比例待上报', '缺少项目经理', '缺少服务组', '回款比例>100%',
    ])
  })
})

describe('dataQualityRows', () => {
  const rows = dataQualityRows(NODES)
  it('缺少项目金额：P1(0)', () => {
    const r = rows[0]
    expect(r.byTier).toEqual([1, 0, 0])
    expect(r.total).toBe(1)
  })
  it('实际回款比例待上报：仅关联且 null → P1', () => {
    expect(rows[1].total).toBe(1)
  })
  it('回款比例>100%：关联且 >1 → P2', () => {
    expect(rows[4].total).toBe(1)
    expect(rows[4].byTier).toEqual([1, 0, 0])
  })
})

describe('dataQualityDrill', () => {
  it('合计(tierIdx=-1)：缺金额 → P1', () => {
    expect(dataQualityDrill(NODES, 0, -1).map((n: any) => n.projectId)).toEqual(['P1'])
  })
  it('档位下钻：100万以上 比例>100% → P2', () => {
    expect(dataQualityDrill(NODES, 4, 0).map((n: any) => n.projectId)).toEqual(['P2'])
  })
})
