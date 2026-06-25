// 范围筛选的纯运算符与类型(temp/opportunity 两页共享)。
export type Combinator = 'AND' | 'OR'
export type ScopeOp = 'in' | 'notIn' | 'between' | 'notBetween' | 'contains' | 'notContains'
export type FieldKind = 'enum' | 'number' | 'date' | 'text'

/** leafMatch 只读 op/values/min/max——temp 与 opportunity 的条件对象都满足。 */
export interface LeafCondition { op: ScopeOp; values?: string[]; min?: number | string | null; max?: number | string | null }

export function opsForKind(kind: FieldKind): ScopeOp[] {
  if (kind === 'enum') return ['in', 'notIn']
  if (kind === 'text') return ['contains', 'notContains']
  return ['between', 'notBetween'] // number / date
}

export const OPS_BY_KIND: Record<string, ScopeOp[]> = {
  enum: ['in', 'notIn'],
  text: ['contains', 'notContains'],
  number: ['between', 'notBetween'],
  date: ['between', 'notBetween'],
}

export const OP_LABEL: Record<string, string> = {
  in: '属于', notIn: '不属于', between: '区间内', notBetween: '区间外', contains: '包含', notContains: '不包含',
}

function isDateLike(x: any): boolean {
  return typeof x === 'string' && /\d{4}-\d{2}-\d{2}/.test(x)
}

function inRange(raw: any, min: any, max: any): boolean {
  const hasMin = min != null && min !== ''
  const hasMax = max != null && max !== ''
  if (!hasMin && !hasMax) return true
  if (isDateLike(min) || isDateLike(max)) {
    const v = String(raw ?? '').slice(0, 10)
    if (v === '') return false
    if (hasMin && v < String(min).slice(0, 10)) return false
    if (hasMax && v > String(max).slice(0, 10)) return false
    return true
  }
  if (raw == null || raw === '') return false
  const n = Number(raw)
  if (Number.isNaN(n)) return false
  if (hasMin && n < Number(min)) return false
  if (hasMax && n > Number(max)) return false
  return true
}

export function leafMatch(raw: any, c: LeafCondition): boolean {
  switch (c.op) {
    case 'in':
    case 'notIn': {
      const set = new Set(c.values ?? [])
      const hit = Array.isArray(raw) ? raw.some((v) => set.has(String(v))) : set.has(String(raw ?? ''))
      return c.op === 'in' ? hit : !hit
    }
    case 'between':
    case 'notBetween': {
      const within = inRange(raw, c.min, c.max)
      return c.op === 'between' ? within : !within
    }
    case 'contains':
    case 'notContains': {
      const term = String((c.values && c.values[0]) ?? '')
      const hit = term !== '' && String(raw ?? '').includes(term)
      return c.op === 'contains' ? hit : !hit
    }
  }
  return false
}
