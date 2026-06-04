import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import DataView from './DataView.vue'
import { useDataStore } from '@/stores/data'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn().mockResolvedValue({ success: true, message: '已清空' }), post: vi.fn() },
  ApiRequestError: class extends Error {},
}))
import { api } from '@/api/client'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', projectAmount: 0, projectManager: '张', orgL4: '北京', isPaymentRelated: true, actualPaymentRatio: null },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('DataView', () => {
  it('渲染标题/纳管开关/质量总览/清空按钮', () => {
    seed()
    const w = mount(DataView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('数据管理')
    expect(w.text()).toContain('数据质量总览')
    expect(w.text()).toContain('纳管')
    expect(w.text()).toContain('清空数据')
    expect(w.findComponent({ name: 'DataQualityTable' }).exists()).toBe(true)
    expect(w.text()).toContain('缺少项目金额')
  })

  it('点击质量单元格打开下钻弹层', async () => {
    seed()
    const w = mount(DataView, { global: { plugins: [ElementPlus] }, attachTo: document.body })
    await w.find('.dq-cell.clickable').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('缺少项目金额')
    expect(w.findComponent({ name: 'DataDrillModal' }).exists()).toBe(true)
    w.unmount()
  })

  it('清空数据：双确认通过则清内存 + 调 api', async () => {
    seed()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const ds = useDataStore()
    const w = mount(DataView, { global: { plugins: [ElementPlus] } })
    await (w.vm as any).onClear()
    await flushPromises()
    expect(ds.data!.rawNodes).toEqual([])
    expect(api.get).toHaveBeenCalledWith('/api/clear-data')
  })

  it('渲染云同步与离线导入卡', () => {
    seed()
    const w = mount(DataView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('云同步')
    expect(w.text()).toContain('离线 Excel 导入')
    expect(w.find('input[type="file"]').exists()).toBe(true)
    expect(w.text()).toContain('项目回款节点（里程碑）清单')
  })

  it('同步 url 为空点击 → 错误提示，不创建连接', async () => {
    seed()
    const w = mount(DataView, { global: { plugins: [ElementPlus] } })
    await (w.vm as any).onSync()
    expect(w.text()).toContain('请先输入数据源地址')
  })
})
