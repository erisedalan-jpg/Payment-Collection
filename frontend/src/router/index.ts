import { createRouter, createWebHistory } from 'vue-router'
import type { PageKey } from '@/lib/pageAccess'
import { useAuthStore } from '@/stores/auth'
import { trackNavigation } from '@/lib/viewReturn'
import LoginView from '@/views/LoginView.vue'
import DashboardView from '@/views/DashboardView.vue'
import BoardView from '@/views/BoardView.vue'
import PayProjectsView from '@/views/PayProjectsView.vue'
import PayNodesView from '@/views/PayNodesView.vue'
import PayPlanView from '@/views/PayPlanView.vue'
import PayRiskView from '@/views/PayRiskView.vue'
import LedgerView from '@/views/LedgerView.vue'
import CalendarView from '@/views/CalendarView.vue'
import DataView from '@/views/DataView.vue'
import AboutView from '@/views/AboutView.vue'
import DataQualityView from '@/views/DataQualityView.vue'
import ProjectsView from '@/views/ProjectsView.vue'
import ProjectDetailView from '@/views/ProjectDetailView.vue'
import ActivityView from '@/views/ActivityView.vue'
import OverviewView from '@/views/OverviewView.vue'
import InsightView from '@/views/InsightView.vue'
import MilestoneView from '@/views/MilestoneView.vue'
import CostDetailView from '@/views/CostDetailView.vue'
import RiskBoardView from '@/views/RiskBoardView.vue'
import ClosedProjectsView from '@/views/ClosedProjectsView.vue'
import ClosedProjectDetailView from '@/views/ClosedProjectDetailView.vue'
import AdminView from '@/views/AdminView.vue'
import ChangePasswordView from '@/views/ChangePasswordView.vue'
import KeyProjectsView from '@/views/KeyProjectsView.vue'
import OpportunitiesView from '@/views/OpportunitiesView.vue'
import TempFollowupView from '@/views/TempFollowupView.vue'
import OpportunityFollowupView from '@/views/OpportunityFollowupView.vue'
import OpportunitiesBoardView from '@/views/OpportunitiesBoardView.vue'

// 路由 meta 类型扩展:title 用于页签标题,hideFilter 控制是否隐藏 FilterBar(数据管理/治理/关于),fullscreen 控制裸渲染(无导航,供登录页等全屏视图使用)
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    hideFilter?: boolean
    fullscreen?: boolean
    pageKey?: PageKey
    requiresSuper?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { title: '登录', fullscreen: true } },
    { path: '/change-password', name: 'change-password', component: ChangePasswordView, meta: { title: '修改密码', fullscreen: true } },
    { path: '/projects', name: 'projects', component: ProjectsView, meta: { title: '在建项目', hideFilter: true, pageKey: 'projects' } },
    { path: '/project/:id', name: 'project-detail', component: ProjectDetailView, meta: { title: '项目详情', hideFilter: true, pageKey: 'projects' } },
    { path: '/projects/closed', name: 'closed-projects', component: ClosedProjectsView, meta: { title: '已关闭项目', hideFilter: true, pageKey: 'projects-closed' } },
    { path: '/closed-project/:id', name: 'closed-project-detail', component: ClosedProjectDetailView, meta: { title: '已关闭项目详情', hideFilter: true, pageKey: 'projects-closed' } },
    { path: '/activity', name: 'activity', component: ActivityView, meta: { title: '项目动态', hideFilter: true, pageKey: 'activity' } },
    { path: '/insight', name: 'insight', component: InsightView, meta: { title: '项目分析', hideFilter: true, pageKey: 'insight' } },
    // 项目分析子页(V1.16.0):milestone/costdetail 新建,board/calendar 迁自回款子域。
    // 均为精确路径,勿引入 /insight/:param 通配,否则会遮蔽 /insight 的 InsightView。
    { path: '/insight/milestone', name: 'insight-milestone', component: MilestoneView, meta: { title: '里程碑管理', hideFilter: true, pageKey: 'insight-milestone' } },
    { path: '/insight/costdetail', name: 'insight-costdetail', component: CostDetailView, meta: { title: '成本分析', hideFilter: true, pageKey: 'insight-costdetail' } },
    { path: '/insight/risk', name: 'insight-risk', component: RiskBoardView, meta: { title: '风险看板', hideFilter: true, pageKey: 'insight-risk' } },
    { path: '/opportunities/board', name: 'opportunities-board', component: OpportunitiesBoardView, meta: { title: '商机看板', hideFilter: true, pageKey: 'opportunities-board' } },
    { path: '/insight/board', name: 'pay-board', component: BoardView, meta: { title: '回款多维分析', pageKey: 'insight-board' } },
    { path: '/insight/calendar', name: 'calendar', component: CalendarView, meta: { title: '回款日历', pageKey: 'insight-calendar' } },
    { path: '/projects/key', name: 'projects-key', component: KeyProjectsView, meta: { title: '重点项目进展', hideFilter: true, pageKey: 'projects-key' } },
    { path: '/opportunities', name: 'opportunities', component: OpportunitiesView, meta: { title: '商机清单', hideFilter: true, pageKey: 'opportunities-progress' } },
    { path: '/opportunities/key', name: 'opportunity-followup', component: OpportunityFollowupView, meta: { title: '重点商机跟进', hideFilter: true, pageKey: 'opportunity-followup' } },
    { path: '/projects/temp', name: 'temp-followup', component: TempFollowupView, meta: { title: '临时重点跟进', hideFilter: true, pageKey: 'temp-followup' } },
    { path: '/risk', name: 'risk-followup', component: () => import('@/views/RiskFollowupView.vue'),
      meta: { title: '风险跟进', hideFilter: true, pageKey: 'risk-followup' } },
    { path: '/ledger', name: 'ledger', component: LedgerView, meta: { title: '回款台账', pageKey: 'ledger' } },
    // 回款分析五页:由旧 /panalysis 单页拆为 /payment/* 平铺独立路由(SP4);均依赖 FilterBar(不 hideFilter)
    // /payment(精确)与 /payment/*(精确子路径)均为精确路由、互不遮蔽，定义顺序不影响解析；
    // 后续新增回款子页须保持精确路径，勿引入 /payment/:param 通配，否则会遮蔽 DashboardView。
    { path: '/payment/projects', name: 'pay-projects', component: PayProjectsView, meta: { title: '回款项目', pageKey: 'payment-projects' } },
    { path: '/payment/nodes', name: 'pay-nodes', component: PayNodesView, meta: { title: '回款节点', pageKey: 'payment-nodes' } },
    { path: '/payment/plan', name: 'pay-plan', component: PayPlanView, meta: { title: '回款进度', pageKey: 'payment-plan' } },
    { path: '/payment/risk', name: 'pay-risk', component: PayRiskView, meta: { title: '风险项目', pageKey: 'payment-risk' } },
    // 兼容旧深链:board/calendar 迁至 /insight 后,旧路径单跳 redirect 到新规范路径(保 query;board 依赖 ?dim=)
    { path: '/payment/board', redirect: (to) => ({ path: '/insight/board', query: to.query }) },
    { path: '/calendar', redirect: (to) => ({ path: '/insight/calendar', query: to.query }) },
    { path: '/panalysis/:tab?', redirect: (to) => { const t = String(to.params.tab || 'board'); return { path: t === 'board' ? '/insight/board' : '/payment/' + t, query: to.query } } },
    { path: '/board', redirect: (to) => ({ path: '/insight/board', query: to.query }) },
    { path: '/analysis/:tab', redirect: (to) => { const t = String(to.params.tab); return { path: t === 'board' ? '/insight/board' : '/payment/' + t, query: to.query } } },
    { path: '/payment', name: 'payment', component: DashboardView, meta: { title: '回款总览', pageKey: 'payment' } },
    { path: '/data', name: 'data', component: DataView, meta: { title: '数据管理', hideFilter: true, pageKey: 'data' } },
    { path: '/governance', name: 'governance', component: DataQualityView, meta: { title: '数据治理', hideFilter: true, pageKey: 'governance' } },
    { path: '/about', name: 'about', component: AboutView, meta: { title: '关于产品', hideFilter: true, pageKey: 'about' } },
    { path: '/admin', name: 'admin', component: AdminView, meta: { title: '账号管理', hideFilter: true, requiresSuper: true } },
    // catch-all(含 '/')渲染项目总览——P4 起 '/' 为项目主域首页,旧回款看板迁 /payment
    { path: '/:pathMatch(.*)*', name: 'overview', component: OverviewView, alias: '/', meta: { title: '项目总览', hideFilter: true, pageKey: 'overview' } },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.path === '/login') return true
  await auth.ensureReady()
  if (!auth.isLoggedIn) return { path: '/login' }
  if (auth.user?.mustChangePassword && to.path !== '/change-password') return { path: '/change-password' }
  if (to.meta.requiresSuper && !auth.isSuper) return { path: auth.firstAllowedPath() }
  const key = to.meta.pageKey
  if (auth.isSuper || !key || auth.canAccess(key)) return true
  return { path: auth.firstAllowedPath() }
})

// 下钻返回保持视图状态(V2.5.9):在 DOM 更新前定好 token,避免 afterEach 触发的二次重挂
router.beforeResolve((to, from) => {
  trackNavigation(to.name, from.name)
})
