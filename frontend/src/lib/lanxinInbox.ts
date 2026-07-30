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
  /** 来源。缺失 = V4.5.8 及以前的条目,一律按蓝信文本回复处理。 */
  source?: 'h5' | 'callback'
  /** H5 反馈自带的项目号(project 侧)。文本回复没有这个信息。 */
  projectId?: string | null
  /** H5 反馈自带的问题码(timesheet 侧)。 */
  issueCode?: string | null
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

/**
 * 风险跟进的 store 【不按 projectId 索引】，而按复合键 `${projectId}::${风险编码}`
 * （见 lib/riskRows.ts，读取端没有任何回退到裸 projectId 的分支）。四个可归入域里
 * 只有它是复合键，所以归入时必须再选一级「风险记录」——否则写进去的内容前端永远
 * 读不到，而条目已被标 handled，回复就此静默蒸发。
 */
export function needsRiskCode(domain: string): boolean {
  return domain === 'risk'
}

export interface RiskChoice {
  code: string
  label: string
}

/**
 * 从主数据 pmisMap 取某项目的风险记录，供归入抽屉的二级下拉使用。
 * 字段名与 lib/riskRows.ts 同源：风险编码 / 风险名称 / 风险等级 / 风险状态。
 * 无风险编码的记录直接跳过——没有 code 就拼不出 key，选了也只会写进幽灵位置。
 */
export function riskChoices(
  pmisMap: Record<string, { riskRecords?: Record<string, unknown>[] } | undefined>,
  projectId: string,
): RiskChoice[] {
  const recs = (pmisMap?.[projectId]?.riskRecords ?? []) as Record<string, unknown>[]
  const out: RiskChoice[] = []
  const seen = new Set<string>()
  for (const rr of recs) {
    const code = String(rr?.['风险编码'] ?? '').trim()
    if (!code || seen.has(code)) continue
    seen.add(code)
    const name = String(rr?.['风险名称'] ?? '').trim()
    const level = String(rr?.['风险等级'] ?? '').trim()
    const state = String(rr?.['风险状态'] ?? '').trim()
    const tail = [level, state].filter(Boolean).join(' · ')
    out.push({ code, label: [code, name].filter(Boolean).join(' ') + (tail ? `（${tail}）` : '') })
  }
  return out
}

/** 已归入的不可重复归入；未解析的不许往业务数据里写。 */
export function canHandle(item: Pick<LanxinInboxItem, 'handled' | 'status'>): boolean {
  return !item.handled && item.status === 'parsed'
}

/** 来源显示名。缺 source 键 = 老条目 = 蓝信文本回复。 */
export function sourceLabel(item: Pick<LanxinInboxItem, 'source'>): string {
  return item.source === 'h5' ? 'H5 反馈' : '蓝信回复'
}
