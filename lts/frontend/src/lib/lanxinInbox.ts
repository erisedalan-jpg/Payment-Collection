// 蓝信收件箱的类型与纯判定。LTS 无归入,仅保留展示所需类型与"可标记已处理"判定。
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
}

/** 已处理的不重复标记。（未解析条目也可标记——LTS 收件箱只读,不写业务数据。） */
export function canHandle(item: Pick<LanxinInboxItem, 'handled'>): boolean {
  return !item.handled
}
