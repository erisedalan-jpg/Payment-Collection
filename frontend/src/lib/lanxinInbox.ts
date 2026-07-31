// 蓝信收件箱的类型与纯判定。口径单一来源在此,组件不重复判断。
import { projectMatches, type ScopeFilter, type ScopeProjectInput } from './tempScope'

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
  /** 上一次归入被撤销的痕迹(V4.5.10)。撤销【不删】已写进跟进域的正文,
   *  故必须把旧去向留着告诉超管"残留内容在哪儿"。 */
  unhandledFrom?: { info: Record<string, unknown> | null; at: string; by: string } | null
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

/**
 * 归入写进目标域的哪个字段。key 与后端 server._LANXIN_HANDLE_TARGETS 同源
 * （tests/test_lanxin_wiring.py 直接读本文件比对，防两端漂移）；label 与四个
 * 目标页表头上的列名逐字一致 —— 抽屉里要告诉超管"内容会出现在哪一列"，
 * 写个近似的名字等于让他到了页面还要自己找。
 */
export const HANDLE_FIELDS: Record<HandleDomain, { key: string; label: string }> = {
  risk: { key: 'followAction', label: '跟进动作' },
  payment_key: { key: 'followAction', label: '跟进动作' },
  temp: { key: 'weekProgress', label: '本周工作进展' },
  progress: { key: 'weekProgress', label: '本周工作进展' },
}

/** 范围完全没配（无组，或所有组都是空组）。projectMatches 对这两种都返回 false，
 *  但对超管来说"你还没设范围"和"这个项目不符合范围"是两件完全不同的事。 */
export function scopeUnset(scope: ScopeFilter | null | undefined): boolean {
  if (!scope || !Array.isArray(scope.groups) || !scope.groups.length) return true
  return scope.groups.every((g) => !g.conditions || !g.conditions.length)
}

export interface HandleVisibility {
  /** 归入后目标页会不会真的渲染出这一行。false = 写进去也永远看不见。 */
  visible: boolean
  /** visible=false 时的原因，须可操作（指出该去改什么）。 */
  reason: string
}

/**
 * 【V4.5.10 核心修复】判断"归入之后，目标页会不会显示这条内容"。
 *
 * 四个目标域里有三个【只渲染项目全集的一个子集】：
 *   · payment_key / temp —— 行集 = 范围设置命中的项目（projectMatches）。
 *     范围没配时 projectMatches 恒 false ⇒ 该页一行都没有。
 *   · progress          —— 行集 = 重点项目（isKeyProject：P1 或 TOP1000 且合同>100万）。
 *   · risk              —— 无 scope 时展示全部，且另有 riskCode 必填守卫，安全。
 *
 * 而归入是按 projectId 直接写进 store 的 current[...]，写入本身永远成功。
 * 于是"项目不在目标页行集内"= 内容写进去了、条目被标 handled、按钮转灰，
 * 而目标页上什么都没有 —— 静默数据丢失，全程零报错。这正是现网报障
 * 「点击归入后在对应位置找不到内容」的成因。
 *
 * 判定复用【目标页自己在用的那两个函数】(projectMatches / isKeyProject)，
 * 不另写一份等价逻辑 —— 否则页面口径一改，这里的判断就成了骗人的绿灯。
 *
 * 【为什么这道闸只在前端】：范围设置引擎(tempScope.ts)与重点项目判定
 * (keyProjects.ts)都只存在于前端 TypeScript，后端没有、也不该有第二份实现
 * （跨语言复制口径正是本仓反复吃过亏的事）。后端这一侧的兜底不是重算一遍，
 * 而是「归入可撤销」(/api/lanxin/inbox/unhandle)：万一有人绕过界面直接打
 * API 写歪了，收件箱里的原文一直都在，撤销后可重新归入。
 */
export function handleVisibility(
  domain: HandleDomain | '',
  ctx: {
    projectId: string
    /** buildScopeInputs 产出的、该项目对应的那一条；找不到 = 该项目不在下发范围内 */
    scopeInput?: ScopeProjectInput
    paymentKeyScope?: ScopeFilter | null
    /** 所选临时跟进实例的 scope；未选实例传 undefined */
    tempScope?: ScopeFilter | null
    tempInstanceName?: string
    /** progress 域用：该项目是否为重点项目（调用方用 isKeyProject 算） */
    isKeyProject?: boolean
  },
): HandleVisibility {
  const pid = ctx.projectId
  if (!domain || !pid) return { visible: true, reason: '' }

  if (domain === 'risk') return { visible: true, reason: '' }

  if (domain === 'progress') {
    if (ctx.isKeyProject) return { visible: true, reason: '' }
    return {
      visible: false,
      reason: `项目 ${pid} 不是重点项目（级别 P1，或 TOP1000 客户且合同金额 > 100 万元），`
        + '「重点项目进展」页不会显示它 —— 归入后内容写进去了也看不到。请改选其它目标域。',
    }
  }

  // payment_key / temp:行集由范围设置决定
  const isTemp = domain === 'temp'
  const pageName = isTemp
    ? `临时重点跟进 · ${ctx.tempInstanceName || '所选实例'}`
    : '回款重点跟进'
  const scope = isTemp ? ctx.tempScope : ctx.paymentKeyScope
  if (isTemp && scope === undefined) return { visible: true, reason: '' } // 还没选实例，先不判
  if (scopeUnset(scope)) {
    return {
      visible: false,
      reason: `「${pageName}」尚未设置范围，该页当前【一行都不显示】，`
        + '归入的内容不会出现在任何地方。请先到该页「范围设置」里配置范围，或改选其它目标域。',
    }
  }
  if (!ctx.scopeInput || !projectMatches(ctx.scopeInput, scope as ScopeFilter)) {
    return {
      visible: false,
      reason: `项目 ${pid} 不在「${pageName}」的范围设置内，该页不会显示这一行 —— `
        + '归入后内容看不到。请调整该页范围设置，或改选其它目标域。',
    }
  }
  return { visible: true, reason: '' }
}
