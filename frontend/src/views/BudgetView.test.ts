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
import { useBudgetConfigStore } from '@/stores/budgetConfig'

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

// 超管保存后的新配置:技服一类单价 1300→2600、汇率 6.8→7.0(与 CFG 独立的对象,
// 深拷贝避免共享 rates 引用导致断言"假过")
const CFG_B = {
  ...CFG,
  rates: { city1: { pm: 2000, tech: 2600, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  fx: 7.0,
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

  // ↓↓↓ Critical 回归:超管改完费率保存后,配置必须回灌进 budget store,
  // 否则页面上的费率速查表 / 新建报价的计算结果全部停在旧配置上算错钱。

  it('超管保存新配置后 → store.effectiveConfig 立即换成新费率(不需要刷新页面)', async () => {
    mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = useBudgetStore()
    const cfg = useBudgetConfigStore()
    expect(s.effectiveConfig?.rates.city1.tech).toBe(1300)   // 进页面那一刻的旧费率
    // 模拟 RateConfigDrawer.save() → cfgStore.save() 把 config 换成后端返回的新对象
    cfg.config = CFG_B
    await flushPromises()
    expect(s.effectiveConfig?.rates.city1.tech).toBe(2600)
  })

  it('算钱回归:配置回灌后,新建报价按新单价算,不是旧价(29380 那种错法)', async () => {
    mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = useBudgetStore()
    const cfg = useBudgetConfigStore()
    cfg.config = CFG_B
    await flushPromises()
    s.form.pmPhases[0].tech1 = 10                            // 10 个技服一类人天
    expect(s.result?.laborCost).toBe(26000)                  // 10 × 2600,不是 10 × 1300 = 13000
  })

  it('快照仍然生效(别把这个修坏了):旧存档用它自己的快照算,全局配置怎么变都不影响', async () => {
    mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = useBudgetStore()
    const cfg = useBudgetConfigStore()
    s.loadRecord({ id: 'e1', quoteName: '旧报价', data: s.form, rateSnapshot: CFG } as any)
    cfg.config = CFG_B                                       // 全局配置变了
    await flushPromises()
    expect(s.effectiveConfig?.rates.city1.tech).toBe(1300)   // 仍是快照里的旧价
    expect(s.snapshotStale).toBe(true)
  })

  it('配置回灌不会清掉用户正在填的表单', async () => {
    mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = useBudgetStore()
    const cfg = useBudgetConfigStore()
    s.form.basic.quoteName = '用户正在填的报价名'
    s.form.pmPhases[0].tech1 = 5
    cfg.config = CFG_B
    await flushPromises()
    expect(s.form.basic.quoteName).toBe('用户正在填的报价名')
    expect(s.form.pmPhases[0].tech1).toBe(5)
  })

  // 配置陈旧回归:同一个 SPA 会话里再次进 /budget,必须重新拉配置(load(true))——
  // 否则超管改完费率,别人已经打开的页签会继续按旧单价报价,并把旧快照冻进新存档。
  it('再次进页面 → 重新拉配置(不吃 loaded 缓存)', async () => {
    mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(getCfg).toHaveBeenCalledTimes(1)
    getCfg.mockResolvedValue(CFG_B)
    mount(BudgetView, { global: { plugins: [ElementPlus] } })   // 同一 pinia 实例,模拟再次进页面
    await flushPromises()
    expect(getCfg).toHaveBeenCalledTimes(2)
    expect(useBudgetConfigStore().config?.rates.city1.tech).toBe(2600)
  })
})
