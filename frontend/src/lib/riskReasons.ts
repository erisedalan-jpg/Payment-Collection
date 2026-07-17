import type { Project, ProjectPmis } from '@/types/analysis'
import { isAnomalous } from '@/lib/anomaly'

/** 关注/风险原因的分类枚举 */
export type RiskCategory = '回款延期' | '里程碑滞后' | '总成本超支大于5000' | '总成本超支小于5000' | '交付成本超支' | '风险未闭环' | '数据异常' | '未获取原项目预算'

/** 单条关注/风险原因 */
export interface RiskReason {
  /** 原因分类 */
  category: RiskCategory
  /** 简短补充说明，如「3 个延期节点」/「超支 1.2 万」/「2 个未关闭风险」 */
  detail: string
  /** pill 配色三态，对应设计令牌状态色 */
  tone: 'warn' | 'danger' | 'mut'
}

/** 「总成本超支」两档 category（按 overspendAmount 是否 > 5000 元拆分）。判定「是否总成本超支」的消费方须用此常量，勿散写字面量。 */
export const TOTAL_OVERSPEND_CATS = ['总成本超支大于5000', '总成本超支小于5000'] as const

/** 全部关注原因（8 类）。UI 选项源需要运行时可枚举的列表，而 RiskCategory 是类型、枚举不出来。
 *  下方 _exhaustive 是编译期护栏：往 RiskCategory 加了新类却忘了加进本数组 → typecheck 报错。
 *  注意：后端 lanxin_config.REASON_WHITELIST 是本列表的跨语言副本（Python 读不了 TS，无法消除），
 *  两边必须一致；若不一致，后端 validate_config 会以 400 明确拒绝，不会静默。 */
export const ALL_RISK_CATEGORIES = [
  '回款延期', '里程碑滞后', '总成本超支大于5000', '总成本超支小于5000',
  '交付成本超支', '风险未闭环', '数据异常', '未获取原项目预算',
] as const satisfies readonly RiskCategory[]

type _MissingCategory = Exclude<RiskCategory, typeof ALL_RISK_CATEGORIES[number]>
const _exhaustive: _MissingCategory extends never ? true : never = true
void _exhaustive

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
export function riskReasons(project: Project, pmis?: ProjectPmis, noOrigBudget = false): RiskReason[] {
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

  // 3. 成本维度:售前未获取原项目预算 → 中性单列(不计入超支),替代 总/交付成本超支
  if (noOrigBudget) {
    out.push({ category: '未获取原项目预算', detail: '售前原项目预算缺失', tone: 'mut' })
  } else {
    const over = project.overspendAmount ?? 0
    const overCat: RiskCategory = over > 5000 ? '总成本超支大于5000' : '总成本超支小于5000'
    if (over > 0) {
      out.push({ category: overCat, detail: `超支 ${(over / 10000).toFixed(1)} 万`, tone: 'danger' })
    } else if ((pmis?.cost?.['项目超支']) || ((pmis?.cost?.['消耗比'] ?? 0) > 1)) {
      out.push({ category: overCat, detail: '项目超支', tone: 'danger' })
    }
    if (pmis?.cost?.['交付超支'] === true) {
      out.push({ category: '交付成本超支', detail: '交付人工超支', tone: 'danger' })
    }
  }

  // 4. 风险未闭环：存在未关闭风险
  const openRisk = pmis?.risk?.['未关闭风险数'] ?? 0
  if ((openRisk ?? 0) > 0) {
    out.push({ category: '风险未闭环', detail: `${openRisk} 个未关闭风险`, tone: 'danger' })
  }

  return out
}
