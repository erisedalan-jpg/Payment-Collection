import type { YitianData, YitianEntry } from '@/types/yitian'
import { NO_L4, rosterL4Map, selectEntries, selectRoster } from './metrics'

// TOP1000 支持只看客户类工时;跨 BG 只看项目类/售前类(与原工具口径一致)
const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']
const BG_TYPES = ['项目类', '售前类']

export interface Top1000Row {
  l4: string
  hours: number
  topHours: number
  pct: number          // TOP1000 工时占比(小数)
  topCustomers: number // 产生工时的 TOP1000 客户数(去重)
}

export interface BgSupport {
  thisBg: number
  crossBg: number
  thisPct: number
  crossPct: number
  total: number
}

function typeNameOf(data: YitianData, e: YitianEntry): string {
  return e.t === null || e.t === undefined ? '' : (data.dims.types[e.t] ?? '')
}

/** TOP1000 大客户支持:按花名册 L4 分组(废弃原工具写死的 13 组织清单 + 模糊匹配)。 */
export function top1000ByL4(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): Top1000Row[] {
  const l4Of = rosterL4Map(data)
  const acc = new Map<string, { hours: number; topHours: number; custs: Set<number> }>()

  // 花名册里的 L4 先全部建桶——零工时的组也要露面(那正是"这个组没投入 TOP1000"的信号)。
  // 空 L4 兜底为 NO_L4,否则这些人的工时会被 acc.get() 落空直接丢掉。
  for (const p of selectRoster(data, l4s)) {
    const name = p.l4 || NO_L4
    if (!acc.has(name)) acc.set(name, { hours: 0, topHours: 0, custs: new Set() })
  }

  for (const e of selectEntries(data, start, end, l4s)) {
    if (!CUSTOMER_TYPES.includes(typeNameOf(data, e))) continue
    const l4 = l4Of[e.e] ?? ''
    const b = acc.get(l4)
    if (!b) continue
    b.hours += e.h
    if (e.top) {
      b.topHours += e.h
      if (e.cu !== null && e.cu !== undefined) b.custs.add(e.cu)
    }
  }

  return [...acc.entries()]
    .map(([l4, b]) => ({
      l4,
      hours: b.hours,
      topHours: b.topHours,
      pct: b.hours > 0 ? b.topHours / b.hours : 0,
      topCustomers: b.custs.size,
    }))
    .sort((a, b) => b.topHours - a.topHours)
}

/** 跨 BG 支持:本 BG = 销售L2组织 ∈ meta.thisBgL2(常量随数据下发,前端不另维护一份)。 */
export function bgSupport(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): BgSupport {
  const own = new Set(data.meta.thisBgL2 ?? [])
  let thisBg = 0
  let crossBg = 0

  for (const e of selectEntries(data, start, end, l4s)) {
    if (!BG_TYPES.includes(typeNameOf(data, e))) continue
    const org = e.bg === null || e.bg === undefined ? '' : (data.dims.salesL2[e.bg] ?? '')
    if (own.has(org)) thisBg += e.h
    else crossBg += e.h
  }

  const total = thisBg + crossBg
  return {
    thisBg,
    crossBg,
    total,
    thisPct: total > 0 ? thisBg / total : 0,
    crossPct: total > 0 ? crossBg / total : 0,
  }
}
