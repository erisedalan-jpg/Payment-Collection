/** 全部可授权页面 key —— 运行时单一来源。PageKey 由其派生,契约测试据此校验 nav 覆盖完整。 */
export const PAGE_KEYS = [
  'overview', 'projects', 'projects-closed', 'activity',
  'insight', 'insight-milestone', 'insight-costdetail', 'insight-risk', 'insight-board', 'insight-calendar', 'opportunities-board',
  'payment', 'payment-projects', 'payment-nodes',
  'projects-key', 'opportunities-progress', 'temp-followup', 'opportunity-followup', 'risk-followup', 'payment-key',
  'yitian', 'yitian-detail', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer',
  'data', 'governance', 'budget', 'about',
] as const

export type PageKey = typeof PAGE_KEYS[number]

/** allowedPages 含 '*' 或该 key → 可访问(isSuper 由调用方先判)。 */
export function canAccess(allowedPages: string[], key: PageKey): boolean {
  return allowedPages.includes('*') || allowedPages.includes(key)
}

import { ALL_PAGE_LINKS } from '@/nav'

/** 建/编辑账号表单的「可访问页面」选项单一来源:'*' 全部 + 30 个 PageKey(取 nav 标签)。
 *  ALL_PAGE_LINKS 已含 tab 页,勿改回按侧栏 LINKS 派生 —— 那会让 10 个分析页无法授权。 */
export const PAGE_OPTIONS: { key: string; label: string }[] = [
  { key: '*', label: '全部页面' },
  ...ALL_PAGE_LINKS.map((l) => ({ key: l.key, label: l.label })),
]
