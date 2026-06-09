import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import AnalysisView from '@/views/AnalysisView.vue'
import LedgerView from '@/views/LedgerView.vue'
import BoardView from '@/views/BoardView.vue'
import CalendarView from '@/views/CalendarView.vue'
import FollowupView from '@/views/FollowupView.vue'
import DataView from '@/views/DataView.vue'
import AboutView from '@/views/AboutView.vue'
import DataQualityView from '@/views/DataQualityView.vue'

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
    { path: '/board', name: 'board', component: BoardView, meta: { title: '多维看板' } },
    { path: '/calendar', name: 'calendar', component: CalendarView, meta: { title: '回款日历' } },
    { path: '/followup', name: 'followup', component: FollowupView, meta: { title: '临期跟进' } },
    { path: '/ledger', name: 'ledger', component: LedgerView, meta: { title: '回款台账' } },
    { path: '/analysis/:tab', name: 'analysis', component: AnalysisView, meta: { title: '业务分析' } },
    { path: '/data', name: 'data', component: DataView, meta: { title: '数据管理', hideFilter: true } },
    { path: '/governance', name: 'governance', component: DataQualityView, meta: { title: '数据治理', hideFilter: true } },
    { path: '/about', name: 'about', component: AboutView, meta: { title: '关于产品', hideFilter: true } },
    // catch-all (including '/') renders DashboardView and is the canonical 'dashboard' name
    { path: '/:pathMatch(.*)*', name: 'dashboard', component: DashboardView, alias: '/', meta: { title: '看板首页' } },
  ],
})
