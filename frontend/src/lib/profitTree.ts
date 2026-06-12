import type { ProfitRow } from '@/types/analysis'

// 预算核算科目树折叠逻辑(R2 spec §3):一级+二级恒显,三级仅直接父码展开时显示。
// 默认展开 2.2/2.3——覆盖现 delivery 已展示的 交付外包(2.2.2)/交付部门人工(2.3.2) 等类目(用户决策)。
export const DEFAULT_OPEN = ['2.2', '2.3']

export function hasChildren(rows: ProfitRow[], row: ProfitRow): boolean {
  return rows.some((r) => r.code.startsWith(row.code + '.'))
}

export function visibleRows(rows: ProfitRow[], open: Set<string>): ProfitRow[] {
  return rows.filter((r) => {
    if ((r.level ?? 1) <= 2) return true
    const parent = r.code.slice(0, r.code.lastIndexOf('.'))
    return open.has(parent)
  })
}

/** 毛利率类行(值为 0-1 比率,不能按万元格式化) */
export function isRateRow(row: ProfitRow): boolean {
  return (row.name || '').includes('率')
}
