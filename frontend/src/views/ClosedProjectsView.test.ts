import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import ClosedProjectsView from './ClosedProjectsView.vue'
import { useDataStore } from '@/stores/data'

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects/closed', component: ClosedProjectsView },
    { path: '/closed-project/:id', component: { template: '<div/>' } },
  ] })
}

describe('ClosedProjectsView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('渲染已关闭清单列与行', async () => {
    const ds = useDataStore()
    ds.data = { closedProjects: [{
      projectId: 'C-1', projectName: '终端甲', projectManager: '张三', orgL4: '安全A组', orgL3_1: '三部一组',
      合同编号: 'HT-1', customer: { 最终客户: '客A', 签约单位: '甲单位', 合同总额: 1000000, 行业: '金融' },
      status: { 项目状态: '已验收', 项目级别: 'B', 项目类型: '实施项目', 评级: 'A' },
      progress: { 项目阶段: '项目收尾', 完工进展: 1 }, cost: { 消耗比: 1.2, 项目超支: true, 交付超支: true },
      closeInfo: { 关闭时间: '2025-08-15', 计划终验时间: '2025-07-01', 是否正常关闭: '是' },
    }] } as any
    const router = makeRouter()
    router.push('/projects/closed')
    await router.isReady()
    const w = mount(ClosedProjectsView, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.text()).toContain('已关闭项目')
    expect(w.text()).toContain('终端甲')
    expect(w.text()).toContain('已验收')
    expect(w.text()).toContain('2025-08-15')
  })

  it('空数据空态', async () => {
    const ds = useDataStore()
    ds.data = { closedProjects: [] } as any
    const router = makeRouter()
    router.push('/projects/closed')
    await router.isReady()
    const w = mount(ClosedProjectsView, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.text()).toContain('暂无已关闭项目数据')
  })
})
