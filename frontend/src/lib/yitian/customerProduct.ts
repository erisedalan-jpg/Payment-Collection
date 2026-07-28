import type { YitianData, YitianEntry } from '@/types/yitian'
import { NO_L4 } from './metrics'

/** 六块统一只看客户类工时(与后端 transferable 判定口径一致)。 */
const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']
const NO_QUAD = '(未匹配)'
const NO_CUSTOMER = '(未填客户)'
const NO_BG = '(未标BG)'

export interface CpFilter {
  start: string
  end: string
  l4s: string[]
  prodCats: string[]
  types: string[]
  mgrMode: 'all' | 'only' | 'exclude'
}

function dv(arr: string[], i: number | null | undefined): string {
  return i === null || i === undefined ? '' : (arr[i] ?? '')
}

/** 象限统一取前两字符:「M1 战略核心区」→「M1」。后半段是描述文案、随时会被业务改字。 */
export function quadOf(data: YitianData, e: YitianEntry): string {
  const q = dv(data.dims.custQuads, e.cq).trim()
  return q ? q.slice(0, 2) : NO_QUAD
}

export function selectCpEntries(data: YitianData, f: CpFilter): YitianEntry[] {
  const l4Of = new Map(data.roster.map((p) => [p.id, p.l4 || NO_L4]))
  const mgrOf = new Map(data.roster.map((p) => [p.id, !!p.isMgr]))
  const l4Set = new Set(f.l4s)
  const catSet = new Set(f.prodCats)
  const typeSet = new Set(f.types)
  return data.entries.filter((e) => {
    const t = dv(data.dims.types, e.t)
    if (!CUSTOMER_TYPES.includes(t)) return false
    if (f.start && e.d < f.start) return false
    if (f.end && e.d > f.end) return false
    if (l4Set.size && !l4Set.has(l4Of.get(e.e) ?? NO_L4)) return false
    if (typeSet.size && !typeSet.has(t)) return false
    if (catSet.size && !catSet.has(dv(data.dims.prodCats, e.ec))) return false
    if (f.mgrMode === 'only' && !mgrOf.get(e.e)) return false
    if (f.mgrMode === 'exclude' && mgrOf.get(e.e)) return false
    return true
  })
}

/** 三个类型列的累加:返回下标 0/1/2 对应 项目类/售前类/售后类,其它类型返回 -1。 */
function typeIdx(t: string): number {
  return CUSTOMER_TYPES.indexOf(t)
}

export interface CustSupportRow {
  custClass: string
  quad: string
  customers: number
  hours: number
  project: number
  presale: number
  postsale: number
}

export function custSupport(data: YitianData, rows: YitianEntry[]): CustSupportRow[] {
  const acc = new Map<string, { custs: Set<string>; h: number; t: number[] }>()
  for (const e of rows) {
    const cls = e.top ? 'TOP1000' : '非TOP1000'
    const quad = quadOf(data, e)
    const key = cls + '|' + quad
    let a = acc.get(key)
    if (!a) { a = { custs: new Set(), h: 0, t: [0, 0, 0] }; acc.set(key, a) }
    const c = dv(data.dims.customers, e.cu)
    if (c) a.custs.add(c)
    a.h += e.h
    const i = typeIdx(dv(data.dims.types, e.t))
    if (i >= 0) a.t[i] += e.h
  }
  return [...acc.entries()]
    .map(([key, a]) => {
      const [custClass, quad] = key.split('|')
      return {
        custClass, quad, customers: a.custs.size, hours: a.h,
        project: a.t[0], presale: a.t[1], postsale: a.t[2],
      }
    })
    // TOP1000 在前、象限升序;非TOP1000 恒末位
    .sort((x, y) => (x.custClass === y.custClass
      ? x.quad.localeCompare(y.quad)
      : (x.custClass === 'TOP1000' ? -1 : 1)))
}

export interface CustListRow {
  customer: string
  custClass: string
  quad: string
  hours: number
  project: number
  presale: number
  postsale: number
  topProducts: string
}

/** 主要支持产品:按工时类型分组、组内按工时降序各取前 3 个产品大类。 */
function topProductsText(byType: Map<string, Map<string, number>>): string {
  const parts: string[] = []
  for (const t of CUSTOMER_TYPES) {
    const m = byType.get(t)
    if (!m || !m.size) continue
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0])
    parts.push(`${t}: ${top.join('/')}`)
  }
  return parts.join('；')
}

export function custList(data: YitianData, rows: YitianEntry[], topN: number): CustListRow[] {
  const acc = new Map<string, {
    cls: string; quad: string; h: number; t: number[]; byType: Map<string, Map<string, number>>
  }>()
  for (const e of rows) {
    const name = dv(data.dims.customers, e.cu) || NO_CUSTOMER
    let a = acc.get(name)
    if (!a) {
      a = { cls: e.top ? 'TOP1000' : '非TOP1000', quad: quadOf(data, e), h: 0, t: [0, 0, 0],
            byType: new Map() }
      acc.set(name, a)
    }
    a.h += e.h
    const t = dv(data.dims.types, e.t)
    const i = typeIdx(t)
    if (i >= 0) a.t[i] += e.h
    const cat = dv(data.dims.prodCats, e.ec)
    if (cat) {
      let m = a.byType.get(t)
      if (!m) { m = new Map(); a.byType.set(t, m) }
      m.set(cat, (m.get(cat) ?? 0) + e.h)
    }
  }
  return [...acc.entries()]
    .map(([customer, a]) => ({
      customer, custClass: a.cls, quad: a.quad, hours: a.h,
      project: a.t[0], presale: a.t[1], postsale: a.t[2],
      topProducts: topProductsText(a.byType),
    }))
    .sort((x, y) => y.hours - x.hours)
    .slice(0, topN)
}

export interface CoverageRow {
  bg: string
  named: number
  supported: number
  coverage: number | null
  hours: number
  project: number
  presale: number
  postsale: number
}

export function top1000Coverage(data: YitianData, rows: YitianEntry[]): CoverageRow[] {
  const named = data.meta.top1000Named ?? {}
  const acc = new Map<string, { custs: Set<string>; h: number; t: number[] }>()
  // 先按清单建桶:指名了却零支持的 BG 也必须出现在表里,否则覆盖率表会漏掉最该看的那几行
  for (const bg of Object.keys(named)) {
    acc.set(bg, { custs: new Set(), h: 0, t: [0, 0, 0] })
  }
  for (const e of rows) {
    if (!e.top) continue                       // 覆盖率只看 TOP1000 客户
    const bg = dv(data.dims.custBgs, e.cbg) || NO_BG
    let a = acc.get(bg)
    if (!a) { a = { custs: new Set(), h: 0, t: [0, 0, 0] }; acc.set(bg, a) }
    const c = dv(data.dims.customers, e.cu)
    if (c) a.custs.add(c)
    a.h += e.h
    const i = typeIdx(dv(data.dims.types, e.t))
    if (i >= 0) a.t[i] += e.h
  }
  return [...acc.entries()]
    .map(([bg, a]) => {
      const n = named[bg] ?? 0
      return {
        bg, named: n, supported: a.custs.size,
        // 分母缺失 → null(前端显 "-");分母有值、分子为 0 → 0(那是真的 0%,两者不能混)
        coverage: n > 0 ? a.custs.size / n : null,
        hours: a.h, project: a.t[0], presale: a.t[1], postsale: a.t[2],
      }
    })
    .sort((x, y) => y.named - x.named || x.bg.localeCompare(y.bg))
}

export interface Matrix {
  rows: string[]
  cols: string[]
  cells: number[][]
  rowTotals: number[]
  colTotals: number[]
  total: number
}

/** 通用矩阵构建。列顺序恒取 dims.prodCats 原序 —— 该码表由后端按首次出现顺序生成、
 *  ec 下标即该序(yitian.py `_Dim`),前端一律不重排:顺序归后端管,前端各自重排会让本页
 *  列序与全站其它倚天页面不一致。要改列序应改后端码表,不是在这里 sort。 */
function buildMatrix(
  data: YitianData, rows: YitianEntry[], rowKeyOf: (e: YitianEntry) => string,
): Matrix {
  const cols = [...data.dims.prodCats]
  const colIdx = new Map(cols.map((c, i) => [c, i]))
  const acc = new Map<string, number[]>()
  for (const e of rows) {
    const rk = rowKeyOf(e)
    const ci = colIdx.get(dv(data.dims.prodCats, e.ec))
    if (ci === undefined) continue          // 无产品大类的行不进热力图(实测为 0 行)
    let arr = acc.get(rk)
    if (!arr) { arr = new Array(cols.length).fill(0); acc.set(rk, arr) }
    arr[ci] += e.h
  }
  const rowKeys = [...acc.keys()].sort()
  const cells = rowKeys.map((k) => acc.get(k) as number[])
  const rowTotals = cells.map((r) => r.reduce((a, b) => a + b, 0))
  const colTotals = cols.map((_, ci) => cells.reduce((s, r) => s + r[ci], 0))
  return {
    rows: rowKeys, cols, cells, rowTotals, colTotals,
    total: rowTotals.reduce((a, b) => a + b, 0),
  }
}

/** B-4:客户分类分级 x 产品大类。行键形如「TOP1000 · M1」。 */
export function custClassProductMatrix(data: YitianData, rows: YitianEntry[]): Matrix {
  return buildMatrix(data, rows, (e) =>
    `${e.top ? 'TOP1000' : '非TOP1000'} · ${quadOf(data, e)}`)
}

/** A-2:L4 组织 x 产品大类。回答「哪个组在做哪类产品」,与 B-4 的「哪档客户消耗哪类产品」不同问。 */
export function orgProductMatrix(data: YitianData, rows: YitianEntry[]): Matrix {
  const l4Of = new Map(data.roster.map((p) => [p.id, p.l4 || NO_L4]))
  return buildMatrix(data, rows, (e) => l4Of.get(e.e) ?? NO_L4)
}

export interface CrossRow { customer: string; cells: number[]; total: number }

/** A-4:客户 x 产品大类交叉。实测 953 个客户,坐标轴放不下,固定取工时前 topN。 */
export function custProductCross(
  data: YitianData, rows: YitianEntry[], topN: number,
): { cols: string[]; rows: CrossRow[] } {
  const m = buildMatrix(data, rows, (e) => dv(data.dims.customers, e.cu) || NO_CUSTOMER)
  const idx = m.rows.map((_, i) => i).sort((a, b) => m.rowTotals[b] - m.rowTotals[a])
  return {
    cols: m.cols,
    rows: idx.slice(0, topN).map((i) => ({
      customer: m.rows[i], cells: m.cells[i], total: m.rowTotals[i],
    })),
  }
}
