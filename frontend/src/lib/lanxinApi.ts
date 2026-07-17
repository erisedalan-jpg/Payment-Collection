import { api } from '@/api/client'
import type { PushItem } from '@/lib/lanxin/items'

export interface LanxinRoute {
  key: string
  label: string
  enabled: boolean
  issueCodes?: string[]
  reasons?: string[]
  recipients: { primary: boolean; supervisorLevels: number }
}

export interface LanxinConfig {
  enabled: boolean
  sendIntervalMs: number
  credentials: {
    appId: string; appSecret: string; orgId: string
    apiGateway: string; idType: string; hasSecret?: boolean
  }
  routes: LanxinRoute[]
}

export interface LanxinPlanRecipient {
  employId: string; name: string; role: 'primary' | 'supervisor'
  card: Record<string, unknown>
}
export interface LanxinPlan {
  recipients: LanxinPlanRecipient[]
  unresolved: { kind: string; id: string; name: string; reason: string }[]
  totals: { recipients: number; unresolved: number }
}
export interface LanxinSendResult {
  sent: number
  failed: { employId: string; name: string; errCode: number; errMsg: string }[]
  msgIds: string[]
}

export async function getLanxinConfig(): Promise<LanxinConfig> {
  return (await api.get<{ config: LanxinConfig }>('/api/lanxin/config')).config
}
export async function saveLanxinConfig(cfg: LanxinConfig): Promise<LanxinConfig> {
  return (await api.post<{ config: LanxinConfig }>('/api/lanxin/config', { config: cfg })).config
}
export async function lanxinSelftest(employId: string) {
  return await api.post<{ steps: { name: string; ok: boolean; msg: string }[] }>(
    '/api/lanxin/selftest', { employId })
}
export async function lanxinPreview(items: PushItem[]): Promise<LanxinPlan> {
  return (await api.post<{ plan: LanxinPlan }>('/api/lanxin/preview', { items })).plan
}
export async function lanxinSend(items: PushItem[]) {
  return await api.post<{ plan: LanxinPlan; result: LanxinSendResult }>(
    '/api/lanxin/send', { items })
}
