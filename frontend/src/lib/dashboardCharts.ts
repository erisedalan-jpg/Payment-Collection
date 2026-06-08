import type { RawNode } from '@/types/analysis'
import { pctToNum } from './format'
import { groupByProject } from './dashboardStats'

const TIER_KEYS = ['100万以上', '50-100万', '50万以下'] as const

function remaining(n: Record<string, any>): number {
  return (n.expectedPayment || 0) - (n.actualPayment || 0)
}

function pendingNodes(nodes: RawNode[]): RawNode[] {
  return nodes.filter((raw) => {
    const n = raw as Record<string, any>
    if (!n.isPaymentRelated) return false
    const ar = pctToNum(n.actualPaymentRatio)
    return ar === null || ar < 1
  })
}

export interface PeriodSeries {
  categories: string[]
  series: { tier: string; data: number[] }[]
}

function isSpecificYear(filterYear: string): boolean {
  return filterYear !== 'all' && !filterYear.startsWith('upto') && !filterYear.includes('-Q')
}

function quarterOf(planMonth: string): string {
  const [y, moStr] = planMonth.split('-')
  const mo = parseInt(moStr, 10)
  const q = mo <= 3 ? 'Q1' : mo <= 6 ? 'Q2' : mo <= 9 ? 'Q3' : 'Q4'
  return `${y}-${q}`
}

function buildPeriodSeries(
  nodes: RawNode[],
  keyOf: (planMonth: string) => string,
  fillKeys: string[],
): PeriodSeries {
  const byTier: Record<string, Record<string, number>> = {}
  TIER_KEYS.forEach((t) => (byTier[t] = {}))
  const catSet: Record<string, true> = {}
  for (const raw of pendingNodes(nodes)) {
    const n = raw as Record<string, any>
    const m = n.planMonth
    if (!m) continue
    const k = keyOf(m)
    const tier = n.tier as string
    if (!byTier[tier]) byTier[tier] = {}
    byTier[tier][k] = (byTier[tier][k] || 0) + remaining(n) / 10000
    catSet[k] = true
  }
  for (const k of fillKeys) {
    catSet[k] = true
    TIER_KEYS.forEach((t) => { if (byTier[t][k] === undefined) byTier[t][k] = 0 })
  }
  const categories = Object.keys(catSet).sort()
  return {
    categories,
    series: TIER_KEYS.map((t) => ({ tier: t, data: categories.map((c) => byTier[t][c] || 0) })),
  }
}

export function aggregateQuarterly(nodes: RawNode[], filterYear: string): PeriodSeries {
  const fill = isSpecificYear(filterYear) ? ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => `${filterYear}-${q}`) : []
  return buildPeriodSeries(nodes, quarterOf, fill)
}

export function aggregateMonthly(nodes: RawNode[], filterYear: string): PeriodSeries {
  const fill = isSpecificYear(filterYear)
    ? Array.from({ length: 12 }, (_, i) => `${filterYear}-${String(i + 1).padStart(2, '0')}`)
    : []
  return buildPeriodSeries(nodes, (m) => m, fill)
}

export interface OrgRank {
  org: string
  expectedTotal: number
  actualTotal: number
  actualTotalWan: number
  achievementRate: number
}

export function rankByOrg(
  nodes: RawNode[],
  tierFilter: string,
  sortBy: 'actualTotal' | 'achievementRate',
): OrgRank[] {
  let ns = nodes.filter((n) => (n as Record<string, any>).isPaymentRelated)
  if (tierFilter) ns = ns.filter((n) => n.tier === tierFilter)
  const m: Record<string, OrgRank> = {}
  for (const raw of ns) {
    const n = raw as Record<string, any>
    const org = n.orgL4 || '未指定'
    if (!m[org]) m[org] = { org, expectedTotal: 0, actualTotal: 0, actualTotalWan: 0, achievementRate: 0 }
    m[org].expectedTotal += n.expectedPayment || 0
    m[org].actualTotal += n.actualPayment || 0
  }
  const list = Object.values(m).map((o) => ({
    ...o,
    achievementRate: o.expectedTotal > 0 ? o.actualTotal / o.expectedTotal : 0,
    actualTotalWan: o.actualTotal / 10000,
  }))
  return list.sort((a, b) => b[sortBy] - a[sortBy])
}

export interface DelayedProject {
  projectId: string
  projectName: string
  orgL4: string
  tier: string
  maxDelay: number
  remainingAmount: number
}

export function delayedTopProjects(
  nodes: RawNode[],
  limit = 10,
  sortBy: 'delay' | 'amount' = 'delay',
): DelayedProject[] {
  const projs = groupByProject(nodes).filter((p) => p.paymentStatus === '延期')
  const withDelay = projs.map((p) => {
    let maxDelay = 0
    for (const n of p.nodes) {
      const d = (n as Record<string, any>).delayDays || 0
      if (d > maxDelay) maxDelay = d
    }
    return {
      projectId: p.projectId,
      projectName: p.projectName,
      orgL4: p.orgL4,
      tier: p.tier,
      maxDelay,
      remainingAmount: p.remainingAmount,
    }
  })
  withDelay.sort((a, b) =>
    sortBy === 'amount' ? b.remainingAmount - a.remainingAmount : b.maxDelay - a.maxDelay,
  )
  return withDelay.slice(0, limit)
}
