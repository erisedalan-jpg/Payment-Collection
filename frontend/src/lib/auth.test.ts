import { describe, it, expect, vi, afterEach } from 'vitest'
import { authenticate, fetchMe, logoutApi } from './auth'

afterEach(() => vi.unstubAllGlobals())

const U = { account: 'admin', displayName: '超级管理员', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }

describe('lib/auth', () => {
  it('authenticate 成功映射 user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, user: U }) }))
    const r = await authenticate('admin', 'wxtnb')
    expect(r.ok).toBe(true)
    expect(r.user?.account).toBe('admin')
  })
  it('authenticate 失败映射 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, message: '账号或密码错误' }) }))
    const r = await authenticate('admin', 'bad')
    expect(r.ok).toBe(false)
    expect(r.message).toBe('账号或密码错误')
  })
  it('fetchMe 返回 user / null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, user: U }) }))
    expect((await fetchMe())?.account).toBe('admin')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    expect(await fetchMe()).toBeNull()
  })
  it('fetchMe 网络异常→null(不抛)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    expect(await fetchMe()).toBeNull()
  })
  it('logoutApi 调 POST /api/logout', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', f)
    await logoutApi()
    expect(f).toHaveBeenCalledWith('/api/logout', expect.objectContaining({ method: 'POST' }))
  })
  it('changePassword 成功映射 user(flag 清)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, user: { ...U, mustChangePassword: false } }) })
    vi.stubGlobal('fetch', f)
    const { changePassword } = await import('./auth')
    const r = await changePassword('temp123', 'newpass456')
    expect(r.ok).toBe(true)
    expect(r.user?.mustChangePassword).toBe(false)
    expect(f).toHaveBeenCalledWith('/api/account/change-password', expect.objectContaining({ method: 'POST' }))
  })
  it('changePassword 失败映射 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, message: '原密码错误' }) }))
    const { changePassword } = await import('./auth')
    const r = await changePassword('bad', 'newpass456')
    expect(r.ok).toBe(false)
    expect(r.message).toBe('原密码错误')
  })
})
