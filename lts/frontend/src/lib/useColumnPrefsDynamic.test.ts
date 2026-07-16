import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useColumnPrefsDynamic } from './useColumnPrefs'

describe('useColumnPrefsDynamic', () => {
  beforeEach(() => localStorage.clear())
  it('allKeys 异步到达后,按 defaultVisible∩allKeys 初始化', async () => {
    const allKeys = ref<string[]>([])
    const p = useColumnPrefsDynamic('t-view', allKeys, ['a', 'b', 'zzz'])
    expect(p.visibleKeys.value).toEqual([])            // 数据未到 → 空
    allKeys.value = ['a', 'b', 'c']
    await nextTick()
    expect(p.visibleKeys.value).toEqual(['a', 'b'])    // zzz 不在 allKeys 被滤
  })
  it('toggle 仅对 allKeys 内的键生效;reset 回默认', async () => {
    const allKeys = ref<string[]>(['a', 'b', 'c'])
    const p = useColumnPrefsDynamic('t-view2', allKeys, ['a'])
    await nextTick()
    p.toggle('c'); expect(p.visibleKeys.value).toEqual(['a', 'c'])
    p.toggle('zzz'); expect(p.visibleKeys.value).toEqual(['a', 'c'])  // 非 allKeys 无效
    p.reset(); expect(p.visibleKeys.value).toEqual(['a'])
  })
})
