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

// 项目主域（P2 起逐期补全：P3 项目动态 /activity、P4 项目总览 /、P5 项目分析 /insight）
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目总览', to: '/' },
  { label: '项目清单', to: '/projects' },
  { label: '项目动态', to: '/activity' },
  { label: '项目分析', to: '/insight' },
]

// 回款重点子域（spec 2：分组低一级呈现；P4 起回款总览迁 /payment，P6 再瘦身）
export const PAYMENT_LINKS: NavLink[] = [
  { label: '回款总览', to: '/payment' },
  { label: '回款日历', to: '/calendar' },
  { label: '临期跟进', to: '/followup' },
  { label: '回款台账', to: '/ledger' },
  { label: '多维看板', to: '/board' },
]

export const ANALYSIS_TAB_LINKS: NavLink[] = [
  { label: '项目总览', to: '/analysis/projects' },
  { label: '回款节点', to: '/analysis/nodes' },
  { label: '回款状态', to: '/analysis/plan' },
  { label: '风险项目', to: '/analysis/risk' },
  { label: '数据质检', to: '/analysis/integrity' },
]

export const TOOL_LINKS: NavLink[] = [
  { label: '数据管理', to: '/data' },
  { label: '数据治理', to: '/governance' },
  { label: '关于产品', to: '/about' },
]

// slug ↔ 中文档位 映射（路由用 slug，避免 URL 中文）
export const TIER_BY_SLUG: Record<string, string> = Object.fromEntries(
  TIERS.map((t) => [t.slug, t.label]),
)
