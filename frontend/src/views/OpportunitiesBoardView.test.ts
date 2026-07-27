import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import OpportunitiesBoardView from './OpportunitiesBoardView.vue'
import * as oppApi from '@/lib/opportunitiesApi'

const ROW = {
  id: 'r1', l4: '小金融服务组', salesOwner: '张三', customer: '甲公司',
  industry: '金融', top1000: 'TOP1000', status: '方案设计沟通', forecast: '可参与',
  name: '甲商机', amountWan: 100, expectedDate: '2026-09-01', productCategory: '',
  mainProducts: '', outsource: '否', frOwner: '', frMatch: '是', deliveryMatch: '是',
  crossRegion: '否', keyOpp: '是', earlyIntervene: '否', remark: '',
  bidStatus: '待定', bidDate: '', firstReg: '2026-01-01', lastUpdate: '2026-07-01',
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(oppApi.opportunitiesApi, 'list').mockResolvedValue({ rows: [ROW] })
})

describe('OpportunitiesBoardView', () => {
  it('渲染页头标题', async () => {
    const w = mount(OpportunitiesBoardView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('.ph-title').text()).toBe('商机看板')
  })
})

describe('V4.5.0 AppCard', () => {
  it('6 张 KPI 卡与 13 张图表卡改用 AppCard(flat)', async () => {
    const w = mount(OpportunitiesBoardView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const kpi = w.findAll('.ob-card')
    expect(kpi).toHaveLength(6)          // 顶部 4 + 底部 AI 2
    expect(kpi.every((c) => c.classes().includes('ac--flat'))).toBe(true)
    const charts = w.findAll('.ob-chart')
    expect(charts).toHaveLength(13)
    expect(charts.every((c) => c.classes().includes('ac--flat'))).toBe(true)
  })
})
