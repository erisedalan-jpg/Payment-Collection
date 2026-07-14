import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBudgetStore } from './budget'
import type { BudgetConfig, EstimateRecordLike } from '@/lib/budget/types'

const CFG: BudgetConfig = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [
    { key: 'pm', code: 'C1', name: 'PM一线' },
    { key: 'pm2ndc', code: 'C2', name: 'PM二线' },
    { key: 'eng1stc', code: 'C3', name: '工程师一线' },
    { key: 'eng2ndc', code: 'C4', name: '工程师二线' },
  ],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%' }, { value: 0.06, label: '6%' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: 's', nonstdDesc: 'n' }],
  pmPhases: [{ name: '项目启动阶段', content: '模板1' }],
  services: [{ name: '巡检服务', desc: 'd' }],
}
const OLD_CFG: BudgetConfig = { ...CFG, fx: 6.0, rates: {
  city1: { pm: 1000, tech: 800, out: 600 }, city2: { pm: 900, tech: 700, out: 500 } } }
/** 超管改完费率后的新配置(技服一类 1300 → 2600)。与 CFG 不共享 rates 引用,避免断言假过。 */
const NEW_CFG: BudgetConfig = { ...CFG, rates: {
  city1: { pm: 2000, tech: 2600, out: 1000 }, city2: { pm: 1500, tech: 1000, out: 800 } } }

describe('useBudgetStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reset:按配置生成空表单,currentId 与 rateSnapshot 为空,不脏', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    expect(s.currentId).toBe('')
    expect(s.rateSnapshot).toBeNull()
    expect(s.dirty).toBe(false)
    expect(s.form.pmPhases.map((p) => p.name)).toEqual(['项目启动阶段'])
  })

  it('新建报价:effectiveConfig = 当前配置', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    expect(s.effectiveConfig?.fx).toBe(6.8)
  })

  it('打开旧存档:effectiveConfig = 快照(不是当前配置) —— 报价必须可复现', () => {
    const s = useBudgetStore()
    s.setCurrentConfig(CFG)
    s.loadRecord({
      id: 'e1', quoteName: '旧报价',
      data: { ...s.form, basic: { ...s.form.basic, quoteName: '旧报价' } },
      rateSnapshot: OLD_CFG,
    } as unknown as EstimateRecordLike)
    expect(s.currentId).toBe('e1')
    expect(s.effectiveConfig?.fx).toBe(6.0)                 // 用快照
    expect(s.effectiveConfig?.rates.city1.pm).toBe(1000)
    expect(s.dirty).toBe(false)                             // 刚打开不算改动
  })

  it('快照与当前配置不同 → snapshotStale 为真(页面据此提示费率已更新)', () => {
    const s = useBudgetStore()
    s.setCurrentConfig(CFG)
    s.loadRecord({ id: 'e1', quoteName: 'x', data: s.form,
                   rateSnapshot: OLD_CFG } as unknown as EstimateRecordLike)
    expect(s.snapshotStale).toBe(true)
  })

  it('快照与当前配置一致 → snapshotStale 为假(不该弹无谓的提示)', () => {
    const s = useBudgetStore()
    s.setCurrentConfig(CFG)
    s.loadRecord({ id: 'e1', quoteName: 'x', data: s.form,
                   rateSnapshot: { ...CFG } } as unknown as EstimateRecordLike)
    expect(s.snapshotStale).toBe(false)
  })

  it('useLatestRates:清空快照 → 改用当前配置算,并标脏(须重新保存才落盘)', () => {
    const s = useBudgetStore()
    s.setCurrentConfig(CFG)
    s.loadRecord({ id: 'e1', quoteName: 'x', data: s.form,
                   rateSnapshot: OLD_CFG } as unknown as EstimateRecordLike)
    s.useLatestRates()
    expect(s.rateSnapshot).toBeNull()
    expect(s.effectiveConfig?.fx).toBe(6.8)
    expect(s.dirty).toBe(true)
  })

  it('result 与 salesOrder 随表单实时重算', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.pmPhases[0].pm1 = 10
    s.form.basic.projectAmount = 100
    expect(s.result?.totalCost).toBe(20000)
    expect(s.result?.salesAmount).toBeCloseTo(22600, 6)
    expect(s.result?.costRatio).toBeCloseTo(2.26, 6)
    expect(s.salesOrder?.rows.find((r) => r.key === 'pm')?.qty).toBe(Math.ceil(22600 / 2400))
  })

  it('syncCrmText:未手改时自动覆盖;手改后不再覆盖;restoreCrmAuto 可恢复', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.pmPhases[0].pm1 = 3
    s.syncCrmText()
    expect(s.form.crmText).toContain('1.预计项目经理3.0人天；')

    s.form.crmText = '我手改的内容'
    s.form.crmUserEdited = true
    s.form.pmPhases[0].pm1 = 9
    s.syncCrmText()
    expect(s.form.crmText).toBe('我手改的内容')            // 手改后不被覆盖

    s.restoreCrmAuto()                                     // 原工具没有这个回头路
    expect(s.form.crmUserEdited).toBe(false)
    expect(s.form.crmText).toContain('1.预计项目经理9.0人天；')
  })

  it('toPayload:新建不带 id;另存为新报价强制不带 id', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = '某报价'
    expect(s.toPayload(false).id).toBeUndefined()

    s.markSaved('e9', s.toPayload(false).rateSnapshot)
    expect(s.toPayload(false).id).toBe('e9')               // 保存 = 覆盖
    expect(s.toPayload(true).id).toBeUndefined()           // 另存为 = 新建
  })

  it('toPayload:快照随记录一起提交(新建时用当前配置作为快照)', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = '某报价'
    const p = s.toPayload(false)
    expect(p.rateSnapshot.fx).toBe(6.8)
    expect(p.summary.totalCost).toBe(0)
    expect(p.quoteName).toBe('某报价')
  })

  it('markSaved:落 id 并清脏', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = 'x'
    s.touch()
    expect(s.dirty).toBe(true)
    s.markSaved('e1', s.toPayload(false).rateSnapshot)
    expect(s.currentId).toBe('e1')
    expect(s.dirty).toBe(false)
  })
})

// ── 回归:存完不关页面,超管改费率 —— 这条报价必须继续按"保存时的那份费率"算 ──
//
// 服务端那条记录的快照冻的是保存那一刻的配置 A。若 markSaved 不同时把 A 落进 store 的
// rateSnapshot,页面上这条已存档的报价会继续跟着全局配置走:超管把费率改成 B 之后,
// 总成本/成本比例/下单金额当场全变、横幅不出、也不标脏 —— 导出的 Excel 按 B 算,
// 存档列表里这条却还是 A 算的数;再点一次「保存」,服务端那条历史快照会被从 A 悄悄改写成 B。
// 「改费率不得改写历史报价」这条不变量,原先只在"重新打开旧档"的路径上守住了。
describe('useBudgetStore:保存后费率快照(改费率不得改写已存档报价)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /** 走一遍真实的保存链路:toPayload() 拿到提交上去的那份配置 → API 返回 id → markSaved。 */
  function saveNew(s: ReturnType<typeof useBudgetStore>, id: string) {
    const payload = s.toPayload(false)          // 这份 rateSnapshot 就是提交给服务端的快照
    s.markSaved(id, payload.rateSnapshot)       // API 返回后调用(BudgetView.save 的写法)
    return payload
  }

  it('新建保存后:rateSnapshot 落成保存时的那份配置(不再是 null)', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = '某报价'
    saveNew(s, 'e1')
    expect(s.rateSnapshot).not.toBeNull()
    expect(s.rateSnapshot).toEqual(CFG)         // 与服务端那条记录冻的快照同一份
    expect(s.snapshotStale).toBe(false)         // 与当前配置相同 → 不该弹无谓的横幅
  })

  it('保存后超管改了费率:effectiveConfig 仍是保存时的 A,并弹「快照已过期」横幅', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = '某报价'
    saveNew(s, 'e1')

    s.setCurrentConfig(NEW_CFG)                 // 超管保存新配置 → BudgetView 的 watch 回灌
    expect(s.effectiveConfig?.rates.city1.tech).toBe(1300)   // 仍按 A 算,金额不变
    expect(s.snapshotStale).toBe(true)                       // 横幅出现
    expect(s.dirty).toBe(false)                              // 报价本身没被改过
  })

  it('保存后超管改了费率:金额继续按 A 算,不被新费率静默改价', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = '某报价'
    s.form.pmPhases[0].tech1 = 10               // 10 个技服一类人天
    saveNew(s, 'e1')

    s.setCurrentConfig(NEW_CFG)                 // 技服一类 1300 → 2600
    expect(s.result?.laborCost).toBe(13000)     // 10 × 1300(按快照 A),不是 10 × 2600
  })

  it('主动点「按最新费率重算」→ 才改用 B,并标脏(不重新保存不落盘)', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = '某报价'
    s.form.pmPhases[0].tech1 = 10
    saveNew(s, 'e1')
    s.setCurrentConfig(NEW_CFG)

    s.useLatestRates()
    expect(s.rateSnapshot).toBeNull()
    expect(s.effectiveConfig?.rates.city1.tech).toBe(2600)
    expect(s.result?.laborCost).toBe(26000)     // 10 × 2600
    expect(s.dirty).toBe(true)
  })
})
