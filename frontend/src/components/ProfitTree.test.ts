import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfitTree from './ProfitTree.vue'

const ROWS = [
  { code: '1', name: '项目收入', level: 1, budget: 1000000, estimate: 900000, final: 950000, actual: 0, remaining: 1000000, rate: 0 },
  { code: '2.1', name: '产品、商品成本', level: 2, budget: 100000, estimate: null, final: null, actual: 50000, remaining: 50000, rate: 0.5 },
  { code: '2.1.1', name: '自有产品成本', level: 3, budget: 80000, estimate: null, final: null, actual: 40000, remaining: 40000, rate: 0.5 },
  { code: '2.3', name: '人工成本', level: 2, budget: 200000, estimate: null, final: null, actual: 0, remaining: 200000, rate: 0 },
  { code: '2.3.2', name: '交付部门人工成本', level: 3, budget: 150000, estimate: null, final: null, actual: 0, remaining: 150000, rate: 0 },
  { code: '4', name: '项目毛利率', level: 1, budget: 0.8888, estimate: 0.9, final: null, actual: 0, remaining: null, rate: null },
] as any

describe('ProfitTree', () => {
  it('默认:2.3.2 可见(默认展开),2.1.1 折叠;万元与比率行格式', () => {
    const w = mount(ProfitTree, { props: { rows: ROWS } })
    const txt = w.text()
    expect(txt).toContain('交付部门人工成本')
    expect(txt).not.toContain('自有产品成本')
    expect(txt).toContain('100')        // 1000000 元 → 100 万(收入行 budget)
    expect(txt).toContain('88.9%')      // 毛利率行按比率格式化(fmtRatio 0.8888 → 88.9%)
    expect(txt).toContain('90%')        // 毛利率 estimate 0.9
  })

  it('点击 2.1 展开后 2.1.1 出现,再点收起', async () => {
    const w = mount(ProfitTree, { props: { rows: ROWS } })
    const row21 = w.findAll('tbody tr').find((tr) => tr.text().includes('产品、商品成本'))!
    await row21.find('button.pt-toggle').trigger('click')
    expect(w.text()).toContain('自有产品成本')
    await w.findAll('tbody tr').find((tr) => tr.text().includes('产品、商品成本'))!.find('button.pt-toggle').trigger('click')
    expect(w.text()).not.toContain('自有产品成本')
  })

  it('无子码的行不渲染折叠钮', () => {
    const w = mount(ProfitTree, { props: { rows: ROWS } })
    const row1 = w.findAll('tbody tr').find((tr) => tr.text().includes('项目收入'))!
    expect(row1.find('button.pt-toggle').exists()).toBe(false)
  })
})
