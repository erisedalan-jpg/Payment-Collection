// 统一 API 客户端：消费后端 {success, code, message} 错误约定（见 server.py _error_payload）
export class ApiRequestError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  let data: any = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (data && data.success === false) {
    throw new ApiRequestError(data.code ?? 'internal_error', data.message ?? '请求失败')
  }
  if (!res.ok) {
    throw new ApiRequestError(`http_${res.status}`, `HTTP ${res.status}`)
  }
  if (data === null) {
    throw new ApiRequestError('parse_error', '响应解析失败')
  }
  return data as T
}

// 注意：泛型 T 是完整响应体类型（含 success 字段等），后端成功响应不做 {data} 包装。
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
}
