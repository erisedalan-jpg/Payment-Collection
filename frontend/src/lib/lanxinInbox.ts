// 蓝信收件箱的类型与纯判定。口径单一来源在此,组件不重复判断。
export interface LanxinInboxItem {
  id: string
  receivedAt: string
  status: 'parsed' | 'unparsed'
  unparsedReason: string | null
  eventType: string
  staffId: string
  employId: string | null
  name: string | null
  msgType: string
  text: string
  groupId: string | null
  groupName: string | null
  handled: boolean
  handledInfo: Record<string, unknown> | null
  candidateProjects: string[]
}

export const HANDLE_DOMAINS = [
  { value: 'risk', label: '风险跟进' },
  { value: 'temp', label: '临时重点跟进' },
  { value: 'payment_key', label: '回款重点跟进' },
  { value: 'progress', label: '重点项目进展' },
] as const

export type HandleDomain = (typeof HANDLE_DOMAINS)[number]['value']

/** 只有临时跟进是多实例的（V4.0.2），归入时须再选一级。 */
export function needsInstance(domain: string): boolean {
  return domain === 'temp'
}

/** 已归入的不可重复归入；未解析的不许往业务数据里写。 */
export function canHandle(item: Pick<LanxinInboxItem, 'handled' | 'status'>): boolean {
  return !item.handled && item.status === 'parsed'
}
