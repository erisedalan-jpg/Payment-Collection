import { describe, it, expect, beforeEach } from 'vitest'
import { loadSort, saveSort, fromElOrder, elDefaultSort } from './sortPrefs'

describe('sortPrefs', () => {
  beforeEach(() => localStorage.clear())
  it('load 空/坏 JSON/非法 order → 默认空', () => {
    expect(loadSort('x')).toEqual({ prop: '', order: '' })
    localStorage.setItem('colsort:x', '{bad')
    expect(loadSort('x')).toEqual({ prop: '', order: '' })
    localStorage.setItem('colsort:x', JSON.stringify({ prop: 'a', order: 'nope' }))
    expect(loadSort('x')).toEqual({ prop: '', order: '' })
  })
  it('save→load 往返 + 落 colsort: 前缀', () => {
    saveSort('t', { prop: 'amount', order: 'desc' })
    expect(loadSort('t')).toEqual({ prop: 'amount', order: 'desc' })
    expect(JSON.parse(localStorage.getItem('colsort:t')!)).toEqual({ prop: 'amount', order: 'desc' })
  })
  it('fromElOrder 三态', () => {
    expect(fromElOrder('ascending')).toBe('asc')
    expect(fromElOrder('descending')).toBe('desc')
    expect(fromElOrder(null)).toBe('')
  })
  it('elDefaultSort 空→undefined,有值→el 格式', () => {
    expect(elDefaultSort({ prop: '', order: '' })).toBeUndefined()
    expect(elDefaultSort({ prop: 'a', order: '' })).toBeUndefined()
    expect(elDefaultSort({ prop: 'a', order: 'asc' })).toEqual({ prop: 'a', order: 'ascending' })
    expect(elDefaultSort({ prop: 'a', order: 'desc' })).toEqual({ prop: 'a', order: 'descending' })
  })
})
