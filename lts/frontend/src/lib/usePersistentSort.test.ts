import { describe, it, expect, beforeEach } from 'vitest'
import { usePersistentSort } from './usePersistentSort'

describe('usePersistentSort', () => {
  beforeEach(() => localStorage.clear())
  it('从存储恢复初值 + defaultSort(el 格式)', () => {
    localStorage.setItem('colsort:t', JSON.stringify({ prop: 'contract', order: 'desc' }))
    const { sortState, defaultSort } = usePersistentSort('t')
    expect(sortState.value).toEqual({ prop: 'contract', order: 'desc' })
    expect(defaultSort.value).toEqual({ prop: 'contract', order: 'descending' })
  })
  it('onSortChange 落库并更新 defaultSort', () => {
    const { onSortChange, defaultSort } = usePersistentSort('t2')
    onSortChange({ prop: 'planDate', order: 'ascending' })
    expect(JSON.parse(localStorage.getItem('colsort:t2')!)).toEqual({ prop: 'planDate', order: 'asc' })
    expect(defaultSort.value).toEqual({ prop: 'planDate', order: 'ascending' })
  })
  it('清空排序(order null)落空 + defaultSort undefined', () => {
    const { onSortChange, defaultSort } = usePersistentSort('t3')
    onSortChange({ prop: 'x', order: 'ascending' })
    onSortChange({ prop: null, order: null })
    expect(defaultSort.value).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('colsort:t3')!)).toEqual({ prop: '', order: '' })
  })
  it('空存储 → defaultSort undefined', () => {
    expect(usePersistentSort('t4').defaultSort.value).toBeUndefined()
  })
})
