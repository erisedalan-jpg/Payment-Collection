import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import PayAnalysisView from '@/views/PayAnalysisView.vue'
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
    { path: '/projects', name: 'projects', component: ProjectsView, meta: { title: '项目清单', hideFilter: true } },
    { path: '/project/:id', name: 'project-detail', component: ProjectDetailView, meta: { title: '项目详情', hideFilter: true } },
    { path: '/activity', name: 'activity', component: ActivityView, meta: { title: '项目动态', hideFilter: true } },
    { path: '/insight', name: 'insight', component: InsightView, meta: { title: '项目分析', hideFilter: true } },
    { path: '/calendar', name: 'calendar', component: CalendarView, meta: { title: '回款日历' } },
    { path: '/ledger', name: 'ledger', component: LedgerView, meta: { title: '回款台账' } },
    // 回款分析归并页:多维看板(board) + 业务分析五 tab;:tab? 缺省视为 board;六 tab 全依赖 FilterBar(不 hideFilter)
    { path: '/panalysis/:tab?', name: 'panalysis', component: PayAnalysisView, meta: { title: '回款分析' } },
    // 旧路由 redirect 兼容(保留深链):/board 保 query(dim),/analysis/:tab 映射 tab
    { path: '/board', redirect: (to) => ({ path: '/panalysis/board', query: to.query }) },
    { path: '/analysis/:tab', redirect: (to) => ({ path: '/panalysis/' + String(to.params.tab) }) },
    { path: '/payment', name: 'payment', component: DashboardView, meta: { title: '回款总览' } },
    { path: '/data', name: 'data', component: DataView, meta: { title: '数据管理', hideFilter: true } },
    { path: '/governance', name: 'governance', component: DataQualityView, meta: { title: '数据治理', hideFilter: true } },
    { path: '/about', name: 'about', component: AboutView, meta: { title: '关于产品', hideFilter: true } },
    // catch-all(含 '/')渲染项目总览——P4 起 '/' 为项目主域首页,旧回款看板迁 /payment
    { path: '/:pathMatch(.*)*', name: 'overview', component: OverviewView, alias: '/', meta: { title: '项目总览', hideFilter: true } },
  ],
})
