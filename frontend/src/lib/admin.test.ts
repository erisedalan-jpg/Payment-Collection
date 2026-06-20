import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listAccounts, createAccount, updateAccount, deleteAccount } from './admin'

describe('lib/admin', () => {
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('listAccounts GET 解析 accounts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, accounts: [{ account: 'a', displayName: 'A', isSuper: false, allowedPages: ['*'], allowedL4: ['*'] }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await listAccounts()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/accounts', expect.objectContaining({ credentials: 'same-origin' }))
    expect(out[0].account).toBe('a')
  })

  it('createAccount POST 正确 body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await createAccount({ account: 'x', password: 'p', displayName: 'X', allowedPages: ['projects'], allowedL4: ['北京'] })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/accounts/create')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toMatchObject({ account: 'x', allowedL4: ['北京'] })
  })

  it('updateAccount POST update', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await updateAccount({ account: 'x', allowedPages: ['*'] })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/accounts/update')
  })

  it('deleteAccount POST delete', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await deleteAccount('x')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/accounts/delete')
    expect(JSON.parse(opts.body)).toEqual({ account: 'x' })
  })

  it('非 2xx 抛带 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: '需要超级管理员权限' }) }))
    await expect(listAccounts()).rejects.toThrow('需要超级管理员权限')
  })
})
