import type { RawNode } from '@/types/analysis'
import { groupByProject, type ProjectAgg } from './dashboardStats'
import { pctToNum } from './format'

/** 节点待回款（元）= 计划回款 - 实际回款。忠实移植 app.js getNodeRemaining。 */
export function getNodeRemaining(n: Record<string, any>): number {
  return (n.expectedPayment || 0) - (n.actualPayment || 0)
}

export interface RiskGroups {
  nearDue: RawNode[]
  canAdvance: RawNode[]
  highRisk: ProjectAgg[]
}

/**
 * 忠实移植 renderRisk 的三类风险分组。now 注入以便测试（组件调用方传 new Date()）。
 * - nearDue：关联节点且有 planDate、实际比例<1（或缺报）、planDate 落在 [now, now+7天]，按 planDate 升序。
 * - canAdvance：关联节点且 nodeStatus='加资源可提前'。
 * - highRisk：项目级完成率<0.3，按项目金额降序取前 10。
 */
export function riskGroups(tierNodes: RawNode[], now: Date): RiskGroups {
  const d7 = new Date(now.getTime() + 7 * 864e5)
  const related = tierNodes.filter((n) => (n as Record<string, any>).isPaymentRelated)

  const nearDue = related
    .filter((n) => {
      const r = n as Record<string, any>
      if (!r.planDate) return false
      const v = pctToNum(r.actualPaymentRatio)
      return v === null || v < 1
    })
    .filter((n) => {
      try {
        const d = new Date((n as Record<string, any>).planDate)
        return d >= now && d <= d7
      } catch {
        return false
      }
    })
    .sort((a, b) =>
      String((a as Record<string, any>).planDate || '').localeCompare(
        String((b as Record<string, any>).planDate || ''),
      ),
    )

  const canAdvance = related.filter((n) => (n as Record<string, any>).nodeStatus === '加资源可提前')

  const highRisk = groupByProject(tierNodes)
    .filter((p) => p.paymentRatio !== null && p.paymentRatio < 0.3 && (p.projectAmount || 0) > 0)
    .sort((a, b) => (b.projectAmount || 0) - (a.projectAmount || 0))
    .slice(0, 10)

  return { nearDue, canAdvance, highRisk }
}
