import type { YitianData, YitianEntry } from '@/types/yitian'
import { NO_L4 } from './metrics'
// 只需筛选条件的类型:三个 rows 版函数由调用方先跑 selectCpEntries 选好客户类工时再传进来
import type { CpFilter } from './customerProduct'

const PRESALE_HINT_CODE = 'HINT_PRESALE_PRODUCT'

function dv(arr: string[], i: number | null | undefined): string {
  return i === null || i === undefined ? '' : (arr[i] ?? '')
}

export interface PresaleHintRow { l4: string; count: number; hours: number }

/** B-5① 售前服务类工时未关联产品(产品线为「其他」)。
 *  **判定不新写规则** —— 直接读既有合规码 HINT_PRESALE_PRODUCT。合规检查页看的是
 *  「单条工时填得合不合规」,本块看的是「这类填报习惯的总量」,同源不同视角。 */
export function presaleHintByL4(data: YitianData, f: CpFilter): PresaleHintRow[] {
  const l4Of = new Map(data.roster.map((p) => [p.id, p.l4 || NO_L4]))
  const l4Set = new Set(f.l4s)
  const acc = new Map<string, { c: number; h: number }>()
  for (const it of data.issues) {
    if (!it.codes.includes(PRESALE_HINT_CODE)) continue
    // i 是【全量 entries】的原始下标,必须直接下标取,不能先过滤再取(下标会失配)
    const e = data.entries[it.i]
    if (!e) continue
    if (f.start && e.d < f.start) continue
    if (f.end && e.d > f.end) continue
    const l4 = l4Of.get(e.e) ?? NO_L4
    if (l4Set.size && !l4Set.has(l4)) continue
    const a = acc.get(l4) ?? { c: 0, h: 0 }
    a.c += 1
    a.h += e.h
    acc.set(l4, a)
  }
  return [...acc.entries()]
    .map(([l4, a]) => ({ l4, count: a.c, hours: a.h }))
    .sort((x, y) => y.hours - x.hours || x.l4.localeCompare(y.l4))
}

export interface UnattributedRow { workType3: string; count: number; hours: number }

/** B-5② 客户不可归属(tr===0):客户字段为空或填了占位词,导致该条工时无法归属真实客户,
 *  客户象限判不出 → 「可转移非原厂」对这批工时是结论盲区。按工作类型三拆分看填报习惯。 */
export function unattributedByWorkType(
  data: YitianData, rows: YitianEntry[],
): UnattributedRow[] {
  const acc = new Map<string, { c: number; h: number }>()
  for (const e of rows) {
    if (e.tr !== 0) continue
    const w = dv(data.dims.workTypes, e.wt) || '(空)'
    const a = acc.get(w) ?? { c: 0, h: 0 }
    a.c += 1
    a.h += e.h
    acc.set(w, a)
  }
  return [...acc.entries()]
    .map(([workType3, a]) => ({ workType3, count: a.c, hours: a.h }))
    .sort((x, y) => y.hours - x.hours || x.workType3.localeCompare(y.workType3))
}

export interface CalibStat {
  raw: number
  calibrated: number
  ambiguous: number
  unmatched: number
  pending: number
  rate: number | null
}

/** B-5③ 产品线校准覆盖率。待校准 = calibrated + ambiguous + unmatched(即产品线原本为空/其他的)。
 *  分母为 0 → rate 为 null(显 "-"),不得返回 0 —— 「没有待校准记录」与「一条都没校准成功」
 *  是两回事。 */
export function calibStat(data: YitianData, rows: YitianEntry[]): CalibStat {
  const c = [0, 0, 0, 0]
  for (const e of rows) {
    if (e.ls >= 0 && e.ls <= 3) c[e.ls] += 1
  }
  const pending = c[1] + c[2] + c[3]
  return {
    raw: c[0], calibrated: c[1], ambiguous: c[2], unmatched: c[3],
    pending, rate: pending > 0 ? c[1] / pending : null,
  }
}

export interface PmShareRow { name: string; total: number; pm: number; share: number | null }

/** B-6 项目管理工时占比。分母 = 客户类工时,分子 = pm 标签为真。
 *  分母为 0 → share 为 null;分子为 0 而分母有值 → 0(真的 0%)。两者不可混。 */
export function pmShare(
  data: YitianData, rows: YitianEntry[], level: 'l4' | 'emp',
): PmShareRow[] {
  const l4Of = new Map(data.roster.map((p) => [p.id, p.l4 || NO_L4]))
  const nameOf = new Map(data.roster.map((p) => [p.id, p.name || p.id]))
  const acc = new Map<string, { t: number; p: number }>()
  for (const e of rows) {
    const key = level === 'l4' ? (l4Of.get(e.e) ?? NO_L4) : (nameOf.get(e.e) ?? e.e)
    const a = acc.get(key) ?? { t: 0, p: 0 }
    a.t += e.h
    if (e.pm) a.p += e.h
    acc.set(key, a)
  }
  return [...acc.entries()]
    .map(([name, a]) => ({
      name, total: a.t, pm: a.p, share: a.t > 0 ? a.p / a.t : null,
    }))
    // 占比降序;相同则按名称升序,保证顺序稳定(否则断言会随机红)
    .sort((x, y) => (y.share ?? -1) - (x.share ?? -1) || x.name.localeCompare(y.name))
}
