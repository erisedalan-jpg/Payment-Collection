import { api } from '@/api/client'
import type { PushItem } from '@/lib/lanxin/items'
import type { LanxinInboxItem } from '@/lib/lanxinInbox'

export interface LanxinRouteItem {
  code: string
  enabled: boolean
  primary: boolean
  supervisorLevels: number
}

export interface LanxinRoute {
  key: string
  label: string
  enabled: boolean
  items: LanxinRouteItem[]
}

export interface LanxinConfig {
  enabled: boolean
  sendIntervalMs: number
  /** 发送身份：应用号(account) | 智能机器人(bot)，默认 account。 */
  sendAs: 'account' | 'bot'
  credentials: {
    appId: string; appSecret: string; orgId: string
    apiGateway: string; idType: string; hasSecret?: boolean
    // 回调双凭证(开发者中心「回调事件」页申请)。callbackAesKey/callbackSignToken 经
    // public_config 脱敏后恒为空串，has* 布尔才是「是否已配置」的唯一依据。
    callbackAesKey: string; callbackSignToken: string
    hasCallbackAesKey?: boolean; hasCallbackSignToken?: boolean
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

/** 回调验签被拒次数——数据源是 GET /api/lanxin/config 顶层的 rejected 字段。
 *  lastReason 区分最近一次拒绝是 'signature'(验签失败,通常是签名令牌填错)
 *  还是 'stale'(时间戳新鲜度检查失败,通常是时间戳格式/两端时钟对不上)——两者共用同一个
 *  count,不分原因的话超管只看到计数在涨,分不清该查哪一样。 */
export interface LanxinRejectedStats {
  count: number
  lastAt: string
  lastFrom?: string
  lastReason?: 'signature' | 'stale' | ''
}

/** 完整响应:config + rejected(验签失败计数)。一次请求拿两样,
 *  给需要 rejected 的调用方(目前只有 LanxinConfigCard.vue)用。 */
export async function getLanxinConfigFull(): Promise<{ config: LanxinConfig; rejected?: LanxinRejectedStats }> {
  return await api.get<{ config: LanxinConfig; rejected?: LanxinRejectedStats }>('/api/lanxin/config')
}
/** 只要 config 的薄包装—— LanxinPushDrawer.vue 等既有调用方签名与返回类型不变,
 *  不必因为新增 rejected 而跟着改。 */
export async function getLanxinConfig(): Promise<LanxinConfig> {
  return (await getLanxinConfigFull()).config
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

// —— 收件箱：员工在蓝信里的回复回流本系统 ——
export interface LanxinInboxResp {
  success: boolean
  items: LanxinInboxItem[]
  rejected: LanxinRejectedStats
  received: number
}

export async function getLanxinInbox(): Promise<LanxinInboxResp> {
  return await api.get<LanxinInboxResp>('/api/lanxin/inbox')
}

/** LTS 无归入,仅标记已处理。后端只认 itemId。 */
export async function markLanxinInboxHandled(itemId: string): Promise<{ success: boolean }> {
  return await api.post<{ success: boolean }>('/api/lanxin/inbox/handle', { itemId })
}

export async function deleteLanxinInboxItem(itemId: string): Promise<{ success: boolean }> {
  return await api.post<{ success: boolean }>('/api/lanxin/inbox/delete', { itemId })
}
