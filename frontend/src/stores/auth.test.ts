import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/auth', () => ({
  authenticate: vi.fn(),
  fetchMe: vi.fn(),
  logoutApi: vi.fn(async () => {}),
}))
import { authenticate, fetchMe, logoutApi } from '@/lib/auth'
import { useAuthStore } from './auth'

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.clearAllMocks())

const U = { account: 'admin', displayName: '超级管理员', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }

describe('stores/auth', () => {
  it('login 成功 set user', async () => {
    ;(authenticate as any).mockResolvedValue({ ok: true, user: U })
    const s = useAuthStore()
    const r = await s.login('admin', 'wxtnb')
    expect(r.ok).toBe(true)
    expect(s.user?.account).toBe('admin')
    expect(s.isLoggedIn).toBe(true)
    expect(s.isSuper).toBe(true)
  })
  it('login 失败不 set user', async () => {
    ;(authenticate as any).mockResolvedValue({ ok: false, message: 'x' })
    const s = useAuthStore()
    await s.login('admin', 'bad')
    expect(s.user).toBeNull()
    expect(s.isLoggedIn).toBe(false)
  })
  it('fetchMe set user', async () => {
    ;(fetchMe as any).mockResolvedValue(U)
    const s = useAuthStore()
    await s.fetchMe()
    expect(s.user?.account).toBe('admin')
  })
  it('logout 调 api 并清 user', async () => {
    ;(fetchMe as any).mockResolvedValue(U)
    const s = useAuthStore()
    await s.fetchMe()
    await s.logout()
    expect(logoutApi).toHaveBeenCalled()
    expect(s.user).toBeNull()
  })
})
