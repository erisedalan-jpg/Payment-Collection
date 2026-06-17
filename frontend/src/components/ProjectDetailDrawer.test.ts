import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import ProjectDetailDrawer from './ProjectDetailDrawer.vue'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useDataStore } from '@/stores/data'

beforeEach(() => setActivePinia(createPinia()))

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
}

const DrawerStub = {
  name: 'ElDrawer',
  props: ['modelValue', 'title', 'size'],
  template: '<div class="drawer-stub"><slot /></div>',
}

// 收款阶段口径 mock data（对齐换源后的 buildProjectDetail 签名）
const projects = [
  { projectId: 'P1', projectName: '甲项目', orgL4: '一部', projectManager: '张', paymentPmis: { contract: 1500000 } },
]
const paymentNodes = {
  P1: [
    { stage: '验收款', planDate: '2026-06-08', actualDate: '', payRatio: 1, actualRatio: 0.25, expectedPayment: 200000, receivedAmount: 50000, unpaidAmount: 150000, status: '部分回款' },
    { stage: '到货款', planDate: '2026-05-01', actualDate: '', payRatio: 0.5, actualRatio: 0, expectedPayment: 100000, receivedAmount: 0, unpaidAmount: 100000, status: '延期' },
  ],
}

function mountDrawer(router = makeRouter()) {
  return mount(ProjectDetailDrawer, {
    global: { plugins: [ElementPlus, router], stubs: { ElDrawer: DrawerStub } },
  })
}

describe('ProjectDetailDrawer', () => {
  it('打开时渲染项目汇总与节点明细', async () => {
    const data = useDataStore()
    data.data = { paymentNodes, projects } as any
    useProjectDetailStore().open('P1')
    const w = mountDrawer()
    await flushPromises()
    expect(w.text()).toContain('甲项目')
    expect(w.text()).toContain('项目经理')
    expect(w.text()).toContain('回款节点明细（2）')
    expect(w.text()).toContain('验收款')
  })

  it('未知项目显示空态', async () => {
    const data = useDataStore()
    data.data = { paymentNodes, projects } as any
    useProjectDetailStore().open('NOPE')
    const w = mountDrawer()
    await flushPromises()
    expect(w.text()).toContain('未找到该项目数据')
  })
})

describe('查看完整详情入口', () => {
  it('主域项目显示入口，点击关闭抽屉并跳详情页', async () => {
    const ds = useDataStore()
    ds.data = { paymentNodes, projects } as any
    const pd = useProjectDetailStore()
    pd.open('P1')
    const router = makeRouter()
    const push = vi.spyOn(router, 'push')
    const w = mountDrawer(router)
    await flushPromises()
    const btn = w.find('.pd-full-link')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(push).toHaveBeenCalledWith('/project/P1')
    expect(useProjectDetailStore().openId).toBeNull()
  })

  it('非主域项目（不在 projects[]）不显示入口', async () => {
    const ds = useDataStore()
    ds.data = {
      paymentNodes: { 'P-9': [{ stage: '验收款', planDate: '', actualDate: '', payRatio: 1, actualRatio: 0, expectedPayment: 100000, receivedAmount: 0, unpaidAmount: 100000, status: '未回款' }] },
      projects: [],
    } as any
    const pd = useProjectDetailStore()
    pd.open('P-9')
    const w = mountDrawer()
    await flushPromises()
    const btn = w.find('.pd-full-link')
    expect(btn.exists()).toBe(false)
  })
})
