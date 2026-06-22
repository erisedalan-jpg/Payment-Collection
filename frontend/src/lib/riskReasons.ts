import type { Project, ProjectPmis } from '@/types/analysis'
import { isAnomalous } from '@/lib/anomaly'

/** 关注/风险原因的分类枚举 */
export type RiskCategory = '回款延期' | '里程碑滞后' | '成本超支' | '风险未闭环' | '数据异常'

/** 单条关注/风险原因 */
export interface RiskReason {
  /** 原因分类 */
  category: RiskCategory
  /** 简短补充说明，如「3 个延期节点」/「超支 1.2 万」/「2 个未关闭风险」 */
  detail: string
  /** pill 配色三态，对应设计令牌状态色 */
  tone: 'warn' | 'danger' | 'mut'
}

/** 里程碑滞后关键词 */
const MILESTONE_LAG_KEYWORDS = ['滞后', '延期', '超期']

/**
 * 计算项目命中的关注/风险原因（5 类具体原因）。
 * 数据异常（orgL4 缺失）优先且短路——L4 缺失时其它判定不可靠。
 * S5(/projects 列)与 S10(首页风险分类)共用此函数，不要在此重复输出健康度汇总。
 *
 * @param project 项目主域数据
 * @param pmis    项目 PMIS 数据（可选，缺失时仅判断可本地计算的维度）
 */
export function riskReasons(project: Project, pmis?: ProjectPmis): RiskReason[] {
  // 数据异常优先短路：orgL4 缺失时其它指标不可靠
  if (isAnomalous(project)) {
    return [{ category: '数据异常', detail: '服务组 L4 缺失', tone: 'mut' }]
  }

  const out: RiskReason[] = []

  // 1. 回款延期：存在延期节点
  const delayed = project.payment?.delayedCount ?? 0
  if (delayed > 0) {
    out.push({ category: '回款延期', detail: `${delayed} 个延期节点`, tone: 'warn' })
  }

  // 2. 里程碑滞后：里程碑进度状态含关键词
  const msStatus = String(pmis?.progress?.['里程碑进度状态'] ?? '')
  if (MILESTONE_LAG_KEYWORDS.some((kw) => msStatus.includes(kw))) {
    out.push({ category: '里程碑滞后', detail: msStatus, tone: 'warn' })
  }

  // 3. 成本超支：overspendAmount > 0 优先；否则看 PMIS 项目超支 flag 或消耗比 > 1
  const over = project.overspendAmount ?? 0
  if (over > 0) {
    out.push({ category: '成本超支', detail: `超支 ${(over / 10000).toFixed(1)} 万`, tone: 'danger' })
  } else if ((pmis?.cost?.['项目超支']) || ((pmis?.cost?.['消耗比'] ?? 0) > 1)) {
    out.push({ category: '成本超支', detail: '项目超支', tone: 'danger' })
  }

  // 4. 风险未闭环：存在未关闭风险
  const openRisk = pmis?.risk?.['未关闭风险数'] ?? 0
  if ((openRisk ?? 0) > 0) {
    out.push({ category: '风险未闭环', detail: `${openRisk} 个未关闭风险`, tone: 'danger' })
  }

  return out
}
