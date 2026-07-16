import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectDetailStore } from './projectDetail'

beforeEach(() => setActivePinia(createPinia()))

describe('projectDetail store', () => {
  it('open 设置 id 与 visible；close 清空', () => {
    const s = useProjectDetailStore()
    expect(s.visible).toBe(false)
    s.open('P1')
    expect(s.openId).toBe('P1')
    expect(s.visible).toBe(true)
    s.close()
    expect(s.openId).toBeNull()
    expect(s.visible).toBe(false)
  })
})
