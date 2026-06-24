export type PageKey =
  | 'overview' | 'projects' | 'projects-closed' | 'activity'
  | 'insight' | 'insight-milestone' | 'insight-costdetail' | 'insight-risk' | 'insight-board' | 'insight-calendar'
  | 'payment' | 'payment-projects' | 'payment-nodes' | 'payment-plan' | 'payment-risk' | 'ledger'
  | 'projects-key' | 'opportunities-progress'
  | 'data' | 'governance' | 'about'

/** allowedPages 含 '*' 或该 key → 可访问(isSuper 由调用方先判)。 */
export function canAccess(allowedPages: string[], key: PageKey): boolean {
  return allowedPages.includes('*') || allowedPages.includes(key)
}

import { PROJECT_LINKS, ANALYSIS_LINKS, KEY_FOLLOWUP_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'

/** 建/编辑账号表单的"可访问页面"选项单一来源:'*' 全部 + 19 个 PageKey(取 nav 标签)。 */
export const PAGE_OPTIONS: { key: string; label: string }[] = [
  { key: '*', label: '全部页面' },
  ...[...PROJECT_LINKS, ...ANALYSIS_LINKS, ...KEY_FOLLOWUP_LINKS, ...PAYMENT_LINKS, ...TOOL_LINKS].map((l) => ({
    key: l.key,
    label: l.label,
  })),
]
