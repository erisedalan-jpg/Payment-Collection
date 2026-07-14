import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn() }))
vi.mock('@/lib/budgetApi', () => ({
  getBudgetConfig: vi.fn(), saveBudgetConfig: saveSpy,
  listEstimates: vi.fn(), getEstimate: vi.fn(), saveEstimate: vi.fn(), deleteEstimate: vi.fn(),
}))

import RateConfigDrawer from './RateConfigDrawer.vue'
import { useBudgetConfigStore } from '@/stores/budgetConfig'
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
  margins: [{ value: 0.13, label: '13%' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: 's', nonstdDesc: 'n' }],
  pmPhases: [{ name: '项目启动阶段', content: 'x' }],
  services: [{ name: '巡检服务', desc: 'd' }],
} as unknown as BudgetConfig

describe('RateConfigDrawer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    saveSpy.mockReset()
    saveSpy.mockImplementation(async (c: BudgetConfig) => c)
    const s = useBudgetConfigStore()
    s.config = JSON.parse(JSON.stringify(CFG))
    s.loaded = true
  })

  const mountIt = () => mount(RateConfigDrawer, {
    props: { modelValue: true },
    global: { plugins: [ElementPlus] },
  })

  it('打开时把当前配置复制成草稿 —— 改了不保存不影响页面正在用的配置', async () => {
    const w = mountIt()
    await flushPromises()
    const s = useBudgetConfigStore()
    ;(w.vm as any).draft.fx = 9.9
    expect(s.config!.fx).toBe(6.8)             // 草稿与生效配置解耦
  })

  it('保存 → 调 saveBudgetConfig 并把新配置写回 store(立即生效)', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).draft.fx = 7.2
    await (w.vm as any).save()
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy.mock.calls[0][0].fx).toBe(7.2)
    expect(useBudgetConfigStore().config!.fx).toBe(7.2)
  })

  it('产品目录可增删行', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).addProduct()
    expect((w.vm as any).draft.products.length).toBe(2)
    ;(w.vm as any).removeProduct(1)
    expect((w.vm as any).draft.products.length).toBe(1)
  })

  it('服务目录可增删行', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).addService()
    expect((w.vm as any).draft.services.length).toBe(2)
  })

  it('项目经理阶段可增删行', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).addPhase()
    expect((w.vm as any).draft.pmPhases.length).toBe(2)
    ;(w.vm as any).removePhase(1)
    expect((w.vm as any).draft.pmPhases.length).toBe(1)
  })

  it('新增的阶段开箱即合法(name 非空,后端要求)', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).addPhase()
    const added = (w.vm as any).draft.pmPhases[1]
    expect(added.name.trim()).not.toBe('')
    expect(added.content).toBe('')          // content 允许为空
  })

  it('改了阶段模板并保存 → 提交给后端的配置里带着改后的 pmPhases', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).draft.pmPhases[0].name = '项目复盘阶段'
    ;(w.vm as any).draft.pmPhases[0].content = '【标准工作内容】\n1、复盘会\n2、总结报告'
    await (w.vm as any).save()
    const sent = saveSpy.mock.calls[0][0] as BudgetConfig
    expect(sent.pmPhases[0].name).toBe('项目复盘阶段')
    expect(sent.pmPhases[0].content).toContain('复盘会')
    // 多行长文本:换行不能被吃掉(编辑控件必须是 textarea)
    expect(sent.pmPhases[0].content).toContain('\n')
    expect(useBudgetConfigStore().config!.pmPhases[0].name).toBe('项目复盘阶段')
  })

  it('后端拒绝时把可读的校验文案弹出来', async () => {
    saveSpy.mockRejectedValue(new Error('成本比例区间下限必须小于上限'))
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).draft.ratio = { min: 20, max: 5 }
    await (w.vm as any).save()
    expect((w.vm as any).error).toContain('下限必须小于上限')
  })
})
