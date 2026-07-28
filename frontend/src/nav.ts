// 侧边栏导航配置（取代旧版散落的内联 onclick）
import type { PageKey } from '@/lib/pageAccess'
export interface NavLink { label: string; to: string; key: PageKey }
export interface TierOpt { label: string; slug: string; color: string }

export const TIERS: TierOpt[] = [
  { label: '100万以上', slug: 'above1m', color: 'var(--danger)' },
  { label: '50-100万', slug: '50to100', color: 'var(--warn)' },
  { label: '50万以下', slug: 'below50', color: 'var(--ok)' },
]

// slug ↔ 中文档位 映射（路由用 slug，避免 URL 中文）
export const TIER_BY_SLUG: Record<string, string> = Object.fromEntries(
  TIERS.map((t) => [t.slug, t.label]),
)

// ============================================================
// V4.4.7 导航重组:按业务对象分组,组内恒为「总览 → 明细 → 分析」。
// 旧的 6 个 LINKS 常量已随 AppSidebar 切换一并删除,下方结构是导航与授权的唯一数据源。
// ============================================================

export type TabGroupId = 'project-analysis' | 'payment-analysis' | 'yitian-analysis'

/** tab 容器入口:既无自己的 pageKey 也无固定 to —— 两者都按权限动态求值(见 AppSidebar.resolveItem)。
 *  单列一个类型是为了让「不与 tab 首项撞 key」成为结构保证,而非派生时的去重补丁。 */
export interface NavTabEntry { label: string; group: TabGroupId }
export type NavItem = NavLink | NavTabEntry

export function isTabEntry(i: NavItem): i is NavTabEntry {
  return 'group' in i
}

/** tab 组:不进侧栏,但必须可授权、可设数据范围。tab 显示文案与 router meta.title 相互独立。 */
export const TAB_GROUPS: Record<TabGroupId, NavLink[]> = {
  'project-analysis': [
    { label: '多维分析', to: '/insight', key: 'insight' },
    { label: '里程碑管理', to: '/insight/milestone', key: 'insight-milestone' },
    { label: '成本分析', to: '/insight/costdetail', key: 'insight-costdetail' },
    { label: '风险看板', to: '/insight/risk', key: 'insight-risk' },
  ],
  'payment-analysis': [
    { label: '回款多维分析', to: '/payment/board', key: 'insight-board' },
    { label: '回款日历', to: '/payment/calendar', key: 'insight-calendar' },
  ],
  'yitian-analysis': [
    { label: '合规检查', to: '/yitian/compliance', key: 'yitian-compliance' },
    { label: '统计分析', to: '/yitian/analytics', key: 'yitian-analytics' },
    { label: '趋势分析', to: '/yitian/trend', key: 'yitian-trend' },
    { label: '客户支持分析', to: '/yitian/customer', key: 'yitian-customer' },
    { label: '客户与产品分析', to: '/yitian/customer-product', key: 'yitian-customer-product' },
    { label: '工时治理监控', to: '/yitian/governance', key: 'yitian-governance' },
  ],
}

export interface NavSection { id: string; label: string; items: NavItem[] }

/** 侧栏分组注册表。AppSidebar 用 v-for 遍历它渲染,取代原先 7 段复制粘贴的模板。
 *  新增分组/页面只需登记进此表,无需再改模板、也无需加 activeSectionKey 特判。 */
export const NAV_SECTIONS: NavSection[] = [
  { id: 'project', label: '项目', items: [
    { label: '项目总览', to: '/', key: 'overview' },
    { label: '在建项目', to: '/projects', key: 'projects' },
    { label: '已关闭项目', to: '/projects/closed', key: 'projects-closed' },
    { label: '项目动态', to: '/activity', key: 'activity' },
    { label: '项目分析', group: 'project-analysis' },
  ] },
  { id: 'payment', label: '回款', items: [
    { label: '回款总览', to: '/payment', key: 'payment' },
    { label: '回款项目', to: '/payment/projects', key: 'payment-projects' },
    { label: '回款节点', to: '/payment/nodes', key: 'payment-nodes' },
    { label: '回款分析', group: 'payment-analysis' },
  ] },
  { id: 'opportunity', label: '商机', items: [
    { label: '商机清单', to: '/opportunities', key: 'opportunities-progress' },
    { label: '商机看板', to: '/opportunities/board', key: 'opportunities-board' },
  ] },
  { id: 'yitian', label: '倚天工时', items: [
    { label: '工时总览', to: '/yitian', key: 'yitian' },
    { label: '工时明细', to: '/yitian/detail', key: 'yitian-detail' },
    { label: '工时分析', group: 'yitian-analysis' },
  ] },
  { id: 'keyfollowup', label: '重点跟进', items: [
    { label: '重点项目进展', to: '/projects/key', key: 'projects-key' },
    { label: '重点商机跟进', to: '/opportunities/key', key: 'opportunity-followup' },
    { label: '临时重点跟进', to: '/projects/temp', key: 'temp-followup' },
    { label: '风险跟进', to: '/risk', key: 'risk-followup' },
    { label: '回款重点跟进', to: '/payment/key', key: 'payment-key' },
  ] },
  { id: 'tools', label: '工具', items: [
    { label: '数据管理', to: '/data', key: 'data' },
    { label: '数据治理', to: '/governance', key: 'governance' },
    { label: '概算工具', to: '/budget', key: 'budget' },
    { label: '关于产品', to: '/about', key: 'about' },
  ] },
]

/** section 内全部可授权页面:一级 NavLink + 容器入口展开后的 tab 页。
 *  承重点 ①:PAGE_OPTIONS / auth.firstAllowedPath / AdminView.NAV_GROUPS / AdminView.overrideTargets
 *  四处必须用它派生,漏一处该页就静默失去授权或数据范围配置能力。 */
export function sectionPageLinks(s: NavSection): NavLink[] {
  return s.items.flatMap((i) => (isTabEntry(i) ? TAB_GROUPS[i.group] : [i]))
}

/** 全部可授权页面(32 个),上述四处消费方的唯一来源。 */
export const ALL_PAGE_LINKS: NavLink[] = NAV_SECTIONS.flatMap(sectionPageLinks)
