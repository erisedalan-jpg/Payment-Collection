import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProjectDetailDrawer from './ProjectDetailDrawer.vue'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useDataStore } from '@/stores/data'

beforeEach(() => setActivePinia(createPinia()))

const DrawerStub = {
  name: 'ElDrawer',
  props: ['modelValue', 'title', 'size'],
  template: '<div class="drawer-stub"><slot /></div>',
}

const rawNodes = [
  { projectId: 'P1', projectName: '甲项目', orgL4: '一部', projectManager: '张', projectType: '集成', tier: '100万以上', projectAmount: 1500000, isPaymentRelated: true, nodeName: '验收款', planDate: '2026-06-08', expectedPayment: 200000, actualPayment: 50000, actualPaymentRatio: 0.25, nodeStatus: '延期', delayDays: 12 },
  { projectId: 'P1', projectName: '甲项目', isPaymentRelated: false, nodeName: '启动会', nodeStatus: '' },
]

function mountDrawer() {
  return mount(ProjectDetailDrawer, {
    global: { plugins: [ElementPlus], stubs: { ElDrawer: DrawerStub } },
  })
}

describe('ProjectDetailDrawer', () => {
  it('打开时渲染项目汇总与节点明细', async () => {
    const data = useDataStore()
    data.data = { rawNodes } as any
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
    data.data = { rawNodes } as any
    useProjectDetailStore().open('NOPE')
    const w = mountDrawer()
    await flushPromises()
    expect(w.text()).toContain('未找到该项目数据')
  })
})
