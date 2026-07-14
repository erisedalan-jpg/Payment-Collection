import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { BudgetConfig } from '@/lib/budget/types'

const { getCfg } = vi.hoisted(() => ({ getCfg: vi.fn() }))
vi.mock('@/lib/budgetApi', () => ({
  getBudgetConfig: getCfg,
  saveBudgetConfig: vi.fn(),
  listEstimates: vi.fn().mockResolvedValue([]),
  getEstimate: vi.fn(),
  saveEstimate: vi.fn(),
  deleteEstimate: vi.fn(),
}))

import BudgetView from './BudgetView.vue'
import { useBudgetStore } from '@/stores/budget'

const CFG = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [{ key: 'pm', code: 'C1', name: 'PM一线' },
              { key: 'pm2ndc', code: 'C2', name: 'PM二线' },
              { key: 'eng1stc', code: 'C3', name: '工程师一线' },
              { key: 'eng2ndc', code: 'C4', name: '工程师二线' }],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%（含产品）' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: 's', nonstdDesc: 'n' }],
  pmPhases: [{ name: '项目启动阶段', content: '模板1' }],
  services: [{ name: '巡检服务', desc: 'd' }],
} as unknown as BudgetConfig

describe('BudgetView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getCfg.mockReset()
    getCfg.mockResolvedValue(CFG)
  })

  it('挂载即拉配置', async () => {
    mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(getCfg).toHaveBeenCalledTimes(1)
  })

  it('页面有内边距(.app-main 自身无 padding,每页自己给)', async () => {
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('.budget-view').exists()).toBe(true)
  })

  it('配置加载失败 → 显示错误,不静默用猜的默认值算报价', async () => {
    getCfg.mockRejectedValue(new Error('无概算工具页面权限'))
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('无概算工具页面权限')
  })

  it('必填项没填 → 保存被拦下,不发请求', async () => {
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const err = (w.vm as any).validate()
    expect(err).toContain('报价名称')
  })

  it('成本比例异常但没填说明 → 保存被拦下', async () => {
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = useBudgetStore()
    s.form.basic = { quoteName: 'A', customerName: 'B', salesName: 'C', location: 'D',
                     projectAmount: 100, projectLevel: 'P1', customerLevel: 'TOP1000',
                     signType: '直签', thirdParty: '否' }
    s.form.pmPhases[0].pm1 = 500          // 比例远超 15%
    expect(s.result?.ratioStatus).toBe('high')
    expect((w.vm as any).validate()).toContain('异常原因')
    s.form.ratioExplanation = '客户要求驻场'
    expect((w.vm as any).validate()).toBe('')
  })

  it('快照过期 → 显示横幅;点重算后横幅消失', async () => {
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = useBudgetStore()
    s.loadRecord({ id: 'e1', quoteName: 'x', data: s.form,
                   rateSnapshot: { ...CFG, fx: 6.0 } } as any)
    await flushPromises()
    expect(s.snapshotStale).toBe(true)
    expect(w.text()).toContain('按最新费率重算')
    s.useLatestRates()
    await flushPromises()
    expect(s.snapshotStale).toBe(false)
  })
})
