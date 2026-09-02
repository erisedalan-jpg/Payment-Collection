import type { Project, ProjectPmis } from '@/types/analysis'
import { isAnomalous } from './anomaly'
import { riskReasons, TOTAL_OVERSPEND_CATS, type RiskReason } from './riskReasons'
import { noOriginBudget } from './costAnalysis'
import type { DataColumn } from '@/components/DataTable.vue'

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
  plannedCloseDate: string | null
  actualCloseDate: string | null
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
  // nodeActualTotal = 节点已收(此处判「有没有收到过钱」,节点口径正合适)。
  // 2026-08-31 审查改名前叫 actualTotal —— 那时它与 paymentPmis.actualTotal(流水净额)同名。
  if ((pay.remainingTotal ?? 0) <= 0 && (pay.nodeActualTotal ?? 0) > 0) return '已回清'
  return '回款中'
}

/** 里程碑项里取「项目关闭」的计划/实际日；缺该项 → null（不回退其他节点）。 */
function closeDates(items: any[] | undefined): { plan: string | null; actual: string | null } {
  const it = (items ?? []).find((m) => m?.name === '项目关闭')
  return { plan: it?.planDate || null, actual: it?.actualDate || null }
}

export function buildProjectRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  assignments?: Record<string, string[]>,
  milestones?: Record<string, any[]>,
): ProjectRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const prog = m.progress ?? {}
    const risk = m.risk ?? {}
    const status = m.status ?? {}
    const cost = m.cost ?? {}
    const customer = m.customer ?? {}
    const close = closeDates(milestones?.[p.projectId])
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
      plannedCloseDate: close.plan,
      actualCloseDate: close.actual,
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

const fmtDate = (v: any) => (v ? String(v).slice(0, 10) : '-')
const fmtRatioCell = (v: any) => (v == null ? '-' : (Number(v) * 100).toFixed(1) + '%')

/** 项目域列定义唯一来源。`/projects` 与「重点跟进」四页共用；新增列只加在这里。
 *  不含 action 操作列（那是 /projects 独有的行内入口）。 */
export const PROJECT_DOMAIN_COLUMNS: DataColumn[] = [
  { key: 'projectName', label: '项目名称', width: 220 },
  { key: 'projectId', label: '项目编号', width: 175 },
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'setupDate', label: '立项日期', width: 110, sortable: true, formatter: fmtDate },
  { key: 'originSetupDate', label: '原项目立项日期', width: 130, sortable: true, formatter: fmtDate },
  { key: 'plannedFinalAcceptDate', label: '计划终验时间', width: 120, sortable: true, formatter: fmtDate },
  { key: 'actualFinalAcceptDate', label: '实际终验时间', width: 120, sortable: true, formatter: fmtDate },
  { key: 'plannedCloseDate', label: '计划关闭时间', width: 120, sortable: true, formatter: fmtDate },
  { key: 'actualCloseDate', label: '实际关闭时间', width: 120, sortable: true, formatter: fmtDate },
  { key: 'projectManager', label: '项目经理', width: 96, sortable: true },
  { key: 'orgL4', label: 'L4组', width: 110, sortable: true },
  { key: 'stage', label: '阶段', width: 100 },
  { key: 'progress', label: '完工%', width: 90, sortable: true, formatter: (v) => fmtRatioCell(v) },
  { key: 'riskLevel', label: '风险', width: 96, sortable: true,
    formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'projectLevel', label: '级别', width: 80, sortable: true },
  { key: 'projectType', label: '项目类型', width: 110, sortable: true },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatioCell(v) },
  { key: 'paymentRatio', label: '回款完成率', width: 105, sortable: true, formatter: (v) => fmtRatioCell(v) },
  { key: 'projectStatus', label: '项目状态', width: 100, sortable: true },
  { key: 'health', label: '健康度', width: 96 },
  { key: 'riskReasons', label: '关注原因', width: 220 },
  { key: 'paymentStatus', label: '回款状态', width: 100 },
  { key: 'signUnit', label: '签约单位', width: 180, sortable: true },
  { key: 'tags', label: '标签', width: 160,
    formatter: (v) => (Array.isArray(v) && v.length ? v.join('、') : '') },
  { key: 'top1000', label: 'TOP1000', width: 90 },
  { key: 'quadrant', label: '象限', width: 140 },
]

/** 不外借的列：四页均已有语义相同、单位不同的 contractWan(万)/项目金额(万)，
 *  而本列是元值 + 除万 formatter。同时借入会出现两列合同金额。 */
export const BORROW_EXCLUDE = new Set<string>(['contractAmount'])

/** 供英文三页借列：剔除自有 key 与 BORROW_EXCLUDE。借入列保留来源的 sortable，
 *  不要再套 withSortable —— 那会把 tags/riskReasons 等数组列误开成可排序。 */
export function borrowProjectColumns(ownKeys: Set<string>): DataColumn[] {
  return PROJECT_DOMAIN_COLUMNS.filter((c) => !ownKeys.has(c.key) && !BORROW_EXCLUDE.has(c.key))
}

const DOMAIN_KEYS = PROJECT_DOMAIN_COLUMNS.map((c) => c.key)

/** 每一页都必须能提供的项目域列 key（= 全部列 − 不外借的列）。
 *  各 view 测试据此断言「ALL_COLUMNS 真的接上了 borrowProjectColumns」。 */
export const BORROWABLE_KEYS: string[] = DOMAIN_KEYS.filter((k) => !BORROW_EXCLUDE.has(k))

/** decorateProjectDomain 额外搬运的非列字段：riskLevel 列的 formatter 读同一行上的
 *  r.openRisks 拼出「等级(未关闭数)」，但 openRisks 本身不是独立展示列（不进
 *  PROJECT_DOMAIN_COLUMNS / BORROWABLE_KEYS）。借入 riskLevel 列的页面若行上没有它，
 *  formatter 会静默丢括号内计数——decorate 时随 DOMAIN_KEYS 一并补上。 */
const DECORATE_EXTRA_KEYS = ['openRisks']

/** 英文三页：把 ProjectRow 的项目域字段并到行上；已有键不覆盖，只补差集。
 *  必须并到行对象而非渲染时现取 —— 否则排序/列筛选/导出三处读不到值。 */
export function decorateProjectDomain<T extends { projectId: string }>(
  rows: T[], prMap: Map<string, ProjectRow>,
): T[] {
  return rows.map((r) => {
    const pr = prMap.get(r.projectId)
    if (!pr) return r
    const extra: Record<string, unknown> = {}
    for (const k of DOMAIN_KEYS.concat(DECORATE_EXTRA_KEYS)) {
      if (BORROW_EXCLUDE.has(k) || k in r) continue
      extra[k] = (pr as unknown as Record<string, unknown>)[k]
    }
    return Object.keys(extra).length ? { ...r, ...extra } : r
  })
}

/** /risk 专用：按 keyMap 把 ProjectRow 字段写成【中文键】。
 *  绝不写英文键 —— risk 的列由行键动态推导，每个英文键都会各自变成一列。
 *  日期值切到 10 位（risk 动态列不套 fmtDateCell，不切会露出时间戳）。已有键不覆盖。 */
export function decorateProjectDomainMapped<T extends { projectId: string }>(
  rows: T[], prMap: Map<string, ProjectRow>,
  keyMap: Record<string, string>, exclude: Set<string>,
): T[] {
  return rows.map((r) => {
    const pr = prMap.get(r.projectId)
    if (!pr) return r
    const extra: Record<string, unknown> = {}
    for (const [en, zh] of Object.entries(keyMap)) {
      if (exclude.has(en) || zh in r) continue
      const v = (pr as unknown as Record<string, unknown>)[en]
      extra[zh] = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v
    }
    return Object.keys(extra).length ? { ...r, ...extra } : r
  })
}
