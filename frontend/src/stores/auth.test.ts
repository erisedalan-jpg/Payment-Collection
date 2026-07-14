import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/auth', () => ({
  authenticate: vi.fn(),
  fetchMe: vi.fn(),
  logoutApi: vi.fn(async () => {}),
  changePassword: vi.fn(),
}))
import { authenticate, fetchMe, logoutApi, changePassword } from '@/lib/auth'
import { useAuthStore } from './auth'
import { useDataStore } from './data'
import { useRiskFollowupStore } from './riskFollowup'
import { usePaymentKeyFollowupStore } from './paymentKeyFollowup'

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
  it('login 成功后重置 data store(杜绝跨账号复用上一个用户全量数据)', async () => {
    ;(authenticate as any).mockResolvedValue({ ok: true, user: U })
    const data = useDataStore()
    data.data = { meta: { lastUpdate: 'stale' }, projects: [{ projectId: 'P1' }] } as any
    const s = useAuthStore()
    await s.login('admin', 'wxtnb')
    expect(data.data).toBeNull()
  })
  it('logout 后重置 data store(防下个低权限账号见全量缓存)', async () => {
    ;(fetchMe as any).mockResolvedValue(U)
    const data = useDataStore()
    data.data = { meta: { lastUpdate: 'stale' }, projects: [{ projectId: 'P1' }] } as any
    const s = useAuthStore()
    await s.fetchMe()
    await s.logout()
    expect(data.data).toBeNull()
  })
  it('login 成功后重置 riskFollowup / paymentKeyFollowup store(杜绝换账号沿用上一账号跟进缓存)', async () => {
    ;(authenticate as any).mockResolvedValue({ ok: true, user: U })
    const risk = useRiskFollowupStore()
    risk.current = { P1: { followAction: '旧', revConclusion: '', nextRevDate: '' } as any }
    risk.loaded = true
    const payKey = usePaymentKeyFollowupStore()
    payKey.current = { P1: { followAction: '旧', revConclusion: '', nextRevDate: '' } as any }
    payKey.loaded = true
    const s = useAuthStore()
    await s.login('admin', 'wxtnb')
    expect(risk.current).toEqual({})
    expect(risk.loaded).toBe(false)
    expect(payKey.current).toEqual({})
    expect(payKey.loaded).toBe(false)
  })
  it('logout 后重置 riskFollowup / paymentKeyFollowup store', async () => {
    ;(fetchMe as any).mockResolvedValue(U)
    const risk = useRiskFollowupStore()
    risk.current = { P1: { followAction: '旧', revConclusion: '', nextRevDate: '' } as any }
    risk.loaded = true
    const payKey = usePaymentKeyFollowupStore()
    payKey.current = { P1: { followAction: '旧', revConclusion: '', nextRevDate: '' } as any }
    payKey.loaded = true
    const s = useAuthStore()
    await s.fetchMe()
    await s.logout()
    expect(risk.current).toEqual({})
    expect(risk.loaded).toBe(false)
    expect(payKey.current).toEqual({})
    expect(payKey.loaded).toBe(false)
  })
  it('changePassword 成功:更新 user 且 mustChangePassword 清零', async () => {
    ;(fetchMe as any).mockResolvedValue({ ...U, mustChangePassword: true })
    const s = useAuthStore()
    await s.fetchMe()
    expect(s.mustChangePassword).toBe(true)
    ;(changePassword as any).mockResolvedValue({ ok: true, user: { ...U, mustChangePassword: false } })
    const r = await s.changePassword('temp123', 'newpass456')
    expect(changePassword).toHaveBeenCalledWith('temp123', 'newpass456')
    expect(r.ok).toBe(true)
    expect(s.mustChangePassword).toBe(false)
  })
  it('changePassword 失败:不动 user', async () => {
    ;(fetchMe as any).mockResolvedValue({ ...U, mustChangePassword: true })
    const s = useAuthStore()
    await s.fetchMe()
    ;(changePassword as any).mockResolvedValue({ ok: false, message: '原密码错误' })
    const r = await s.changePassword('bad', 'newpass456')
    expect(r.ok).toBe(false)
    expect(s.mustChangePassword).toBe(true)
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
  it('firstAllowedPath:普通账号仅 projects-key 权限→/projects/key', () => {
    const s = useAuthStore()
    s.user = { account: 'k', displayName: 'k', isSuper: false, allowedPages: ['projects-key'], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/projects/key')
  })
  // 回归:新增页面分区必须并入 firstAllowedPath 的 nav 全集,否则只授权该分区的账号
  // 在全集里找不到任何有权链接 → 被踢回 /login → 登录后又被弹回,死循环。
  it('firstAllowedPath:普通账号仅倚天权限→/yitian(不得被踢回 /login)', () => {
    const s = useAuthStore()
    s.user = { account: 'y', displayName: 'y', isSuper: false, allowedPages: ['yitian'], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/yitian')
    s.user = { account: 'y2', displayName: 'y2', isSuper: false, allowedPages: ['yitian-trend'], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/yitian/trend')
  })
  // 回归:只授权概算工具的账号必须落到 /budget,不得被踢回 /login(否则登录死循环)
  it('firstAllowedPath:普通账号仅 budget 权限→/budget', () => {
    const s = useAuthStore()
    s.user = { account: 'g', displayName: 'g', isSuper: false,
               allowedPages: ['budget'], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/budget')
  })
})
