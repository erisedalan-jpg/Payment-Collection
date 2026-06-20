import { createRouter, createWebHistory } from 'vue-router'
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
import ClosedProjectsView from '@/views/ClosedProjectsView.vue'
import ClosedProjectDetailView from '@/views/ClosedProjectDetailView.vue'

// 路由 meta 类型扩展:title 用于页签标题,hideFilter 控制是否隐藏 FilterBar(数据管理/治理/关于)
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    hideFilter?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/projects', name: 'projects', component: ProjectsView, meta: { title: '在建项目', hideFilter: true } },
    { path: '/project/:id', name: 'project-detail', component: ProjectDetailView, meta: { title: '项目详情', hideFilter: true } },
    { path: '/projects/closed', name: 'closed-projects', component: ClosedProjectsView, meta: { title: '已关闭项目', hideFilter: true } },
    { path: '/closed-project/:id', name: 'closed-project-detail', component: ClosedProjectDetailView, meta: { title: '已关闭项目详情', hideFilter: true } },
    { path: '/activity', name: 'activity', component: ActivityView, meta: { title: '项目动态', hideFilter: true } },
    { path: '/insight', name: 'insight', component: InsightView, meta: { title: '项目分析', hideFilter: true } },
    // 项目分析子页(V1.16.0):milestone/costdetail 新建,board/calendar 迁自回款子域。
    // 均为精确路径,勿引入 /insight/:param 通配,否则会遮蔽 /insight 的 InsightView。
    { path: '/insight/milestone', name: 'insight-milestone', component: MilestoneView, meta: { title: '里程碑管理', hideFilter: true } },
    { path: '/insight/costdetail', name: 'insight-costdetail', component: CostDetailView, meta: { title: '成本分析', hideFilter: true } },
    { path: '/insight/board', name: 'pay-board', component: BoardView, meta: { title: '回款多维分析' } },
    { path: '/insight/calendar', name: 'calendar', component: CalendarView, meta: { title: '回款日历' } },
    { path: '/ledger', name: 'ledger', component: LedgerView, meta: { title: '回款台账' } },
    // 回款分析五页:由旧 /panalysis 单页拆为 /payment/* 平铺独立路由(SP4);均依赖 FilterBar(不 hideFilter)
    // /payment(精确)与 /payment/*(精确子路径)均为精确路由、互不遮蔽，定义顺序不影响解析；
    // 后续新增回款子页须保持精确路径，勿引入 /payment/:param 通配，否则会遮蔽 DashboardView。
    { path: '/payment/projects', name: 'pay-projects', component: PayProjectsView, meta: { title: '回款项目' } },
    { path: '/payment/nodes', name: 'pay-nodes', component: PayNodesView, meta: { title: '回款节点' } },
    { path: '/payment/plan', name: 'pay-plan', component: PayPlanView, meta: { title: '回款进度' } },
    { path: '/payment/risk', name: 'pay-risk', component: PayRiskView, meta: { title: '风险项目' } },
    // 兼容旧深链:board/calendar 迁至 /insight 后,旧路径单跳 redirect 到新规范路径(保 query;board 依赖 ?dim=)
    { path: '/payment/board', redirect: (to) => ({ path: '/insight/board', query: to.query }) },
    { path: '/calendar', redirect: (to) => ({ path: '/insight/calendar', query: to.query }) },
    { path: '/panalysis/:tab?', redirect: (to) => { const t = String(to.params.tab || 'board'); return { path: t === 'board' ? '/insight/board' : '/payment/' + t, query: to.query } } },
    { path: '/board', redirect: (to) => ({ path: '/insight/board', query: to.query }) },
    { path: '/analysis/:tab', redirect: (to) => { const t = String(to.params.tab); return { path: t === 'board' ? '/insight/board' : '/payment/' + t, query: to.query } } },
    { path: '/payment', name: 'payment', component: DashboardView, meta: { title: '回款总览' } },
    { path: '/data', name: 'data', component: DataView, meta: { title: '数据管理', hideFilter: true } },
    { path: '/governance', name: 'governance', component: DataQualityView, meta: { title: '数据治理', hideFilter: true } },
    { path: '/about', name: 'about', component: AboutView, meta: { title: '关于产品', hideFilter: true } },
    // catch-all(含 '/')渲染项目总览——P4 起 '/' 为项目主域首页,旧回款看板迁 /payment
    { path: '/:pathMatch(.*)*', name: 'overview', component: OverviewView, alias: '/', meta: { title: '项目总览', hideFilter: true } },
  ],
})
