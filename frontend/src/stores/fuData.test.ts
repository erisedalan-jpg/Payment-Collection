import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFuDataStore } from './fuData'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('useFuDataStore', () => {
  it('get 默认值', () => {
    const s = useFuDataStore()
    expect(s.get('P1')).toEqual({ flw: false, st: '', fb: '' })
  })
  it('setFlw 写入并持久化', () => {
    const s = useFuDataStore()
    s.setFlw('P1', true)
    expect(s.data.P1.flw).toBe(true)
    expect(JSON.parse(localStorage.getItem('fu_data') || '{}').P1.flw).toBe(true)
  })
  it('batchSetFlw 批量设置', () => {
    const s = useFuDataStore()
    s.batchSetFlw(['P1', 'P2'], true)
    expect(s.data.P1.flw).toBe(true)
    expect(s.data.P2.flw).toBe(true)
    s.batchSetFlw(['P1'], false)
    expect(s.data.P1.flw).toBe(false)
    expect(s.data.P2.flw).toBe(true)
  })
  it('初始化时读取已有 localStorage', () => {
    localStorage.setItem('fu_data', JSON.stringify({ P9: { flw: true } }))
    const s = useFuDataStore()
    expect(s.get('P9').flw).toBe(true)
  })
})
