import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useBudgetStore } from '@/stores/budget'
import ProductSection from './ProductSection.vue'
import DirectCostSection from './DirectCostSection.vue'
import RateReferenceCard from './RateReferenceCard.vue'
import PmSection from './PmSection.vue'
import type { BudgetConfig } from '@/lib/budget/types'

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
               stdDesc: '防火墙标准说明', nonstdDesc: '防火墙非标说明' },
             { id: '1.15', name: '云安全管理平台CSMP', coefficient: 0.6, stdDays: 6.375,
               stdDesc: 'C说明', nonstdDesc: 'C非标' }],
  pmPhases: [{ name: '项目启动阶段', content: '启动模板' },
             { name: '项目规划阶段', content: '规划模板' }],
  services: [{ name: '巡检服务', desc: '巡检说明' }],
} as unknown as BudgetConfig

function setup() {
  setActivePinia(createPinia())
  const s = useBudgetStore()
  s.reset(CFG)
  s.setCurrentConfig(CFG)
  return s
}
const opts = { global: { plugins: [ElementPlus] } }

describe('ProductSection', () => {
  beforeEach(setup)

  it('addProduct:按目录预填 数量1/标准人天/系数,四格人天为 0', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.15')
    expect(s.form.products.length).toBe(1)
    const p = s.form.products[0]
    expect(p.name).toBe('云安全管理平台CSMP')
    expect(p.qty).toBe(1)
    expect(p.stdDays).toBe(6.375)
    expect(p.coefficient).toBe(0.6)
    expect(p.std).toEqual({ tech1: 0, tech2: 0, out1: 0, out2: 0 })
    expect(p.isCustom).toBe(false)
  })

  it('同一目录产品不可重复添加,自定义产品可重复添加', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.1')
    ;(w.vm as any).addProduct('1.1')
    expect(s.form.products.length).toBe(1)              // 目录产品去重
    ;(w.vm as any).addCustom()
    ;(w.vm as any).addCustom()
    expect(s.form.products.filter((p) => p.isCustom).length).toBe(2)
  })

  it('合计参考人天实时算,且只是参考 —— 不进金额', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.1')
    s.form.products[0].qty = 3                          // 3 × 1.5 × 0.8 = 3.6
    expect((w.vm as any).totalDaysOf(s.form.products[0])).toBe(3.6)
    expect(s.result?.prodTechCost).toBe(0)              // 四格没填 → 金额仍是 0
  })

  it('删除产品', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.1')
    ;(w.vm as any).removeProduct(s.form.products[0].uid)
    expect(s.form.products).toEqual([])
  })

  it('填四格人天 → 金额实时联动', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.1')
    s.form.products[0].std.tech1 = 2
    expect(s.result?.prodTechCost).toBe(2 * 1300)
  })
})

describe('PmSection', () => {
  beforeEach(setup)
  it('按配置渲染阶段,工作内容预填模板', () => {
    const s = useBudgetStore()
    mount(PmSection, opts)
    expect(s.form.pmPhases.map((p) => p.name))
      .toEqual(['项目启动阶段', '项目规划阶段'])
    expect(s.form.pmPhases[0].note).toBe('启动模板')
  })
  it('小结用的是成本单价(2000/1500/1300/1000),不是销售价', () => {
    const s = useBudgetStore()
    const w = mount(PmSection, opts)
    s.form.pmPhases[0].pm1 = 2
    expect((w.vm as any).pmCost1).toBe(2 * 2000)        // 不是 2 × 2400
  })
})

describe('DirectCostSection', () => {
  beforeEach(setup)

  it('两个交通字段独立且都计入直接成本', () => {
    const s = useBudgetStore()
    mount(DirectCostSection, opts)
    s.form.direct.localTransportBase = 111
    s.form.direct.localTransportTrip = 222
    s.form.direct.interCityTransport = 333
    expect(s.result?.directCost).toBe(666)
  })

  it('placeholder 里的价格取自配置,不是写死的', () => {
    const w = mount(DirectCostSection, opts)
    const html = w.html()
    expect(html).toContain('450')       // 一线住宿
    expect(html).toContain('150')       // 境内差补
    expect(html).toContain('6.8')       // 汇率
  })
})

describe('RateReferenceCard', () => {
  beforeEach(setup)
  it('费率表由配置渲染 —— 单一来源,不再 HTML/JS 各写一份', () => {
    const w = mount(RateReferenceCard, opts)
    const html = w.html()
    expect(html).toContain('2000')      // PM 一类成本单价
    expect(html).toContain('1300')      // 技服一类
    expect(html).toContain('2400')      // PM 销售单价
    expect(html).toContain('6.8')       // 汇率
  })
})
