import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

/** 客户端分页:返回当前页切片 + 页码/页大小;source 变更自动回到第 1 页。 */
export function usePagedRows<T>(source: Ref<T[]> | ComputedRef<T[]>, size = 50) {
  const currentPage = ref(1)
  const pageSize = ref(size)
  const paged = computed<T[]>(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return source.value.slice(start, start + pageSize.value)
  })
  watch(source, () => { currentPage.value = 1 })
  watch(pageSize, () => {
    const maxPage = Math.max(1, Math.ceil(source.value.length / pageSize.value))
    if (currentPage.value > maxPage) currentPage.value = maxPage
  })
  return { paged, currentPage, pageSize }
}
