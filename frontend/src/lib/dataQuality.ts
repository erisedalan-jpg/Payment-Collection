import type { RawNode } from '@/types/analysis'
import { pctToNum } from './format'

type N = Record<string, any>
export type Severity = 'h' | 'm' | 'l'

export interface DataCheck {
  key: string
  name: string
  severity: Severity
  scope: 'all' | 'related'
  pred: (n: N) => boolean
}

/** 忠实移植 initData 的数据质量检查（去掉旧版恒为 0 的"状态为待确定"死检查）。 */
export const DATA_CHECKS: DataCheck[] = [
  { key: 'noAmount', name: '缺少项目金额', severity: 'h', scope: 'all', pred: (n) => !n.projectAmount },
  { key: 'ratioPending', name: '实际回款比例待上报', severity: 'm', scope: 'related', pred: (n) => pctToNum(n.actualPaymentRatio) === null },
  { key: 'noPm', name: '缺少项目经理', severity: 'm', scope: 'all', pred: (n) => !n.projectManager },
  { key: 'noOrgL4', name: '缺少服务组', severity: 'l', scope: 'all', pred: (n) => !n.orgL4 },
  {
    key: 'ratioOver',
    name: '回款比例>100%',
    severity: 'h',
    scope: 'related',
    pred: (n) => {
      if (n.actualPaymentRatio === null || n.actualPaymentRatio === undefined || n.actualPaymentRatio === '') return false
      const raw = Number(n.actualPaymentRatio)
      if (isNaN(raw)) return false
      // actualPaymentRatio 存储为 0~1 小数（0.5=50%）或裸百分数（50=50%），>1 均表示超过100%
      return raw > 1
    },
  },
]

const TIERS = ['100万以上', '50-100万', '50万以下']

function scopeNodes(rawNodes: RawNode[], scope: 'all' | 'related'): N[] {
  return (scope === 'related' ? rawNodes.filter((n) => (n as N).isPaymentRelated) : rawNodes) as N[]
}

export interface QualityRow {
  key: string
  name: string
  severity: Severity
  byTier: number[]
  total: number
}
/** 各检查项按三档计数 + 合计。 */
export function dataQualityRows(rawNodes: RawNode[]): QualityRow[] {
  return DATA_CHECKS.map((c) => {
    const base = scopeNodes(rawNodes, c.scope)
    const byTier = TIERS.map((t) => base.filter((n) => n.tier === t && c.pred(n)).length)
    return { key: c.key, name: c.name, severity: c.severity, byTier, total: base.filter((n) => c.pred(n)).length }
  })
}

/** 下钻：checkIdx 检查项、tierIdx 档位(-1=全部) 的问题节点。忠实移植 showDataDrill。 */
export function dataQualityDrill(rawNodes: RawNode[], checkIdx: number, tierIdx: number): RawNode[] {
  const c = DATA_CHECKS[checkIdx]
  if (!c) return []
  let base = scopeNodes(rawNodes, c.scope)
  if (tierIdx >= 0) base = base.filter((n) => n.tier === TIERS[tierIdx])
  return base.filter((n) => c.pred(n)) as RawNode[]
}
