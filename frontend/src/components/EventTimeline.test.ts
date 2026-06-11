import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import EventTimeline from './EventTimeline.vue'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

const EVS = [
  { date: '2026-06-11', type: '到账', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「初验款」到账 25 万' },
  { date: '2026-06-10', type: '阶段变更', domain: 'project', projectId: 'P-2', projectName: '乙', summary: '项目规划 → 项目执行' },
] as any[]

describe('EventTimeline', () => {
  it('按日分组渲染 类型徽章+项目链接+摘要', () => {
    const w = mount(EventTimeline, { props: { events: EVS }, global: { plugins: [router] } })
    expect(w.text()).toContain('2026-06-11')
    expect(w.text()).toContain('到账')
    expect(w.text()).toContain('甲')
    const link = w.find('a[href="/project/P-2"]')
    expect(link.exists()).toBe(true)
  })
  it('空事件显示空态文案(可定制)', () => {
    const w = mount(EventTimeline, { props: { events: [], emptyText: '首次同步，暂无变化记录' }, global: { plugins: [router] } })
    expect(w.text()).toContain('首次同步，暂无变化记录')
  })
})
