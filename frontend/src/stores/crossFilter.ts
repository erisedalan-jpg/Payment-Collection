import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ColFilter, TableFilters } from '@/lib/crossFilter'

/**
 * CF 跨表筛选状态。忠实移植 app.js 全局 CF 对象的状态与联动算法：
 * - 各表(tableId)各列(colKey)的 enum 筛选；全选=无筛选(删除该列)。
 * - linkageOn 时，对同一 group(6 看板)内的设置/清除做跨表同步(syncFilters)。
 */
export const useCrossFilterStore = defineStore('crossFilter', () => {
  const filters = ref<Record<string, TableFilters>>({})
  const linkageOn = ref(false)

  function tableFilters(id: string): TableFilters {
    return filters.value[id] || {}
  }
  function hasFilters(id: string): boolean {
    const t = filters.value[id]
    return !!t && Object.keys(t).length > 0
  }
  function groupHasFilters(ids: string[]): boolean {
    return ids.some((id) => hasFilters(id))
  }

  // 以新对象重写，确保嵌套变更也触发响应式
  function _set(id: string, colKey: string, val: ColFilter | null) {
    const t = { ...(filters.value[id] || {}) }
    if (val === null) delete t[colKey]
    else t[colKey] = val
    filters.value = { ...filters.value, [id]: t }
  }

  /** 同步源表某列筛选到 group 内其它表（无则删除）。忠实移植 CF.syncFilters。 */
  function syncFilters(sourceId: string, colKey: string, group: string[]) {
    const fv = filters.value[sourceId]?.[colKey] ?? null
    group.forEach((g) => {
      if (g !== sourceId) _set(g, colKey, fv)
    })
  }

  /** 忠实移植 CF.apply 的 enum 语义：空选集→{value:[]}；全选(等于总数)→删除；否则记录所选。 */
  function setColumnFilter(
    id: string,
    colKey: string,
    selected: string[],
    totalCount: number,
    group?: string[],
  ) {
    if (selected.length === 0) _set(id, colKey, { value: [] })
    else if (selected.length === totalCount) _set(id, colKey, null)
    else _set(id, colKey, { value: selected })
    if (linkageOn.value && group && group.includes(id)) syncFilters(id, colKey, group)
  }

  /** 忠实移植 CF.clearColumn：删除该列；联动开则同步删除 group 内其它表同列。 */
  function clearColumn(id: string, colKey: string, group?: string[]) {
    _set(id, colKey, null)
    if (linkageOn.value && group && group.includes(id)) {
      group.forEach((g) => {
        if (g !== id) _set(g, colKey, null)
      })
    }
  }

  function clearAll(id: string) {
    filters.value = { ...filters.value, [id]: {} }
  }
  function clearGroup(ids: string[]) {
    const next = { ...filters.value }
    ids.forEach((id) => {
      next[id] = {}
    })
    filters.value = next
  }
  function toggleLinkage() {
    linkageOn.value = !linkageOn.value
  }

  return {
    filters,
    linkageOn,
    tableFilters,
    hasFilters,
    groupHasFilters,
    setColumnFilter,
    clearColumn,
    clearAll,
    clearGroup,
    toggleLinkage,
    syncFilters,
  }
})
