// 侧边栏导航配置（取代旧版散落的内联 onclick）
import type { PageKey } from '@/lib/pageAccess'
export interface NavLink { label: string; to: string; key: PageKey }
export interface TierOpt { label: string; slug: string; color: string }

export const TIERS: TierOpt[] = [
  { label: '100万以上', slug: 'above1m', color: 'var(--danger)' },
  { label: '50-100万', slug: '50to100', color: 'var(--warn)' },
  { label: '50万以下', slug: 'below50', color: 'var(--ok)' },
]

// 项目主域（P2 起逐期补全：P3 项目动态 /activity、P4 项目总览 /、子项目2 已关闭项目）
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目总览', to: '/', key: 'overview' },
  { label: '在建项目', to: '/projects', key: 'projects' },
  { label: '已关闭项目', to: '/projects/closed', key: 'projects-closed' },
  { label: '商机清单', to: '/opportunities', key: 'opportunities-progress' },
  { label: '项目动态', to: '/activity', key: 'activity' },
]

// 项目分析中心（V1.16.0）：/insight 主入口下挂 5 子页，侧栏二级缩进(.nav-sub)平铺
export const ANALYSIS_LINKS: NavLink[] = [
  { label: '项目多维分析', to: '/insight', key: 'insight' },
  { label: '里程碑管理', to: '/insight/milestone', key: 'insight-milestone' },
  { label: '成本分析', to: '/insight/costdetail', key: 'insight-costdetail' },
  { label: '风险看板', to: '/insight/risk', key: 'insight-risk' },
  { label: '商机看板', to: '/opportunities/board', key: 'opportunities-board' },
  { label: '回款多维分析', to: '/insight/board', key: 'insight-board' },
  { label: '回款日历', to: '/insight/calendar', key: 'insight-calendar' },
]

// 重点跟进(SP-2):重点项目进展页
export const KEY_FOLLOWUP_LINKS: NavLink[] = [
  { label: '重点项目进展', to: '/projects/key', key: 'projects-key' },
  { label: '重点商机跟进', to: '/opportunities/key', key: 'opportunity-followup' },
  { label: '临时重点跟进', to: '/projects/temp', key: 'temp-followup' },
  { label: '风险跟进', to: '/risk', key: 'risk-followup' },
  { label: '回款重点跟进', to: '/payment/key', key: 'payment-key' },
]

// 回款重点子域（SP4 拆分；V1.16.0 board/calendar 迁出至项目分析中心；P1 删 plan/risk/ledger 三页）
export const PAYMENT_LINKS: NavLink[] = [
  { label: '回款总览', to: '/payment', key: 'payment' },
  { label: '回款项目', to: '/payment/projects', key: 'payment-projects' },
  { label: '回款节点', to: '/payment/nodes', key: 'payment-nodes' },
]

// 倚天工时域(V3.0.0):离线导入工时.xlsx → 合规检查 / 工时统计 / 趋势 / 客户支持
export const YITIAN_LINKS: NavLink[] = [
  { label: '倚天工时总览', to: '/yitian', key: 'yitian' },
  { label: '工时明细', to: '/yitian/detail', key: 'yitian-detail' },
  { label: '工时合规检查', to: '/yitian/compliance', key: 'yitian-compliance' },
  { label: '工时统计分析', to: '/yitian/analytics', key: 'yitian-analytics' },
  { label: '工时趋势分析', to: '/yitian/trend', key: 'yitian-trend' },
  { label: '客户支持分析', to: '/yitian/customer', key: 'yitian-customer' },
]

export const TOOL_LINKS: NavLink[] = [
  { label: '数据管理', to: '/data', key: 'data' },
  { label: '数据治理', to: '/governance', key: 'governance' },
  { label: '概算工具', to: '/budget', key: 'budget' },
  { label: '关于产品', to: '/about', key: 'about' },
]

// slug ↔ 中文档位 映射（路由用 slug，避免 URL 中文）
export const TIER_BY_SLUG: Record<string, string> = Object.fromEntries(
  TIERS.map((t) => [t.slug, t.label]),
)
