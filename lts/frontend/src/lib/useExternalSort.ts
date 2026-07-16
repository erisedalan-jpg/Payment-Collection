import { ref, computed, watch, type ComputedRef } from 'vue'
import { type SortState, loadSort, saveSort, elDefaultSort } from './sortPrefs'

export type { SortState }

/**
 * 外部排序(custom,跨页排全集):数值键(numericKeys)按数值比较,其余按中文 localeCompare。
 * 无排序(prop/order 任一为空)时原样返回 rows。与 el-table `@sort-change` 配套使用,
 * `onSortChange` 把 'ascending'/'descending' 映射为 'asc'/'desc'。
 * 传 viewKey 时:初值从 localStorage 恢复、sortState 任何变化落库、暴露 defaultSort 供 el-table `:default-sort`。
 */
export function useExternalSort<T extends Record<string, any>>(
  rows: ComputedRef<T[]>,
  numericKeys: Set<string>,
  viewKey?: string,
) {
  const sortState = ref<SortState>(viewKey ? loadSort(viewKey) : { prop: '', order: '' })

  if (viewKey) watch(sortState, (s) => saveSort(viewKey, s))

  const defaultSort = computed(() => elDefaultSort(sortState.value))

  function onSortChange({ prop, order }: { prop: string | null; order: string | null }) {
    sortState.value = {
      prop: prop || '',
      order: order === 'ascending' ? 'asc' : order === 'descending' ? 'desc' : '',
    }
  }

  const sorted = computed(() => {
    const { prop, order } = sortState.value
    if (!prop || !order) return rows.value
    const dir = order === 'asc' ? 1 : -1
    const isNum = numericKeys.has(prop)
    return [...rows.value].sort((a, b) => {
      const x = a[prop]
      const y = b[prop]
      if (isNum) return ((Number(x) || 0) - (Number(y) || 0)) * dir
      return String(x ?? '').localeCompare(String(y ?? ''), 'zh') * dir
    })
  })

  return { sortState, onSortChange, sorted, defaultSort }
}
