import { apiUrl } from '@/lib/baseUrl'

export interface AdminAccount {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
  allowedStaff?: string[]
  domainScopes?: Record<string, { l4: string[]; staff: string[] }>
  mustChangePassword?: boolean
}

export interface RosterEntry {
  id: string
  name: string
  l4: string
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(apiUrl(url), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.success === false) throw new Error(data.message || '操作失败')
}

export async function listAccounts(): Promise<AdminAccount[]> {
  const res = await fetch(apiUrl('/api/admin/accounts'), { credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.message || '获取账号列表失败')
  return data.accounts as AdminAccount[]
}

export function createAccount(p: {
  account: string; password: string; displayName: string
  allowedPages: string[]; allowedL4: string[]; allowedStaff: string[]
  domainScopes?: Record<string, { l4: string[]; staff: string[] }>
}): Promise<void> {
  return postJson('/api/admin/accounts/create', p)
}

export function updateAccount(p: {
  account: string; displayName?: string; allowedPages?: string[]
  allowedL4?: string[]; allowedStaff?: string[]
  domainScopes?: Record<string, { l4: string[]; staff: string[] }>
  password?: string
}): Promise<void> {
  return postJson('/api/admin/accounts/update', p)
}

export function deleteAccount(account: string): Promise<void> {
  return postJson('/api/admin/accounts/delete', { account })
}

export async function listRoster(): Promise<RosterEntry[]> {
  const res = await fetch(apiUrl('/api/admin/roster'), { credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.message || '获取花名册失败')
  return data.roster as RosterEntry[]
}
