// 本机 cookie 代理(cookie_agent.py)客户端。代理只监听 127.0.0.1:8765。
const AGENT_BASE = 'http://127.0.0.1:8765'

export interface AgentCookieResult {
  ok: boolean
  cookie: string
  names: string[]
  hasSession?: boolean
  error: string
}

export async function pingAgent(): Promise<boolean> {
  try {
    const r = await fetch(AGENT_BASE + '/ping', { credentials: 'omit' })
    return r.ok
  } catch {
    return false
  }
}

async function agentGet(path: string): Promise<AgentCookieResult> {
  try {
    const r = await fetch(AGENT_BASE + path, { credentials: 'omit' })
    if (!r.ok) return { ok: false, cookie: '', names: [], error: `本机代理返回 ${r.status}` }
    return (await r.json()) as AgentCookieResult
  } catch {
    return { ok: false, cookie: '', names: [], error: '本机代理未运行或无法连接（请确认已启动 cookie 代理）' }
  }
}

export function fetchPmisCookie(): Promise<AgentCookieResult> {
  return agentGet('/pmis-cookie')
}

export function fetchYitianCookie(): Promise<AgentCookieResult> {
  return agentGet('/yitian-cookie')
}
