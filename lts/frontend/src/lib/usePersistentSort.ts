import { ref, computed } from 'vue'
import { loadSort, saveSort, fromElOrder, elDefaultSort } from './sortPrefs'

/** 内部排序(el-table 内置排 :rows)表的排序持久化:恢复初值 + 变更落库,不做排序计算。
 *  视图把 defaultSort 绑到 DataTable :default-sort、onSortChange 绑到 @sort-change。 */
export function usePersistentSort(viewKey: string) {
  const sortState = ref(loadSort(viewKey))
  const defaultSort = computed(() => elDefaultSort(sortState.value))
  function onSortChange({ prop, order }: { prop: string | null; order: string | null }) {
    sortState.value = { prop: prop || '', order: fromElOrder(order) }
    saveSort(viewKey, sortState.value)
  }
  return { sortState, defaultSort, onSortChange }
}
