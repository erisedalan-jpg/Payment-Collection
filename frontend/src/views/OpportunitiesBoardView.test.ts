import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

describe('V4.5.1 SectionTitle', () => {
  it('13 张图表卡标题改用 SectionTitle(section 级),.ob-h3 只剩底边距', async () => {
    const w = mount(OpportunitiesBoardView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const titles = w.findAll('.ob-h3')
    expect(titles).toHaveLength(13)      // 先钉住条数,否则下面的循环在空集上恒真
    for (const t of titles) {
      expect(t.element.tagName).toBe('H3')
      expect(t.classes()).toContain('st--section')
      expect(t.classes()).not.toContain('st--card')   // 原值 --fs-3 → section
    }
    // 复合选择器 .st.ob-h3 是刻意的:否则与组件 .st { margin: 0 } 同特异性、靠打包顺序决胜负
    const rule = readFileSync(resolve(__dirname, 'OpportunitiesBoardView.vue'), 'utf-8')
      .match(/\.st\.ob-h3\s*\{([^}]*)\}/)![1]
    for (const p of ['font-size', 'font-weight', 'color']) {
      expect(rule, `.ob-h3 不应再自写 ${p}`).not.toContain(p)
    }
    expect(rule).toContain('margin: 0 0 var(--sp-2)')   // 布局属性必须留下
  })
})
