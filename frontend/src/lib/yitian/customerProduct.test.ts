import { describe, it, expect } from 'vitest'
import type { YitianData } from '@/types/yitian'
import {
  selectCpEntries, custSupport, custList, top1000Coverage, type CpFilter,
  custClassProductMatrix, orgProductMatrix, custProductCross,
} from './customerProduct'

/** 最小 fixture:2 人(1 管理干部) x 4 条客户类工时 + 1 条管理类(必须被排除)。 */
const D = {
  meta: { top1000Named: { 市场BG3: 3, 市场BG1: 1 } },
  roster: [
    { id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: true },
    { id: 'A002', name: '小李', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: false },
  ],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类'],
    customers: ['甲公司', '乙公司', '丙公司'],
    custQuads: ['M1 战略核心区', 'M2 现金牛/打猎区'],
    custBgs: ['市场BG3', '市场BG1'],
    prodCats: ['终端安全', '天眼'],
    workTypes: [], products: [], productNames: [], projectTypes: [],
    salesL2: [], serviceModes: [],
  },
  entries: [
    // 甲公司 TOP1000/M1/BG3:项目类 10h(老张,管理干部) + 售前类 4h(小李)
    { d: '2026-06-01', e: 'A001', t: 0, h: 10, cu: 0, cq: 0, cbg: 0, ec: 0, tr: 4, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    { d: '2026-06-02', e: 'A002', t: 1, h: 4, cu: 0, cq: 0, cbg: 0, ec: 1, tr: 1, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    // 乙公司 TOP1000/M2/BG1:售后类 6h(小李)
    { d: '2026-06-03', e: 'A002', t: 2, h: 6, cu: 1, cq: 1, cbg: 1, ec: 0, tr: 3, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: false, pm: false },
    // 丙公司 非TOP1000:项目类 20h(小李)
    { d: '2026-06-04', e: 'A002', t: 0, h: 20, cu: 2, cq: null, cbg: null, ec: 1, tr: 4, top: false,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    // 管理类 100h —— 六块一律不得统计
    { d: '2026-06-05', e: 'A002', t: 3, h: 100, cu: 2, cq: null, cbg: null, ec: 1, tr: 4, top: false,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
  ],
  days: [], issues: [],
} as unknown as YitianData

const ALL: CpFilter = { start: '', end: '', l4s: [], prodCats: [], types: [], mgrMode: 'all' }

describe('selectCpEntries', () => {
  it('只留客户类工时,管理类被排除', () => {
    const r = selectCpEntries(D, ALL)
    expect(r).toHaveLength(4)
    expect(r.reduce((s, e) => s + e.h, 0)).toBe(40)   // 10+4+6+20,不含管理类 100
  })

  it('按产品大类过滤', () => {
    expect(selectCpEntries(D, { ...ALL, prodCats: ['天眼'] }).reduce((s, e) => s + e.h, 0)).toBe(24)
  })

  it('按工时类型过滤', () => {
    expect(selectCpEntries(D, { ...ALL, types: ['项目类'] }).reduce((s, e) => s + e.h, 0)).toBe(30)
  })

  it('管理干部三态', () => {
    expect(selectCpEntries(D, { ...ALL, mgrMode: 'only' }).reduce((s, e) => s + e.h, 0)).toBe(10)
    expect(selectCpEntries(D, { ...ALL, mgrMode: 'exclude' }).reduce((s, e) => s + e.h, 0)).toBe(30)
  })

  it('按日期区间过滤', () => {
    expect(selectCpEntries(D, { ...ALL, start: '2026-06-03', end: '2026-06-04' })
      .reduce((s, e) => s + e.h, 0)).toBe(26)
  })
})

describe('custSupport(B-1)', () => {
  it('按 客户分类 x 象限 汇总,象限取前两字符', () => {
    const r = custSupport(D, selectCpEntries(D, ALL))
    const m1 = r.find((x) => x.custClass === 'TOP1000' && x.quad === 'M1')
    expect(m1).toMatchObject({ customers: 1, hours: 14, project: 10, presale: 4, postsale: 0 })
    const non = r.find((x) => x.custClass === '非TOP1000')
    expect(non).toMatchObject({ quad: '(未匹配)', customers: 1, hours: 20, project: 20 })
  })

  it('客户数按去重计,同客户多条只算一个', () => {
    const r = custSupport(D, selectCpEntries(D, ALL))
    expect(r.find((x) => x.quad === 'M1')?.customers).toBe(1)   // 甲公司两条工时
  })
})

describe('custList(B-2)', () => {
  it('按工时降序取前 N', () => {
    const r = custList(D, selectCpEntries(D, ALL), 2)
    expect(r.map((x) => x.customer)).toEqual(['丙公司', '甲公司'])   // 20 > 14 > 6
  })

  it('主要支持产品按工时类型分组', () => {
    const r = custList(D, selectCpEntries(D, ALL), 10)
    const jia = r.find((x) => x.customer === '甲公司')
    expect(jia?.topProducts).toContain('项目类')
    expect(jia?.topProducts).toContain('终端安全')
    expect(jia?.topProducts).toContain('天眼')
  })
})

describe('top1000Coverage(B-3)', () => {
  it('指名来自 meta.top1000Named,不随筛选变;支持数随筛选变', () => {
    const r = top1000Coverage(D, selectCpEntries(D, ALL))
    const bg3 = r.find((x) => x.bg === '市场BG3')
    expect(bg3).toMatchObject({ named: 3, supported: 1, hours: 14 })
    expect(bg3?.coverage).toBeCloseTo(1 / 3)
  })

  it('指名为 0 的 BG 覆盖率为 null 而不是 0 或 NaN', () => {
    const d2 = { ...D, meta: { ...D.meta, top1000Named: {} } } as unknown as YitianData
    const r = top1000Coverage(d2, selectCpEntries(d2, ALL))
    for (const x of r) expect(x.coverage).toBeNull()
  })

  it('清单里有、但本期零支持的 BG 也要出现在表里', () => {
    // 市场BG1 指名 1、本期支持 1(乙公司);再造一个指名 2 零支持的 BG 必须出现
    const d3 = { ...D, meta: { ...D.meta, top1000Named: { 市场BG3: 3, 市场BG1: 1, 市场BG2: 2 } } } as unknown as YitianData
    const r = top1000Coverage(d3, selectCpEntries(d3, ALL))
    const bg2 = r.find((x) => x.bg === '市场BG2')
    expect(bg2).toMatchObject({ named: 2, supported: 0, hours: 0 })
    expect(bg2?.coverage).toBe(0)      // 零支持是 0%,不是 null —— null 只表示"分母缺失"
  })
})

describe('custClassProductMatrix(B-4)', () => {
  it('行=客户分类+象限,列=产品大类原序', () => {
    const m = custClassProductMatrix(D, selectCpEntries(D, ALL))
    expect(m.cols).toEqual(['终端安全', '天眼'])          // 与 dims.prodCats 原序一致
    expect(m.rows).toContain('TOP1000 · M1')
    expect(m.total).toBe(40)
    const i = m.rows.indexOf('TOP1000 · M1')
    expect(m.cells[i]).toEqual([10, 4])                   // 甲公司:终端安全 10 + 天眼 4
    expect(m.rowTotals[i]).toBe(14)
  })

  it('列合计与总计自洽', () => {
    const m = custClassProductMatrix(D, selectCpEntries(D, ALL))
    expect(m.colTotals.reduce((a, b) => a + b, 0)).toBe(m.total)
    expect(m.rowTotals.reduce((a, b) => a + b, 0)).toBe(m.total)
  })
})

describe('orgProductMatrix(A-2)', () => {
  it('行=L4 组织', () => {
    const m = orgProductMatrix(D, selectCpEntries(D, ALL))
    expect(m.rows).toEqual(['一组'])
    expect(m.rowTotals[0]).toBe(40)
  })
})

describe('custProductCross(A-4)', () => {
  it('按总工时降序取前 N 个客户', () => {
    const r = custProductCross(D, selectCpEntries(D, ALL), 2)
    expect(r.rows.map((x) => x.customer)).toEqual(['丙公司', '甲公司'])
    expect(r.cols).toEqual(['终端安全', '天眼'])
    expect(r.rows[0].cells).toEqual([0, 20])              // 丙公司只有天眼 20h
    expect(r.rows[0].total).toBe(20)
  })
})
