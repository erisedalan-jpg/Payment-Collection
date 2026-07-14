import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useBudgetStore } from '@/stores/budget'
import RatioCard from './RatioCard.vue'
import CrmCard from './CrmCard.vue'
import SummaryCard from './SummaryCard.vue'
import SalesOrderCard from './SalesOrderCard.vue'
import type { BudgetConfig } from '@/lib/budget/types'

const CFG = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [{ key: 'pm', code: 'JY-CPJF-OTHER-PM', name: 'PM一线' },
              { key: 'pm2ndc', code: 'C2', name: 'PM二线' },
              { key: 'eng1stc', code: 'C3', name: '工程师一线' },
              { key: 'eng2ndc', code: 'C4', name: '工程师二线' }],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%（含产品）' }, { value: 0.06, label: '6%（纯服务）' }],
  ratio: { min: 3, max: 15 },
  products: [], pmPhases: [{ name: '项目启动阶段', content: 'x' }], services: [],
} as unknown as BudgetConfig

function setup(pmDays = 0, amount: number | null = null) {
  setActivePinia(createPinia())
  const s = useBudgetStore()
  s.reset(CFG)
  s.setCurrentConfig(CFG)
  s.form.pmPhases[0].pm1 = pmDays
  s.form.basic.projectAmount = amount
  return s
}
const opts = { global: { plugins: [ElementPlus] } }

describe('RatioCard', () => {
  it('正常区间 → 显示比例与「比例正常」,不要求填异常说明', () => {
    setup(40, 100)                                    // 80000×1.13/1000000 = 9.04%
    const w = mount(RatioCard, opts)
    expect(w.text()).toContain('9.04%')
    expect(w.text()).toContain('比例正常')
    expect(w.text()).not.toContain('异常原因')
  })

  it('偏高 → 展开异常说明且必填', () => {
    setup(200, 100)                                   // 400000×1.13/1000000 = 45.2%
    const w = mount(RatioCard, opts)
    expect(w.text()).toContain('比例偏高')
    expect(w.find('textarea').exists()).toBe(true)
  })

  it('偏低 → 展开异常说明', () => {
    setup(5, 100)                                     // 10000×1.13/1000000 = 1.13%
    const w = mount(RatioCard, opts)
    expect(w.text()).toContain('比例偏低')
    expect(w.find('textarea').exists()).toBe(true)
  })

  it('项目金额未填 → 显示 -- 且不判定', () => {
    setup(40, null)
    const w = mount(RatioCard, opts)
    expect(w.text()).toContain('--')
    expect(w.find('textarea').exists()).toBe(false)
  })

  it('说明文案写的是「销售下单金额 ÷ 项目金额」(与修正后的代码一致)', () => {
    setup(40, 100)
    expect(mount(RatioCard, opts).text()).toContain('销售下单金额')
  })

  it('建议范围取自配置', () => {
    setup(40, 100)
    expect(mount(RatioCard, opts).text()).toContain('3%')
    expect(mount(RatioCard, opts).text()).toContain('15%')
  })
})

describe('SummaryCard', () => {
  it('总成本未含税、销售下单金额含税', () => {
    setup(10, 100)                                    // 20000 总成本
    const w = mount(SummaryCard, opts)
    expect(w.text()).toContain('20,000')
    expect(w.text()).toContain('22,600')              // ×1.13
  })

  it('切毛利率 → 销售金额与成本比例同时变(原工具只变金额)', () => {
    const s = setup(10, 100)
    const w = mount(SummaryCard, opts)
    expect(s.result?.costRatio).toBeCloseTo(2.26, 6)
    s.form.margin = 0.06
    expect(s.result?.salesAmount).toBeCloseTo(21200, 6)
    expect(s.result?.costRatio).toBeCloseTo(2.12, 6)  // 比例也跟着变
    expect(w.text()).toContain('毛利率')
  })
})

describe('CrmCard', () => {
  it('未手改时展示自动生成的建议', () => {
    const s = setup(3, 100)
    s.syncCrmText()
    expect(mount(CrmCard, opts).text()).toContain('该项目评估后')
  })

  it('恢复自动生成:清掉手改标记并重新生成', async () => {
    const s = setup(3, 100)
    s.form.crmText = '我手改的'
    s.form.crmUserEdited = true
    const w = mount(CrmCard, opts)
    await (w.vm as any).restore()
    expect(s.form.crmUserEdited).toBe(false)
    expect(s.form.crmText).toContain('1.预计项目经理3.0人天；')
  })

  it('编辑态点「恢复自动生成」后应回到只读态(不再停在"完成编辑")', async () => {
    const s = setup(3, 100)
    s.form.crmText = '我手改的'
    s.form.crmUserEdited = true
    const w = mount(CrmCard, opts)
    await (w.vm as any).startEdit()
    expect((w.vm as any).editing).toBe(true)
    await (w.vm as any).restore()
    expect((w.vm as any).editing).toBe(false)
  })
})

describe('SalesOrderCard', () => {
  it('渲染 4 个物料行 + 合计', () => {
    setup(10, 100)
    const w = mount(SalesOrderCard, opts)
    expect(w.text()).toContain('JY-CPJF-OTHER-PM')
    expect(w.text()).toContain('合计')
  })
})
