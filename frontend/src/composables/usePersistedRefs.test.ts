import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { usePersistedRefs } from './usePersistedRefs'

function login(account: string) {
  const a = useAuthStore()
  a.user = { account, displayName: account, isSuper: true, allowedPages: ['*'], allowedL4: [] }
}

describe('usePersistedRefs', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('改 ref 后写入 localStorage,新实例 hydrate 时恢复', async () => {
    login('u1')
    const a = ref('x')
    usePersistedRefs('view_t', { a })
    a.value = 'y'
    await nextTick()
    const b = ref('x')
    usePersistedRefs('view_t', { b: b })   // 键名不同则不恢复,验证按键名匹配
    expect(b.value).toBe('x')
    const a2 = ref('x')
    usePersistedRefs('view_t', { a: a2 })
    expect(a2.value).toBe('y')
  })

  it('按账号隔离:u1 的存档 u2 读不到', async () => {
    login('u1')
    const a = ref('x'); usePersistedRefs('view_t', { a }); a.value = 'u1值'; await nextTick()
    setActivePinia(createPinia()); login('u2')
    const b = ref('x'); usePersistedRefs('view_t', { a: b })
    expect(b.value).toBe('x')
  })

  it('坏 JSON 不崩,回落默认值', () => {
    login('u1')
    localStorage.setItem('u1:view_t', '{不是JSON')
    const a = ref('默认')
    expect(() => usePersistedRefs('view_t', { a })).not.toThrow()
    expect(a.value).toBe('默认')
  })

  it('类型护栏:存档是数组而当前 ref 是字符串 → 跳过该键,其余键正常恢复', () => {
    login('u1')
    localStorage.setItem('u1:view_t', JSON.stringify({ a: ['坏'], b: '好' }))
    const a = ref('默认'); const b = ref('')
    usePersistedRefs('view_t', { a, b })
    expect(a.value).toBe('默认')   // 被护栏拦下
    expect(b.value).toBe('好')     // 不受牵连
  })

  it('null 初值不被护栏误杀:ref<number|null>(null) 能被存档里的 number 恢复', () => {
    // typeof null === 'object',若护栏不先放行 null,合法的 number 存档会被判为不符而静默失效。
    // MilestoneView 的 faYear / nodeYear 正是这种 ref。
    login('u1')
    localStorage.setItem('u1:view_t', JSON.stringify({ y: 2026 }))
    const y = ref<number | null>(null)
    usePersistedRefs('view_t', { y })
    expect(y.value).toBe(2026)
  })

  it('setItem 抛错(配额满)时不冒泡', async () => {
    login('u1')
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const a = ref('x')
    usePersistedRefs('view_t', { a })
    a.value = 'y'
    await expect(nextTick()).resolves.not.toThrow()
    spy.mockRestore()
  })

  it('数组状态变更能触发持久化(验证 deep 生效)', async () => {
    login('u1')
    const arr = ref<string[]>(['a'])
    usePersistedRefs('view_t', { arr })
    arr.value.push('b')
    await nextTick()
    expect(JSON.parse(localStorage.getItem('u1:view_t')!).arr).toEqual(['a', 'b'])
  })
})
