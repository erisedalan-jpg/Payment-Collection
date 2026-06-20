export interface AuthResult {
  ok: boolean
  message?: string
}

// SP-1 桩:恒返回失败,占位触发登录页摇头动效。
// SP-2 替换为真实 POST /api/login(校验账号密码、成功后存登录态/权限集)。
export async function authenticate(account: string, password: string): Promise<AuthResult> {
  void account; void password
  return { ok: false, message: '登录功能开发中（SP-2 接入后端校验）' }
}
