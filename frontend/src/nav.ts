// 侧边栏导航配置（取代旧版散落的内联 onclick）
import type { PageKey } from '@/lib/pageAccess'
export interface NavLink { label: string; to: string; key: PageKey }
export interface TierTab { label: string; tab: string }
export interface TierOpt { label: string; slug: string; color: string }

export const TIERS: TierOpt[] = [
  { label: '100万以上', slug: 'above1m', color: 'var(--danger)' },
  { label: '50-100万', slug: '50to100', color: 'var(--warn)' },
  { label: '50万以下', slug: 'below50', color: 'var(--ok)' },
]

export const TIER_TABS: TierTab[] = [
  { label: '项目总览', tab: 'projects' },
  { label: '回款节点', tab: 'nodes' },
  { label: '回款进度', tab: 'plan' },
  { label: '风险项目', tab: 'risk' },
]

// 项目主域（P2 起逐期补全：P3 项目动态 /activity、P4 项目总览 /、子项目2 已关闭项目）
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目总览', to: '/', key: 'overview' },
  { label: '在建项目', to: '/projects', key: 'projects' },
  { label: '已关闭项目', to: '/projects/closed', key: 'projects-closed' },
  { label: '项目动态', to: '/activity', key: 'activity' },
]

// 项目分析中心（V1.16.0）：/insight 主入口下挂 5 子页，侧栏二级缩进(.nav-sub)平铺
export const ANALYSIS_LINKS: NavLink[] = [
  { label: '项目多维分析', to: '/insight', key: 'insight' },
  { label: '里程碑管理', to: '/insight/milestone', key: 'insight-milestone' },
  { label: '成本分析', to: '/insight/costdetail', key: 'insight-costdetail' },
  { label: '回款多维分析', to: '/insight/board', key: 'insight-board' },
  { label: '回款日历', to: '/insight/calendar', key: 'insight-calendar' },
]

// 回款重点子域（SP4 拆分；V1.16.0 board/calendar 迁出至项目分析中心）
export const PAYMENT_LINKS: NavLink[] = [
  { label: '回款总览', to: '/payment', key: 'payment' },
  { label: '回款项目', to: '/payment/projects', key: 'payment-projects' },
  { label: '回款节点', to: '/payment/nodes', key: 'payment-nodes' },
  { label: '回款进度', to: '/payment/plan', key: 'payment-plan' },
  { label: '风险项目', to: '/payment/risk', key: 'payment-risk' },
  { label: '回款台账', to: '/ledger', key: 'ledger' },
]

export const TOOL_LINKS: NavLink[] = [
  { label: '数据管理', to: '/data', key: 'data' },
  { label: '数据治理', to: '/governance', key: 'governance' },
  { label: '关于产品', to: '/about', key: 'about' },
]

// slug ↔ 中文档位 映射（路由用 slug，避免 URL 中文）
export const TIER_BY_SLUG: Record<string, string> = Object.fromEntries(
  TIERS.map((t) => [t.slug, t.label]),
)
