import type { YitianData, YitianEntry, YitianRosterItem } from '@/types/yitian'
import { workdayCount } from './calendar'

export interface EmpStat {
  id: string
  name: string
  l3: string
  l31: string
  l4: string
  hours: number
  base: number
  sat: number | null      // 饱和度(小数);基础工时为 0 → null
  diff: number            // 实际 − 基础(正=加班,负=欠填)
  filled: boolean         // 区间内是否有任何工时记录
}

export interface TypeHour {
  type: string
  hours: number
  pct: number
}

export interface OrgRow {
  level: 'l3' | 'l31' | 'l4'
  name: string
  parent: string
  hours: number
  people: number
  base: number
  sat: number | null
}

export interface Kpi {
  totalHours: number
  avgSat: number | null
  avgSatFilled: number | null
  unfilledCount: number
  neverFilledCount: number
  overtimeCount: number
  overtimeHours: number
  complianceRate: number | null
  issueCount: number
  baseHours: number
}

/** 花名册里 L3/L3-1/L4 为空的人的兜底分组名。
 *  实测 85 人里有 L3-1/L4 为空且有工时的人——按空串分组会被 orgSummary 的 bump() 空名守卫吞掉,
 *  导致该层合计对不上上一层合计(如 L3-1 合计 < L3 合计)。三层统一兜底,永不落空串。 */
export const NO_L3 = '未分配L3'
export const NO_L31 = '未分配L3-1'
export const NO_L4 = '未分配L4'

/** 工号 → L4(组织权威是花名册,不是工时表;空 L4 兜底为 NO_L4)。 */
export function rosterL4Map(data: YitianData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of data.roster) out[p.id] = p.l4 || NO_L4
  return out
}

/** L4 筛选后的花名册。l4s 为空 = 不筛。 */
export function selectRoster(data: YitianData, l4s: string[] = []): YitianRosterItem[] {
  if (!l4s.length) return data.roster
  const allow = new Set(l4s)
  return data.roster.filter((p) => allow.has(p.l4 || NO_L4))
}

/** 区间 + L4 筛选后的工时行。 */
export function selectEntries(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): YitianEntry[] {
  const allow = new Set(l4s)
  const l4Of = rosterL4Map(data)
  return data.entries.filter((e) => {
    if (start && e.d < start) return false
    if (end && e.d > end) return false
    if (allow.size && !allow.has(l4Of[e.e] ?? '')) return false
    return true
  })
}

/** 人均基础工时 = 区间工作日数 × meta.hoursPerDay。 */
export function baseHours(data: YitianData, start: string, end: string): number {
  return workdayCount(data.days, start, end) * (data.meta.hoursPerDay || 8)
}

/** 员工级统计。覆盖花名册全员——零记录的人也要出现(那正是"完全未填"清单的来源)。 */
export function empStats(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): EmpStat[] {
  const base = baseHours(data, start, end)
  const hours: Record<string, number> = {}
  for (const e of selectEntries(data, start, end, l4s)) {
    hours[e.e] = (hours[e.e] ?? 0) + e.h      // 实际工时含全部工时类型
  }
  return selectRoster(data, l4s).map((p) => {
    const h = hours[p.id] ?? 0
    return {
      id: p.id,
      name: p.name,
      l3: p.l3 || NO_L3,
      l31: p.l31 || NO_L31,   // 空 L3-1 兜底,否则该层合计对不上 L3 合计(40h 会凭空消失)
      l4: p.l4 || NO_L4,   // 空 L4 兜底,否则 L3 合计对不上各 L4 之和
      hours: h,
      base,
      sat: base > 0 ? h / base : null,
      diff: h - base,
      filled: p.id in hours,
    }
  })
}

/** 工时类型占比(含管理类/业务类/假期类)。 */
export function typeHours(data: YitianData, entries: YitianEntry[]): TypeHour[] {
  const types = data.dims.types
  const acc: Record<string, number> = {}
  let total = 0
  for (const e of entries) {
    const name = e.t === null || e.t === undefined ? '未知' : (types[e.t] ?? '未知')
    acc[name] = (acc[name] ?? 0) + e.h
    total += e.h
  }
  return Object.entries(acc)
    .map(([type, hrs]) => ({ type, hours: hrs, pct: total > 0 ? hrs / total : 0 }))
    .sort((a, b) => b.hours - a.hours)
}

/** 该行是否计入合规率(工时类型不在超管配置的剔除清单里)。
 *  注意:被剔除的类型仍进工时统计(总工时/饱和度/类型占比),剔除只作用于合规率分子分母。 */
export function isIncluded(data: YitianData, e: YitianEntry, excludedTypes: string[]): boolean {
  const name = e.t === null || e.t === undefined ? '' : (data.dims.types[e.t] ?? '')
  return !excludedTypes.includes(name)
}

/** 合规率 = 纳入范围且 ok<=1 的行数 ÷ 纳入范围的行数。分母口径由超管配置决定。 */
export function complianceRate(
  data: YitianData, entries: YitianEntry[], excludedTypes: string[],
): number | null {
  const inc = entries.filter((e) => isIncluded(data, e, excludedTypes))
  if (!inc.length) return null
  return inc.filter((e) => e.ok <= 1).length / inc.length
}

/** L3 → L3-1 → L4 三层汇总。人数取花名册(不是"有记录的人数")。零记录的组也保留。 */
export function orgSummary(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): OrgRow[] {
  const base = baseHours(data, start, end)
  const stats = empStats(data, start, end, l4s)
  const buckets = new Map<string, { level: OrgRow['level']; name: string; parent: string; hours: number; people: number }>()

  const bump = (level: OrgRow['level'], name: string, parent: string, hrs: number) => {
    // 桶键含 parent:同名但不同上级(如两个不同 L3-1 下各自的「未分配L4」)不得合桶,
    // 否则 parent 只会记首次插入值,把工时错记到错误的上级组织名下。
    // empStats 已把 l3/l31/l4 全兜底为非空串,这里不再需要空名守卫。
    const k = level + '|' + parent + '|' + name
    const b = buckets.get(k)
    if (!b) buckets.set(k, { level, name, parent, hours: hrs, people: 1 })
    else {
      b.hours += hrs
      b.people += 1
    }
  }

  for (const s of stats) {
    bump('l3', s.l3, '', s.hours)
    bump('l31', s.l31, s.l3, s.hours)
    bump('l4', s.l4, s.l31, s.hours)
  }

  return [...buckets.values()].map((b) => {
    const orgBase = base * b.people
    return { ...b, base: orgBase, sat: orgBase > 0 ? b.hours / orgBase : null }
  })
}

/** 饱和度榜(降序),取前 n。 */
export function saturationTop(stats: EmpStat[], n = 10): EmpStat[] {
  return [...stats].sort((a, b) => b.hours - a.hours).slice(0, n)
}

/** 未按时填写:有记录但欠填。 */
export function unfilledList(stats: EmpStat[]): EmpStat[] {
  return stats.filter((s) => s.filled && s.diff < 0).sort((a, b) => a.diff - b.diff)
}

/** 完全未填:区间内一条记录都没有(原工具的盲区)。 */
export function neverFilledList(stats: EmpStat[]): EmpStat[] {
  return stats.filter((s) => !s.filled)
}

export function kpi(
  data: YitianData, start: string, end: string, l4s: string[] = [], excludedTypes: string[] = [],
): Kpi {
  const entries = selectEntries(data, start, end, l4s)
  const stats = empStats(data, start, end, l4s)
  const base = baseHours(data, start, end)

  const totalHours = entries.reduce((s, e) => s + e.h, 0)
  const sumBase = stats.reduce((s, x) => s + x.base, 0)
  const sumFilled = stats.reduce((s, x) => s + Math.max(x.hours, x.base), 0)
  const overtime = stats.filter((s) => s.diff > 0)

  return {
    totalHours,
    avgSat: sumBase > 0 ? totalHours / sumBase : null,
    avgSatFilled: sumBase > 0 ? sumFilled / sumBase : null,
    unfilledCount: unfilledList(stats).length + neverFilledList(stats).length,
    neverFilledCount: neverFilledList(stats).length,
    overtimeCount: overtime.length,
    overtimeHours: overtime.reduce((s, x) => s + x.diff, 0),
    complianceRate: complianceRate(data, entries, excludedTypes),
    issueCount: entries.filter((e) => isIncluded(data, e, excludedTypes) && e.ok === 2).length,
    baseHours: base,
  }
}
