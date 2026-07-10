import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { userScopedKey } from './userScopedKey'

describe('userScopedKey', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('有账号 → 账号:base', () => {
    useAuthStore().user = { account: 'alice', displayName: 'A', isSuper: false, allowedPages: [], allowedL4: [] } as never
    expect(userScopedKey('key-projects')).toBe('alice:key-projects')
  })
  it('未登录(user 为 null) → anon:base', () => {
    useAuthStore().user = null
    expect(userScopedKey('t')).toBe('anon:t')
  })
})
