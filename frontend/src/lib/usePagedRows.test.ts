import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { usePagedRows } from './usePagedRows'

describe('usePagedRows', () => {
  it('按页切片', () => {
    const src = ref(Array.from({ length: 25 }, (_, i) => i))
    const { paged, currentPage, pageSize } = usePagedRows(src, 10)
    expect(paged.value).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    currentPage.value = 3
    expect(paged.value).toEqual([20, 21, 22, 23, 24])
    expect(pageSize.value).toBe(10)
  })
  it('source 变更重置页码到 1', async () => {
    const src = ref([1, 2, 3, 4, 5])
    const { currentPage } = usePagedRows(src, 2)
    currentPage.value = 3
    src.value = [9]
    await nextTick()
    expect(currentPage.value).toBe(1)
  })
})
