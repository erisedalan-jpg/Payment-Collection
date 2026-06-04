import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import TierView from '@/views/TierView.vue'
import PageStub from '@/components/PageStub.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/compare', name: 'compare', component: PageStub, meta: { title: '区间对比' } },
    { path: '/calendar', name: 'calendar', component: PageStub, meta: { title: '回款日历' } },
    { path: '/followup', name: 'followup', component: PageStub, meta: { title: '临期跟进' } },
    { path: '/ledger', name: 'ledger', component: PageStub, meta: { title: '回款台账' } },
    { path: '/tier/:tab/:tier', name: 'tier', component: TierView, meta: { title: '业务分析' } },
    { path: '/pmview', name: 'pmview', component: PageStub, meta: { title: '项目经理视图' } },
    { path: '/data', name: 'data', component: PageStub, meta: { title: '数据管理' } },
    { path: '/about', name: 'about', component: PageStub, meta: { title: '关于产品' } },
    // catch-all (including '/') renders DashboardView and is the canonical 'dashboard' name
    { path: '/:pathMatch(.*)*', name: 'dashboard', component: DashboardView, alias: '/', meta: { title: '看板首页' } },
  ],
})
