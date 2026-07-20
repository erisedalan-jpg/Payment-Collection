import { isDateKey, excelDate } from './cellFormat'
import { pct } from './format'

export interface ColFilter {
  value: string[]
}
export type TableFilters = Record<string, ColFilter>

const RATIO_KEYS = new Set(['planPaymentRatio', 'paymentRatio', 'actualPaymentRatio', 'projectCompletion'])

/** 忠实移植 CF.formatValue：把单元格原始值转为筛选枚举用的展示字符串（空值→'空值'）。 */
export function cfFormatValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === '') return '空值'
  if (isDateKey(key)) {
    const ed = excelDate(val)
    if (ed) return ed
    if (typeof val === 'string' && /^\d{4}-\d{2}/.test(val)) return val.slice(0, 10)
  }
  if (val === true || val === 'true') return '是'
  if (val === false || val === 'false') return '否'
  if (RATIO_KEYS.has(key)) return pct(val)
  return String(val)
}

export interface UniqueValue {
  display: string
  raw: unknown
}

/** 列去重枚举：按展示值升序返回唯一值。忠实移植 showPopup 的 uvMap（后值覆盖）+ Object.keys().sort()。
 * riskReasons 列特例：摊平各条 category 为去重选项（而非把数组 String 化）。 */
export function cfUniqueValues(rows: Record<string, any>[], colKey: string): UniqueValue[] {
  if (colKey === 'riskReasons') {
    const set = new Set<string>()
    for (const r of rows) for (const rr of (r.riskReasons ?? [])) if (rr?.category) set.add(String(rr.category))
    return [...set].sort().map((display) => ({ display, raw: display }))
  }
  // 通用数组列(如标签 string[]、倚天「问题类型」string[]):元素级去重。放在 riskReasons 特例后。
  // 空数组/字段缺失 → 产出「空值」选项并置顶:标签筛选从工具栏下沉表头后,
  // 原 TagFilterSelect 的「无标签」选项靠这里补回(实测 638 个项目中 580 个无标签)。
  if (rows.some((r) => Array.isArray(r[colKey]))) {
    const set = new Set<string>()
    let hasEmpty = false
    for (const r of rows) {
      const v = r[colKey]
      if (Array.isArray(v) && v.length) for (const item of v) set.add(String(item))
      else hasEmpty = true
    }
    const vals = [...set].sort().map((display) => ({ display, raw: display }))
    return hasEmpty ? [{ display: '空值', raw: '' }, ...vals] : vals
  }
  const uvMap: Record<string, unknown> = {}
  for (const r of rows) {
    const v = r[colKey]
    uvMap[cfFormatValue(colKey, v)] = v
  }
  return Object.keys(uvMap)
    .sort()
    .map((display) => ({ display, raw: uvMap[display] }))
}

/** 忠实移植 CF.filterData 的 enum 分支：选中值与展示值或原值字符串任一相等即保留；多列取交集。 */
export function applyColumnFilters(
  rows: Record<string, any>[],
  filters: TableFilters | undefined,
): Record<string, any>[] {
  if (!filters) return rows
  const keys = Object.keys(filters)
  if (!keys.length) return rows
  return rows.filter((row) => {
    for (const ck of keys) {
      const sel = filters[ck].value
      if (ck === 'riskReasons') {
        const cats = ((row.riskReasons ?? []) as { category?: string }[]).map((rr) => rr.category)
        if (!sel.some((c) => cats.includes(c))) return false
        continue
      }
      const cv0 = row[ck]
      if (Array.isArray(cv0)) {
        if (!cv0.length) {
          // 空数组只被「空值」命中(与非数组列的空值语义一致)
          if (!sel.includes('空值')) return false
          continue
        }
        const strs = cv0.map((x) => String(x))
        if (!sel.some((s) => strs.includes(s))) return false
        continue
      }
      const cv = cv0
      const fv = cfFormatValue(ck, cv)
      let match = false
      for (const s of sel) {
        if (fv === s || String(cv) === s) {
          match = true
          break
        }
      }
      if (!match) return false
    }
    return true
  })
}
