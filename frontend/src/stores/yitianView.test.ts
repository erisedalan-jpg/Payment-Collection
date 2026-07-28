import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { userScopedKey } from '@/lib/userScopedKey'
import { useYitianViewStore } from './yitianView'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('yitianView 新增筛选维度(V4.5.5)', () => {
  it('四个新成员有正确默认值', () => {
    const v = useYitianViewStore()
    expect(v.prodCats).toEqual([])       // 空 = 不过滤
    expect(v.types).toEqual([])
    expect(v.mgrMode).toBe('all')
    expect(v.displayMode).toBe('both')
  })

  it('hydrate 能读回持久化的四个新成员', async () => {
    const a = useYitianViewStore()
    a.hydrate()
    a.prodCats = ['终端安全']
    a.types = ['项目类']
    a.mgrMode = 'exclude'
    a.displayMode = 'pct'
    await nextTick()          // watch 默认 flush:'pre',要等一次微任务 persist 才真的落盘
    // 换一个 pinia 实例模拟刷新
    setActivePinia(createPinia())
    const b = useYitianViewStore()
    b.hydrate()
    expect(b.prodCats).toEqual(['终端安全'])
    expect(b.types).toEqual(['项目类'])
    expect(b.mgrMode).toBe('exclude')
    expect(b.displayMode).toBe('pct')
  })

  it('坏的 mgrMode/displayMode 值被忽略而非原样写入', () => {
    // 必须写到 hydrate 真正会读的那把键(按登录账号加前缀,未登录为 anon:) ——
    // 键写错的话 hydrate 读不到任何东西、断言恒等于默认值,成了一条永绿的假测试。
    localStorage.setItem(
      userScopedKey('yitian_view'),
      JSON.stringify({ mgrMode: 'xxx', displayMode: 'yyy', prodCats: 'not-an-array' }),
    )
    const v = useYitianViewStore()
    v.hydrate()
    expect(v.mgrMode).toBe('all')
    expect(v.displayMode).toBe('both')
    expect(v.prodCats).toEqual([])
  })
})
