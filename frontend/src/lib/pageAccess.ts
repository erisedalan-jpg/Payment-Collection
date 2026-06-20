export type PageKey =
  | 'overview' | 'projects' | 'projects-closed' | 'activity'
  | 'insight' | 'insight-milestone' | 'insight-costdetail' | 'insight-board' | 'insight-calendar'
  | 'payment' | 'payment-projects' | 'payment-nodes' | 'payment-plan' | 'payment-risk' | 'ledger'
  | 'data' | 'governance' | 'about'

/** allowedPages 含 '*' 或该 key → 可访问(isSuper 由调用方先判)。 */
export function canAccess(allowedPages: string[], key: PageKey): boolean {
  return allowedPages.includes('*') || allowedPages.includes(key)
}
