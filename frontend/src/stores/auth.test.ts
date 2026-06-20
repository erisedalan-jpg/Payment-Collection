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

describe('stores/auth 访问控制', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('ensureReady 多次调用只 fetchMe 一次', async () => {
    ;(fetchMe as any).mockResolvedValue(null)
    const s = useAuthStore()
    await Promise.all([s.ensureReady(), s.ensureReady(), s.ensureReady()])
    expect((fetchMe as any).mock.calls.length).toBe(1)
  })
  it('canAccess:超管恒真,普通按 allowedPages', () => {
    const s = useAuthStore()
    s.user = { account: 'a', displayName: 'a', isSuper: true, allowedPages: [], allowedL4: [] }
    expect(s.canAccess('data')).toBe(true)
    s.user = { account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [] }
    expect(s.canAccess('data')).toBe(true)
    expect(s.canAccess('about')).toBe(false)
  })
  it('firstAllowedPath:超管→/,普通→首个有权 nav 路径,无权→/login', () => {
    const s = useAuthStore()
    s.user = { account: 'a', displayName: 'a', isSuper: true, allowedPages: [], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/')
    s.user = { account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/data')
    s.user = { account: 'c', displayName: 'c', isSuper: false, allowedPages: [], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/login')
  })
})
