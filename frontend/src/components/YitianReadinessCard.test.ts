import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import type { YitianData } from '@/types/yitian'
import YitianReadinessCard from './YitianReadinessCard.vue'

const readiness = {
  top1000: { provided: true, rows: 139, matchedCustomers: 97, hasQuad: true, hasBg: true },
  productCategory: { provided: true, rows: 108, coveredLines: 81, totalLines: 81 },
  calibration: { pending: 1439, calibrated: 307, ambiguous: 931, unmatched: 201 },
  unattributed: { rows: 478, hours: 2810 },
  roster: { hasSupColumn: true, managers: 14 },
}
// fixture 只造组件真正读到的字段。**不能写 as never** —— 下面几条用例要 spread 它,
// never 不是对象类型、展开会 TS2698(计划原文如此,已订正)。统一在 asData 处转型。
const data = {
  meta: { dataReadiness: readiness },
  dims: { types: ['项目类'] },
  entries: [
    { t: 0, h: 10, tr: 4 }, { t: 0, h: 30, tr: 1 }, { t: 0, h: 60, tr: 0 },
  ],
}
const asData = (x: object) => x as unknown as YitianData

/** 按标签取指定 grid 内该 KPI 卡的值 —— 不用整页 toContain(会碰瓷同页别处的相同数字),
 *  也必须限定 grid:「客户不可归属」在五档与就绪度两个 grid 里都有,不限定会取到第一个。
 *  MetricGrid 的 DOM:每张卡 .mg-card 内 .mg-k(标签) / .mg-v(主值) / .mg-sub(辅值)。 */
function cardOf(w: ReturnType<typeof mount>, grid: '.rc-grid' | '.rc-grid2', label: string) {
  const card = w.find(grid).findAll('.mg-card').find((c) => c.find('.mg-k').text() === label)
  if (!card) throw new Error(`${grid} 内未找到标签为「${label}」的 KPI 卡`)
  return { v: card.find('.mg-v').text(), sub: card.find('.mg-sub').text() }
}

describe('YitianReadinessCard', () => {
  it('渲染就绪度四数', () => {
    const w = mount(YitianReadinessCard, { props: { data: asData(data) } })
    expect(cardOf(w, '.rc-grid2', '产品大类覆盖').v).toBe('81/81')
    expect(cardOf(w, '.rc-grid2', 'TOP1000 匹配客户').v).toBe('97')
    expect(cardOf(w, '.rc-grid2', '产品线校准覆盖').v).toBe('21%')   // 307/1439
    expect(cardOf(w, '.rc-grid2', '客户不可归属').v).toBe('2810')
  })

  it('可转移五档按工时聚合且比例正确', () => {
    const w = mount(YitianReadinessCard, { props: { data: asData(data) } })
    expect(cardOf(w, '.rc-grid', '可转移非原厂')).toEqual({ v: '10', sub: '10%' })
    expect(cardOf(w, '.rc-grid', '不可转移：M1/M2 战略客户')).toEqual({ v: '30', sub: '30%' })
    // 同名标签在两个 grid 里值不同:五档那张是本区间的 60h,就绪度那张是全量 2810h
    expect(cardOf(w, '.rc-grid', '客户不可归属').v).toBe('60')
  })

  it('五档只统计客户类工时', () => {
    const withMgmt = { ...data, dims: { types: ['项目类', '管理类'] },
      entries: [...data.entries, { t: 1, h: 900, tr: 4 }] }
    const w = mount(YitianReadinessCard, { props: { data: asData(withMgmt) } })
    expect(cardOf(w, '.rc-grid', '可转移非原厂').v).toBe('10')   // 管理类那 900h 不得混进来
  })

  it('源表缺失时给出告警文案而非静默显示 0', () => {
    const bad = { ...data, meta: { dataReadiness: {
      ...readiness, productCategory: { provided: false, rows: 0, coveredLines: 0, totalLines: 81 },
    } } }
    const w = mount(YitianReadinessCard, { props: { data: asData(bad) } })
    expect(w.text()).toContain('未提供')
  })

  it('data 为 null 时不炸', () => {
    const w = mount(YitianReadinessCard, { props: { data: null } })
    expect(w.exists()).toBe(true)
  })
})
