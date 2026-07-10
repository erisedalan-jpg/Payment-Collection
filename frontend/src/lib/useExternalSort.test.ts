import { describe, it, expect, beforeEach } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useExternalSort } from './useExternalSort'
import { loadSort } from './sortPrefs'

describe('useExternalSort', () => {
  beforeEach(() => localStorage.clear())

  const NUMERIC_KEYS = new Set(['amount'])

  it('无排序时返回原序(引用同一 rows)', () => {
    const rows = ref([{ id: 'a', amount: 3 }, { id: 'b', amount: 1 }, { id: 'c', amount: 2 }])
    const { sorted } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS)
    expect(sorted.value.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('数值键升序按数值排序', () => {
    const rows = ref([{ id: 'a', amount: 3 }, { id: 'b', amount: 1 }, { id: 'c', amount: 20 }])
    const { onSortChange, sorted } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS)
    onSortChange({ prop: 'amount', order: 'ascending' })
    expect(sorted.value.map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('数值键降序按数值排序(非字符串序,20 排在 3 之前)', () => {
    const rows = ref([{ id: 'a', amount: 3 }, { id: 'b', amount: 1 }, { id: 'c', amount: 20 }])
    const { onSortChange, sorted } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS)
    onSortChange({ prop: 'amount', order: 'descending' })
    expect(sorted.value.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('字符串键按 localeCompare(zh) 排序(拼音序:丙bǐng<甲jiǎ<乙yǐ)', () => {
    const rows = ref([{ id: 'a', name: '丙' }, { id: 'b', name: '甲' }, { id: 'c', name: '乙' }])
    const { onSortChange, sorted } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS)
    onSortChange({ prop: 'name', order: 'ascending' })
    expect(sorted.value.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it("'ascending'/'descending' 映射为 'asc'/'desc',其余映射为空", () => {
    const rows = ref([{ id: 'a', amount: 1 }])
    const { onSortChange, sortState } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS)
    onSortChange({ prop: 'amount', order: 'ascending' })
    expect(sortState.value).toEqual({ prop: 'amount', order: 'asc' })
    onSortChange({ prop: 'amount', order: 'descending' })
    expect(sortState.value).toEqual({ prop: 'amount', order: 'desc' })
    onSortChange({ prop: null, order: null })
    expect(sortState.value).toEqual({ prop: '', order: '' })
  })

  it('prop/order 缺一则不排序,返回 rows 原序', () => {
    const rows = ref([{ id: 'a', amount: 3 }, { id: 'b', amount: 1 }])
    const { onSortChange, sorted } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS)
    onSortChange({ prop: 'amount', order: null })
    expect(sorted.value.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('空值/null 参与字符串排序时按空串处理', () => {
    const rows = ref([{ id: 'a', name: '甲' }, { id: 'b', name: null }, { id: 'c', name: undefined }])
    const { onSortChange, sorted } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS)
    onSortChange({ prop: 'name', order: 'ascending' })
    expect(sorted.value.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('数值键非数值(空字符串/undefined)按 0 处理', () => {
    const rows = ref([{ id: 'a', amount: 5 }, { id: 'b', amount: undefined }, { id: 'c', amount: -1 }])
    const { onSortChange, sorted } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS)
    onSortChange({ prop: 'amount', order: 'ascending' })
    expect(sorted.value.map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('传 viewKey:从 localStorage 恢复初值并生效', () => {
    localStorage.setItem('colsort:v1', JSON.stringify({ prop: 'amount', order: 'desc' }))
    const rows = ref([{ id: 'a', amount: 3 }, { id: 'b', amount: 1 }, { id: 'c', amount: 20 }])
    const { sortState, sorted } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS, 'v1')
    expect(sortState.value).toEqual({ prop: 'amount', order: 'desc' })
    expect(sorted.value.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })
  it('传 viewKey:onSortChange 后落库', async () => {
    const rows = ref([{ id: 'a', amount: 1 }])
    const { onSortChange } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS, 'v2')
    onSortChange({ prop: 'amount', order: 'ascending' })
    await nextTick()
    expect(JSON.parse(localStorage.getItem('colsort:v2')!)).toEqual({ prop: 'amount', order: 'asc' })
  })
  it('传 viewKey:sortState 置空后清空存储(视图 reset 路径)', async () => {
    const rows = ref([{ id: 'a', amount: 1 }])
    const { sortState } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS, 'v3')
    sortState.value = { prop: 'amount', order: 'asc' }
    await nextTick()
    expect(loadSort('v3')).toEqual({ prop: 'amount', order: 'asc' })
    sortState.value = { prop: '', order: '' }
    await nextTick()
    expect(loadSort('v3')).toEqual({ prop: '', order: '' })
  })
  it('defaultSort 反映当前 sortState;不传 viewKey 也可用', () => {
    const rows = ref([{ id: 'a', amount: 1 }])
    const { onSortChange, defaultSort } = useExternalSort(computed(() => rows.value), NUMERIC_KEYS, 'v4')
    expect(defaultSort.value).toBeUndefined()
    onSortChange({ prop: 'amount', order: 'ascending' })
    expect(defaultSort.value).toEqual({ prop: 'amount', order: 'ascending' })
  })
})
