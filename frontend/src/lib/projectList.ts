import type { Project, ProjectPmis } from '@/types/analysis'
import { isAnomalous } from './anomaly'
import { riskReasons, TOTAL_OVERSPEND_CATS, type RiskReason } from './riskReasons'
import { noOriginBudget } from './costAnalysis'

// 项目清单行：projects[](P1 主域) join projectPmis[id] 的扁平展示模型
export interface ProjectRow {
  projectId: string
  projectName: string
  customer: string
  signUnit: string
  contractAmount: number | null
  projectLevel: string
  projectType: string
  projectManager: string
  orgL4: string
  stage: string
  progress: number | null
  projectStatus: string
  riskLevel: string
  openRisks: number
  costRatio: number | null
  paymentRatio: number | null
  paymentStatus: string
  health: string
  top1000: string
  quadrant: string
  isPresale: boolean
  hasClosed: boolean
  paused: boolean
  overspend: boolean
  tags?: string[]
  isAnomalous: boolean
  riskReasons: RiskReason[]
  setupDate: string | null
  originSetupDate: string | null
  plannedFinalAcceptDate: string | null
  actualFinalAcceptDate: string | null
}

// 收窄后只保留特殊项筛选（列枚举筛选已迁至 crossFilter 表头）
export interface ProjectFilters {
  search: string
  presale: string // '' | 'yes' | 'no'
  paused: string   // '' | 'yes'
  overspend: string // '' | 'yes'
  riskCategory: string  // '' 或 '回款延期'|'里程碑滞后'|'总成本超支大于5000'|'总成本超支小于5000'|'交付成本超支'|'风险未闭环'|'数据异常'|'健康度低'
}

/** 项目级回款状态四态：无节点 / 延期 / 已回清 / 回款中。
 * 边界：有节点但金额全 0（节点建了未填金额，真实数据约 2/640）归「回款中」，业务上如需单列再调。 */
export function paymentStatusOf(p: Project): string {
  const pay = p.payment
  if (!pay || !pay.relatedNodeCount) return '无节点'
  if ((pay.delayedCount ?? 0) > 0) return '延期'
  if ((pay.remainingTotal ?? 0) <= 0 && (pay.actualTotal ?? 0) > 0) return '已回清'
  return '回款中'
}

export function buildProjectRows(projects: Project[], pmisMap: Record<string, ProjectPmis>, assignments?: Record<string, string[]>): ProjectRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const prog = m.progress ?? {}
    const risk = m.risk ?? {}
    const status = m.status ?? {}
    const cost = m.cost ?? {}
    const customer = m.customer ?? {}
    return {
      projectId: p.projectId,
      projectName: p.projectName || '-',
      customer: p.customer || '-',
      signUnit: p.signUnit || '-',
      // 合同金额：本项目 PMIS 合同总额优先；售前服务类本合同恒空→回退原项目合同(paymentPmis.contract 已由后端 fromOrigin 映射原项目)。
      contractAmount: typeof customer.合同总额 === 'number'
        ? customer.合同总额
        : (p.isPresale && typeof p.paymentPmis?.contract === 'number' ? p.paymentPmis.contract : null),
      projectLevel: status.项目级别 || '-',
      projectType: status.项目类型 || '-',
      setupDate: status.立项日期 ?? null,
      // 原项目立项日期:读的是【另一个项目】的 PMIS 记录。不要误用上面的局部变量 status
      // ——那是本项目的,用它会让每个售前项目显示自己的立项日期,而且两者都是合法日期、不会报错。
      originSetupDate: p.relatedClosedId
        ? (((pmisMap[p.relatedClosedId] ?? {}) as Record<string, any>).status?.立项日期 ?? null)
        : null,
      // 终验两列直取后端已回填的口径(preprocess.backfill_final_acceptance),前端不重算
      plannedFinalAcceptDate: prog.终验时间 ?? null,
      actualFinalAcceptDate: prog.实际终验时间 ?? null,
      projectManager: p.projectManager || '-',
      orgL4: p.orgL4 || '-',
      stage: prog.项目阶段 || '-',
      progress: typeof prog.完工进展 === 'number' ? prog.完工进展 : null,
      projectStatus: status.项目状态 || '-',
      riskLevel: risk.最高等级 || '无',
      openRisks: Number(risk.未关闭风险数 ?? 0),
      costRatio: typeof cost.消耗比 === 'number' ? cost.消耗比 : null,
      paymentRatio: p.payment?.paymentRatio ?? null,
      paymentStatus: paymentStatusOf(p),
      health: p.health?.overall || '无数据',
      top1000: p.top1000 || '否',
      quadrant: p.quadrant || '',
      isPresale: !!p.isPresale,
      hasClosed: !!p.relatedClosedId,
      paused: status.是否暂停 === true,
      overspend: cost.项目超支 === true,
      tags: assignments?.[p.projectId] ?? [],
      isAnomalous: isAnomalous(p),
      riskReasons: riskReasons(p, pmisMap[p.projectId], noOriginBudget(p, pmisMap)),
    }
  })
}

export function filterProjectRows(rows: ProjectRow[], f: ProjectFilters): ProjectRow[] {
  const q = (f.search || '').trim().toLowerCase()
  return rows.filter((r) => {
    // s !== '-'：占位值不参与搜索匹配
    if (q && ![r.projectName, r.projectId, r.customer, r.projectManager].some((s) => s !== '-' && s.toLowerCase().includes(q))) return false
    if (f.paused === 'yes' && !r.paused) return false
    if (f.overspend === 'yes' && !r.overspend) return false
    if (f.presale === 'yes' && !r.isPresale) return false
    if (f.presale === 'no' && r.isPresale) return false
    if (f.riskCategory) {
      if (f.riskCategory === '健康度低') {
        if (!['关注', '风险'].includes(r.health)) return false
      } else if (f.riskCategory === '成本超支') {
        if (!r.riskReasons.some(rr => rr.category === '交付成本超支' || (TOTAL_OVERSPEND_CATS as readonly string[]).includes(rr.category))) return false
      } else {
        if (!r.riskReasons.some(rr => rr.category === f.riskCategory)) return false
      }
    }
    return true
  })
}
