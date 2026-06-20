import type { Project, ProjectPmis, MilestoneItem } from '@/types/analysis'

export type MilestoneStatus = '正常' | '延期' | '严重延期' | '未发布'

export interface MilestoneProject {
  projectId: string
  projectName: string
  manager: string
  orgL4: string
  orgL3_1: string
  projectType: string
  contract: number
  status: MilestoneStatus
  nodes: MilestoneItem[]
}

export interface ExcludeOpts { excludeOn?: boolean; excludedIds?: Record<string, boolean> }
export interface StatusKpis { total: number; normal: number; delayed: number; severe: number; unpublished: number }

/** PMIS 里程碑进度状态归一：超期未发布/空/null/未知 → 未发布。 */
export function normalizeStatus(raw: string | null | undefined): MilestoneStatus {
  const s = (raw ?? '').trim()
  if (s === '正常') return '正常'
  if (s === '延期') return '延期'
  if (s === '严重延期') return '严重延期'
  return '未发布'
}

/** 本项目号节点优先；为空且售前则回退原项目号(relatedClosedId)。 */
function nodesFor(p: Project, ms: Record<string, MilestoneItem[]>): MilestoneItem[] {
  const own = ms[p.projectId]
  if (own && own.length) return own
  if (p.isPresale && p.relatedClosedId) return ms[p.relatedClosedId] ?? []
  return []
}

/** 装配主域里程碑视图；excludeOn 时剔除 excludedIds 命中的项目。 */
export function buildMilestoneProjects(
  projects: Project[],
  pmis: Record<string, ProjectPmis>,
  milestones: Record<string, MilestoneItem[]>,
  opts: ExcludeOpts = {},
): MilestoneProject[] {
  const excl = opts.excludeOn ? (opts.excludedIds ?? {}) : {}
  const out: MilestoneProject[] = []
  for (const p of projects) {
    if (excl[p.projectId]) continue
    const m = (pmis[p.projectId] ?? {}) as any
    out.push({
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      manager: (p.projectManager ?? '').trim(),
      orgL4: (p.orgL4 ?? '').trim(),
      orgL3_1: (p.orgL3_1 ?? '').trim(),
      projectType: (m.status?.项目类型 ?? '').trim(),
      contract: Number(p.paymentPmis?.contract ?? 0),
      status: normalizeStatus(m.progress?.里程碑进度状态),
      nodes: nodesFor(p, milestones),
    })
  }
  return out
}

export function statusKpis(ps: MilestoneProject[]): StatusKpis {
  const k: StatusKpis = { total: ps.length, normal: 0, delayed: 0, severe: 0, unpublished: 0 }
  for (const p of ps) {
    if (p.status === '正常') k.normal++
    else if (p.status === '延期') k.delayed++
    else if (p.status === '严重延期') k.severe++
    else k.unpublished++
  }
  return k
}

// ---- 共享助手 ----
function nodeByName(p: MilestoneProject, kw: string): MilestoneItem | undefined {
  return p.nodes.find((n) => (n.name ?? '').includes(kw))
}
function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d: Date, n: number): string {
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}
function quarterRange(d: Date): [string, string] {
  const sm = Math.floor(d.getMonth() / 3) * 3
  return [ymd(new Date(d.getFullYear(), sm, 1)), ymd(new Date(d.getFullYear(), sm + 3, 0))]
}
function periodKey(dateStr: string, gran: 'quarter' | 'month'): string {
  const y = dateStr.slice(0, 4)
  if (gran === 'month') return `${y}-${dateStr.slice(5, 7)}`
  const q = Math.floor((parseInt(dateStr.slice(5, 7), 10) - 1) / 3) + 1
  return `${y}Q${q}`
}
function prOf(it: MilestoneItem): 'high' | 'mid' | 'low' {
  const p = (it as any).priority
  return p === 'high' || p === 'mid' ? p : 'low'
}

// ---- 到期提醒（A 图）----
export interface ReminderWindow { high: number; mid: number; low: number; projectCount: number }
/** now 由调用方传入(纯函数,便于测试)。窗口:7天[今,今+7]、30天[今,今+30]、本季度[季初,季末];actualDate 非空(已完成)不计。 */
export function reminderBuckets(
  ps: MilestoneProject[], now: Date,
): { windows: Record<'7d' | '30d' | 'quarter', ReminderWindow> } {
  const today = ymd(now), d7 = addDays(now, 7), d30 = addDays(now, 30)
  const [qs, qe] = quarterRange(now)
  type Acc = { high: number; mid: number; low: number; pids: Set<string> }
  const mk = (): Acc => ({ high: 0, mid: 0, low: 0, pids: new Set() })
  const w7 = mk(), w30 = mk(), wq = mk()
  const bump = (acc: Acc, pr: 'high' | 'mid' | 'low', pid: string) => { acc[pr]++; acc.pids.add(pid) }
  for (const p of ps) {
    for (const it of p.nodes) {
      if ((it.actualDate ?? '').trim()) continue
      const pd = (it.planDate ?? '').slice(0, 10)
      if (!pd) continue
      const pr = prOf(it)
      if (pd >= today && pd <= d7) bump(w7, pr, p.projectId)
      if (pd >= today && pd <= d30) bump(w30, pr, p.projectId)
      if (pd >= qs && pd <= qe) bump(wq, pr, p.projectId)
    }
  }
  const fin = (a: Acc): ReminderWindow => ({ high: a.high, mid: a.mid, low: a.low, projectCount: a.pids.size })
  return { windows: { '7d': fin(w7), '30d': fin(w30), quarter: fin(wq) } }
}

// ---- 终验完成情况（B 图）----
export interface FinalAcceptStats { periods: string[]; planCount: number[]; actualCount: number[]; planAmountWan: number[]; actualAmountWan: number[] }
/** 按项目计:终验 planDate 优先、缺则服务完成 planDate 落计划桶;终验或服务完成 actualDate 任一非空→实际完成;金额=contract÷1e4。 */
export function finalAcceptStats(ps: MilestoneProject[], gran: 'quarter' | 'month', year: number | null = null): FinalAcceptStats {
  const planC: Record<string, number> = {}, actC: Record<string, number> = {}, planA: Record<string, number> = {}, actA: Record<string, number> = {}
  const keys = new Set<string>()
  for (const p of ps) {
    const fin = nodeByName(p, '终验'), svc = nodeByName(p, '服务完成')
    const planDate = ((fin?.planDate || svc?.planDate) ?? '').slice(0, 10)
    if (!planDate) continue
    if (year != null && parseInt(planDate.slice(0, 4), 10) !== year) continue
    const k = periodKey(planDate, gran)
    keys.add(k)
    planC[k] = (planC[k] || 0) + 1
    planA[k] = (planA[k] || 0) + p.contract / 10000
    if ((fin?.actualDate ?? '').trim() || (svc?.actualDate ?? '').trim()) {
      actC[k] = (actC[k] || 0) + 1
      actA[k] = (actA[k] || 0) + p.contract / 10000
    }
  }
  const periods = [...keys].sort()
  return {
    periods,
    planCount: periods.map((k) => planC[k] || 0),
    actualCount: periods.map((k) => actC[k] || 0),
    planAmountWan: periods.map((k) => +(planA[k] || 0).toFixed(2)),
    actualAmountWan: periods.map((k) => +(actA[k] || 0).toFixed(2)),
  }
}

// ---- 可选年份 ----
export function availableYears(ps: MilestoneProject[], scope: 'finalAccept' | 'node'): number[] {
  const ys = new Set<number>()
  for (const p of ps) {
    if (scope === 'finalAccept') {
      const fin = nodeByName(p, '终验'), svc = nodeByName(p, '服务完成')
      const y = ((fin?.planDate || svc?.planDate) ?? '').slice(0, 4)
      if (y) ys.add(parseInt(y, 10))
    } else {
      for (const n of p.nodes) {
        if (!distSeriesOf(n)) continue
        const y = (n.planDate ?? '').slice(0, 4)
        if (y) ys.add(parseInt(y, 10))
      }
    }
  }
  return [...ys].filter((y) => !Number.isNaN(y)).sort((a, b) => a - b)
}

// ---- 节点分布系列判定（B/E 共用；E 图与下钻在 Task 3）----
export type DistSeries = 'arrival' | 'firstAccept' | 'finalAccept' | 'serviceDone'
/** 到货/初验需 payStage 非空(关联回款);终验/服务完成只需名称匹配。 */
export function distSeriesOf(n: MilestoneItem): DistSeries | null {
  const name = n.name ?? ''
  const hasPay = !!((n as any).payStage && String((n as any).payStage).trim())
  if (name.includes('到货') && hasPay) return 'arrival'
  if (name.includes('初验') && hasPay) return 'firstAccept'
  if (name.includes('终验')) return 'finalAccept'
  if (name.includes('服务完成')) return 'serviceDone'
  return null
}
