import type { DataColumn } from '@/components/DataTable.vue'

/** 长文本列（大段换行文字），排序无意义，不开启排序。原 4 列 + V2.8.2 富文本化的 followAction/revConclusion。 */
export const NON_SORTABLE_KEYS = new Set<string>(['weekProgress', 'nextPlan', 'remark', 'mainProducts', 'followAction', 'revConclusion'])

/**
 * 给列集统一标记可排序：除长文本列(NON_SORTABLE_KEYS)外一律 sortable=true。
 * 其余字段原样保留;返回新数组/新对象,不改入参。
 * 排序口径走 el-table 原生(按 row[col.key] 原始值),不附加比较器。
 */
export function withSortable(columns: DataColumn[]): DataColumn[] {
  return columns.map((c) => ({ ...c, sortable: !NON_SORTABLE_KEYS.has(c.key) }))
}
