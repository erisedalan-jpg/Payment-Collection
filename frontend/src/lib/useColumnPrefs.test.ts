import { describe, it, expect, beforeEach } from 'vitest'
import { useColumnPrefs } from './useColumnPrefs'

const ALL = ['a', 'b', 'c', 'd']
const DEF = ['a', 'b', 'c']

describe('useColumnPrefs', () => {
  beforeEach(() => localStorage.clear())

  it('无存储时用默认可见集', () => {
    const p = useColumnPrefs('t1', ALL, DEF)
    expect(p.visibleKeys.value).toEqual(['a', 'b', 'c'])
  })

  it('toggle 显↔隐并持久化到 localStorage', () => {
    const p = useColumnPrefs('t2', ALL, DEF)
    p.toggle('c')                       // 隐藏 c
    expect(p.visibleKeys.value).toEqual(['a', 'b'])
    p.toggle('d')                       // 显示 d(追加末尾)
    expect(p.visibleKeys.value).toEqual(['a', 'b', 'd'])
    expect(JSON.parse(localStorage.getItem('colprefs:t2')!)).toEqual(['a', 'b', 'd'])
  })

  it('从 localStorage 恢复并剔除失效 key', () => {
    localStorage.setItem('colprefs:t3', JSON.stringify(['b', 'a', 'zzz']))  // zzz 不在 ALL
    const p = useColumnPrefs('t3', ALL, DEF)
    expect(p.visibleKeys.value).toEqual(['b', 'a'])
  })

  it('新列(在 ALL 不在存储)默认隐藏', () => {
    localStorage.setItem('colprefs:t4', JSON.stringify(['a', 'b']))  // c/d 未存
    const p = useColumnPrefs('t4', ALL, DEF)
    expect(p.visibleKeys.value).toEqual(['a', 'b'])   // 不自动补 c/d
  })

  it('moveUp/moveDown 在可见集内换位', () => {
    const p = useColumnPrefs('t5', ALL, DEF)
    p.moveDown('a')
    expect(p.visibleKeys.value).toEqual(['b', 'a', 'c'])
    p.moveUp('c')
    expect(p.visibleKeys.value).toEqual(['b', 'c', 'a'])
    p.moveUp('b')                       // 已是首项,不动
    expect(p.visibleKeys.value).toEqual(['b', 'c', 'a'])
  })

  it('reset 恢复默认', () => {
    const p = useColumnPrefs('t6', ALL, DEF)
    p.toggle('a'); p.toggle('d')
    p.reset()
    expect(p.visibleKeys.value).toEqual(['a', 'b', 'c'])
  })
})
