/** 表头排序状态:prop 为空列 key、order 为空/asc/desc。全站排序状态单一类型。 */
export interface SortState {
  prop: string
  order: '' | 'asc' | 'desc'
}

const PREFIX = 'colsort:'

/** 读 localStorage['colsort:'+viewKey];坏/空/非法 → {prop:'',order:''}。 */
export function loadSort(viewKey: string): SortState {
  try {
    const raw = localStorage.getItem(PREFIX + viewKey)
    if (raw) {
      const o = JSON.parse(raw)
      if (o && typeof o.prop === 'string' && (o.order === 'asc' || o.order === 'desc' || o.order === '')) {
        return { prop: o.prop, order: o.order }
      }
    }
  } catch {
    /* localStorage 不可用/损坏 → 默认 */
  }
  return { prop: '', order: '' }
}

export function saveSort(viewKey: string, s: SortState): void {
  try {
    localStorage.setItem(PREFIX + viewKey, JSON.stringify({ prop: s.prop, order: s.order }))
  } catch {
    /* 忽略写入失败(隐私模式/配额) */
  }
}

/** el-table 'ascending'/'descending' → 'asc'/'desc',其余 → ''。 */
export function fromElOrder(order: string | null): '' | 'asc' | 'desc' {
  return order === 'ascending' ? 'asc' : order === 'descending' ? 'desc' : ''
}

/** 映射为 el-table `:default-sort` 需要的格式;空排序 → undefined(不传)。 */
export function elDefaultSort(s: SortState): { prop: string; order: 'ascending' | 'descending' } | undefined {
  if (!s.prop || !s.order) return undefined
  return { prop: s.prop, order: s.order === 'asc' ? 'ascending' : 'descending' }
}
