// 重点商机跟进范围筛选:商机单表,条件直接作用于商机行字段(无子表 group)。
import { OPP_COLUMNS, type OppColumn } from './opportunityColumns'
import { leafMatch, type FieldKind } from './scopeOps'
import type { ScopeFilter, ScopeGroup, FieldLike } from './tempScope'

function kindOfType(t: OppColumn['type']): FieldKind {
  if (t === 'number') return 'number'
  if (t === 'date' || t === 'auto') return 'date'
  if (t === 'select' || t === 'derived') return 'enum'
  return 'text'
}

/** 字段目录从 OPP_COLUMNS 派生(单一来源):每列 → {key,label,kind}。 */
export const OPP_SCOPE_CATALOG: FieldLike[] = OPP_COLUMNS.map((c) => ({
  key: c.key, label: c.label, kind: kindOfType(c.type),
}))

function evalGroup(row: Record<string, any>, g: ScopeGroup): boolean {
  if (!g.conditions || !g.conditions.length) return false
  const rs = g.conditions.map((c) => leafMatch(row[c.field], c))
  return g.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}

/** 空范围(无 groups 或全空组)→ false。两级 AND/OR,叶子直接读 row[field]。 */
export function opportunityMatches(row: Record<string, any>, scope: ScopeFilter): boolean {
  if (!scope || !Array.isArray(scope.groups) || !scope.groups.length) return false
  const rs = scope.groups.map((g) => evalGroup(row, g))
  return scope.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}

/** 默认范围:TOP1000 & 提前介入 & 重点商机 & 状态非赢单。 */
export const DEFAULT_OPP_SCOPE: ScopeFilter = {
  combinator: 'AND',
  groups: [{ combinator: 'AND', conditions: [
    { field: 'top1000', op: 'in', values: ['TOP1000'] },
    { field: 'earlyIntervene', op: 'in', values: ['是'] },
    { field: 'keyOpp', op: 'in', values: ['是'] },
    { field: 'status', op: 'notIn', values: ['赢单'] },
  ] }],
}
