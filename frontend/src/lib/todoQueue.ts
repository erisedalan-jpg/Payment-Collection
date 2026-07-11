import type { PayNodeRow } from './paymentPmis'
import type { MilestoneProject } from './milestoneAnalytics'
import type { RiskReason } from './riskReasons'

// 待办/临期 队列纯计算层（V2.9.0 首页）。now 由调用方注入，保持纯函数可测。
// 回款节点单状态互斥：status==='延期' 优先入「回款已延期」，否则再判临期窗口。
// 里程碑节点：actualDate 空且 planDate<今=滞后、窗口内=临期，二选一。
// 成本超支：riskReasons 命中 交付成本超支 ∪ 总成本超支大于5000，项目级一条。

export type TodoBucket = '回款临期' | '回款已延期' | '里程碑' | '成本超支'

export interface TodoItem {
  key: string
  bucket: TodoBucket
  stateLabel: string
  tone: 'warn' | 'danger'
  projectId: string
  projectName: string
  date?: string
  amount?: number
  detail: string
  urgencyRank: number
  sortSub: number
}

export interface TodoQueueResult {
  items: TodoItem[]
  counts: Record<TodoBucket, number>
}

// 「大于5000」两档中仅取超支档；交付超支恒入。判据用常量避免散写。
const OVERSPEND_TODO_CATS = new Set<string>(['交付成本超支', '总成本超支大于5000'])

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dateNum(d: string): number {
  return Number(d.replace(/-/g, '')) || 0
}
const wan = (n: number) => (n / 10000).toFixed(1)

export function buildTodoQueue(
  payNodes: PayNodeRow[],
  milestones: MilestoneProject[],
  projectRows: Array<{ projectId: string; projectName: string; riskReasons: RiskReason[]; overspendAmount: number }>,
  now: Date,
  windowDays: 7 | 30,
): TodoQueueResult {
  const today = ymd(now)
  const until = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + windowDays))
  const items: TodoItem[] = []

  // 1. 回款：延期优先，否则判临期窗口（互斥）
  payNodes.forEach((n, i) => {
    const plan = String(n.planDate || '').slice(0, 10)
    if (n.status === '延期') {
      items.push({
        key: `pay-delayed-${i}-${n.projectId}`, bucket: '回款已延期', stateLabel: '已延期', tone: 'danger',
        projectId: n.projectId, projectName: n.projectName, date: plan, amount: n.unpaidAmount,
        detail: `已延期 · 待回 ${wan(n.unpaidAmount)} 万`, urgencyRank: 0, sortSub: -n.unpaidAmount,
      })
    } else if (n.status !== '已回款' && plan) {
      if (plan === today) {
        items.push({
          key: `pay-due-${i}-${n.projectId}`, bucket: '回款临期', stateLabel: '今到期', tone: 'warn',
          projectId: n.projectId, projectName: n.projectName, date: plan, amount: n.unpaidAmount,
          detail: `今到期 · 待回 ${wan(n.unpaidAmount)} 万`, urgencyRank: 1, sortSub: -n.unpaidAmount,
        })
      } else if (plan > today && plan <= until) {
        items.push({
          key: `pay-soon-${i}-${n.projectId}`, bucket: '回款临期', stateLabel: '临期', tone: 'warn',
          projectId: n.projectId, projectName: n.projectName, date: plan, amount: n.unpaidAmount,
          detail: `${plan.slice(5)} 到期 · 待回 ${wan(n.unpaidAmount)} 万`, urgencyRank: 2, sortSub: dateNum(plan),
        })
      }
    }
  })

  // 2. 里程碑：actualDate 空，planDate<今=滞后 / 窗口内=临期
  milestones.forEach((p) => {
    p.nodes.forEach((nd, j) => {
      if ((nd.actualDate ?? '').trim()) return
      const plan = (nd.planDate ?? '').slice(0, 10)
      if (!plan) return
      if (plan < today) {
        items.push({
          key: `ms-lag-${p.projectId}-${j}`, bucket: '里程碑', stateLabel: '里程碑滞后', tone: 'danger',
          projectId: p.projectId, projectName: p.projectName, date: plan,
          detail: `${nd.name} · 计划 ${plan.slice(5)}`, urgencyRank: 3, sortSub: dateNum(plan),
        })
      } else if (plan <= until) {
        items.push({
          key: `ms-soon-${p.projectId}-${j}`, bucket: '里程碑', stateLabel: '里程碑临期', tone: 'warn',
          projectId: p.projectId, projectName: p.projectName, date: plan,
          detail: `${nd.name} · 计划 ${plan.slice(5)}`, urgencyRank: 4, sortSub: dateNum(plan),
        })
      }
    })
  })

  // 3. 成本超支 >5000（项目级去重，一项目一条）
  projectRows.forEach((r) => {
    if (r.riskReasons.some((rr) => OVERSPEND_TODO_CATS.has(rr.category))) {
      items.push({
        key: `over-${r.projectId}`, bucket: '成本超支', stateLabel: '超支', tone: 'danger',
        projectId: r.projectId, projectName: r.projectName, amount: r.overspendAmount,
        detail: r.overspendAmount > 0 ? `超支 ${wan(r.overspendAmount)} 万` : '交付成本超支', urgencyRank: 5, sortSub: -r.overspendAmount,
      })
    }
  })

  items.sort((a, b) => a.urgencyRank - b.urgencyRank || a.sortSub - b.sortSub)

  const counts: Record<TodoBucket, number> = { '回款临期': 0, '回款已延期': 0, '里程碑': 0, '成本超支': 0 }
  for (const it of items) counts[it.bucket]++

  return { items, counts }
}
