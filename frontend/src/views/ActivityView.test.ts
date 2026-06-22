import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ActivityView from './ActivityView.vue'
import { useDataStore } from '@/stores/data'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/activity', component: ActivityView },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

function seed(over: Record<string, any> = {}) {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [],
    displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {},
    events: [
      { date: '2026-06-11', type: '到账', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「初验款」到账 25 万' },
      { date: '2026-06-10', type: '阶段变更', domain: 'project', projectId: 'P-2', projectName: '乙', summary: '项目规划 → 项目执行' },
    ],
    periodCompare: {
      lastSync: { baseDate: '2026-06-10', advancedProjects: 1, newDelayedNodes: 2, paymentGained: 250000, riskNetChange: -1, newOverspendProjects: 0, paymentRatioChange: 1.5 },
      lastWeek: null, lastMonth: null,
    },
    ...over,
  } as any
}

function mountView() {
  return mount(ActivityView, { global: { plugins: [ElementPlus, router] } })
}

describe('ActivityView', () => {
  it('周期对比卡(默认上次同步)+时间线渲染', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('阶段推进')
    expect(w.text()).toContain('25')          // 回款新增 fmtWan(250000)=25
    expect(w.text()).toContain('对比 2026-06-10')
    expect(w.text()).toContain('「初验款」到账 25 万')
    expect(w.text()).toContain('阶段变更')
  })

  it('切到快照不足的基线显示置灰提示', async () => {
    seed()
    const w = mountView()
    await w.find('[data-test="seg-lastWeek"]').trigger('click')
    expect(w.text()).toContain('快照不足')
  })

  it('域筛选只剩项目类', async () => {
    seed()
    const w = mountView()
    await w.find('[data-test="seg-project"]').trigger('click')
    expect(w.text()).toContain('阶段变更')
    expect(w.text()).not.toContain('到账')
  })

  it('无事件显示首次同步空态', () => {
    seed({ events: [], periodCompare: null })
    const w = mountView()
    expect(w.text()).toContain('首次同步，暂无变化记录')
  })
})
