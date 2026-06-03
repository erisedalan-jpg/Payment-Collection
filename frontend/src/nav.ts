// 侧边栏导航配置（取代旧版散落的内联 onclick）
export interface NavLink { label: string; to: string }
export interface TierTab { label: string; tab: string }
export interface TierOpt { label: string; slug: string; color: string }

export const TIERS: TierOpt[] = [
  { label: '100万以上', slug: 'above1m', color: 'var(--red, #ef4444)' },
  { label: '50-100万', slug: '50to100', color: 'var(--orange, #f59e0b)' },
  { label: '50万以下', slug: 'below50', color: 'var(--green, #10b981)' },
]

export const TIER_TABS: TierTab[] = [
  { label: '项目总览', tab: 'projects' },
  { label: '回款节点', tab: 'nodes' },
  { label: '回款状态', tab: 'plan' },
  { label: '风险项目', tab: 'risk' },
  { label: '数据质检', tab: 'integrity' },
]

export const OVERVIEW_LINKS: NavLink[] = [
  { label: '看板首页', to: '/' },
  { label: '区间对比', to: '/compare' },
  { label: '回款日历', to: '/calendar' },
  { label: '临期跟进', to: '/followup' },
  { label: '回款台账', to: '/ledger' },
]

export const TOOL_LINKS: NavLink[] = [
  { label: '项目经理视图', to: '/pmview' },
  { label: '数据管理', to: '/data' },
  { label: '关于产品', to: '/about' },
]

// slug ↔ 中文档位 映射（路由用 slug，避免 URL 中文）
export const TIER_BY_SLUG: Record<string, string> = Object.fromEntries(
  TIERS.map((t) => [t.slug, t.label]),
)
