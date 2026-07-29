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
  /** 反馈时限(小时,1~720)。卡片文案「N 小时内未反馈…」与《未响应清单》判定共用此值。 */
  reviewDeadlineHours: number
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

/** 回调验签被拒次数——数据源是 GET /api/lanxin/config 顶层的 rejected 字段(Task 6 提供)。
 *  Task 6 落地前接口不含该字段,故 getLanxinRejectedStats() 允许解出 undefined,调用方按 0 兜底。
 *  lastReason(Important-2)区分最近一次拒绝是 'signature'(验签失败,通常是签名令牌填错)
 *  还是 'stale'(时间戳新鲜度检查失败,通常是时间戳格式/两端时钟对不上)——两者共用同一个
 *  count,不分原因的话超管只看到计数在涨,分不清该查哪一样。 */
export interface LanxinRejectedStats {
  count: number
  lastAt: string
  lastFrom?: string
  lastReason?: 'signature' | 'stale' | ''
  /** 被拒报文的 timestamp【原值】(后端已 64 字符封顶)。不是密钥、不是报文体，可安全下发。
   *  存在的唯一理由：lastReason==='stale' 时，「蓝信到底发的什么格式」在界面上无从看起——
   *  存证在这一步之前就被拦下没落盘、报文体按铁律不许记，只剩服务器日志，而看日志既要 root
   *  又要知道 grep 什么。不把它显示出来，等于把「需要 root」换成「需要会开 devtools」。 */
  lastTimestampSample?: string
}

/** 完整响应:config + rejected(验签失败计数,Task 6 提供)。一次请求拿两样,
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

// —— 收件箱（Task 6/8）：员工在蓝信里的回复回流本系统 ——
export interface LanxinInboxResp {
  success: boolean
  items: LanxinInboxItem[]
  rejected: LanxinRejectedStats
  received: number
}
export interface LanxinInboxHandleResp {
  success: boolean
  handledInfo: Record<string, unknown>
}

export async function getLanxinInbox(): Promise<LanxinInboxResp> {
  return await api.get<LanxinInboxResp>('/api/lanxin/inbox')
}
/** instanceId 只有 domain==='temp' 时才有意义(见 needsInstance)，riskCode 只有
 *  domain==='risk' 时才有意义(见 needsRiskCode)，其余域传 undefined 即可——
 *  JSON.stringify 会把值为 undefined 的键整个丢掉，后端读不到等同于没传。
 *
 *  传的是 riskCode 而【不是】拼好的 riskKey：复合键由后端用 projectId 拼
 *  (server.lanxin_risk_key)，前端拼好再传的话可以送进一个与 projectId 对不上的键。 */
export async function handleLanxinInboxItem(
  itemId: string, domain: string, projectId: string,
  instanceId?: string, riskCode?: string,
): Promise<LanxinInboxHandleResp> {
  return await api.post<LanxinInboxHandleResp>('/api/lanxin/inbox/handle',
    { itemId, domain, projectId, instanceId, riskCode })
}
export async function deleteLanxinInboxItem(itemId: string): Promise<{ success: boolean }> {
  return await api.post<{ success: boolean }>('/api/lanxin/inbox/delete', { itemId })
}

// —— 未响应清单（Task 7/9）：已推送但超过反馈时限未收到任何回复的人,「谁该催」清单 ——
// 判定是【人级】而非项目级:一期唯一回流通道是员工直接文本回复,回复正文不含项目信息,
// 故某人在推送后回过任意一条即整批算已响应;二期 H5 反馈带项目号后才能下钻到项目级
// (见 lanxin_unresponded.py 模块顶部的精度边界说明)。
// role 决定这一行要不要出现在默认的「仅未响应」待催视图里：
//   'primary'    本人明细卡，卡上带「N 小时内未反馈将列入《未响应清单》」的动作要求 → 该催
//   'supervisor' 上级汇总卡，卡上【没有】动作要求、没有任何反馈时限承诺 → 只是知会，不该催
//   ''           V4.5.8 之前的老台账没有这个键 → 不排除、不丢行（向后兼容）
export interface UnrespondedRow {
  sentAt: string
  employId: string
  name: string
  routeKey: string
  role: string
  projectCount: number
  dueAt: string
  overdue: boolean
  responded: boolean
  firstResponseAt: string
}

export async function getLanxinUnresponded():
  Promise<{ success: boolean; rows: UnrespondedRow[]; deadlineHours: number }> {
  return await api.get<{ success: boolean; rows: UnrespondedRow[]; deadlineHours: number }>('/api/lanxin/unresponded')
}
