export interface AuthUser {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
}

export interface AuthResult {
  ok: boolean
  message?: string
  user?: AuthUser
}

/** 登录:POST /api/login。成功带回 user(含权限集);失败带 message。 */
export async function authenticate(account: string, password: string): Promise<AuthResult> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) return { ok: true, user: data.user as AuthUser }
    return { ok: false, message: data.message || '登录失败' }
  } catch {
    return { ok: false, message: '网络错误,无法连接服务' }
  }
}

/** 取当前登录用户(GET /api/auth/me,带 cookie);未登录或异常→null。 */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (!res.ok) return null
    const data = await res.json().catch(() => ({}))
    return data.success ? (data.user as AuthUser) : null
  } catch {
    return null
  }
}

/** 登出(POST /api/logout,清服务端会话与 cookie)。 */
export async function logoutApi(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
  } catch {
    // 登出失败不阻断前端清态
  }
}
