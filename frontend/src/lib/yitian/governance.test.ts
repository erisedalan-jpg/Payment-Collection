import { describe, it, expect } from 'vitest'
import type { YitianData } from '@/types/yitian'
import { selectCpEntries, type CpFilter } from './customerProduct'
import {
  presaleHintByL4, unattributedByWorkType, calibStat, pmShare,
} from './governance'

/** 最小 fixture:2 人 x 5 条工时。issues 指向 entries 的【全量下标】。
 *  管理类那条**刻意放在数组最前**:若实现先过滤客户类再按 issues[].i 取下标,下标会整体错位
 *  一位、结果立刻不同。放在末尾则前四条下标不动,该 bug 检不出来(反向验证实测恒绿)。 */
const D = {
  meta: { top1000Named: {} },
  roster: [
    { id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: true },
    { id: 'A002', name: '小李', l2: '', l3: '', l31: '', l4: '二组', category: '正式', isMgr: false },
  ],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类'],
    workTypes: ['升级加固', '安装部署', '项目管理'],
    customers: ['甲公司'],
    custQuads: [], custBgs: [], prodCats: ['终端安全'],
    products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    // 0:管理类 100h —— 两块一律不得统计;放最前是为了让「先过滤再取下标」的错法暴露出来
    { d: '2026-06-05', e: 'A002', t: 3, h: 100, wt: 2, cu: null, ec: 0, tr: 0, ls: 0, pm: true,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    // 1:一组 项目类 10h 已校准 pm=true
    { d: '2026-06-01', e: 'A001', t: 0, h: 10, wt: 2, cu: 0, ec: 0, tr: 4, ls: 1, pm: true,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 1, iss: ['HINT_PRESALE_PRODUCT'], ct: '' },
    // 2:二组 项目类 20h 多义 pm=false 客户不可归属(tr=0) 工作类型三=升级加固
    { d: '2026-06-02', e: 'A002', t: 0, h: 20, wt: 0, cu: null, ec: 0, tr: 0, ls: 2, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    // 3:二组 售后类 5h 零命中 tr=0 工作类型三=安装部署
    { d: '2026-06-03', e: 'A002', t: 2, h: 5, wt: 1, cu: null, ec: 0, tr: 0, ls: 3, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    // 4:一组 售前类 5h 原始 pm=false
    { d: '2026-06-04', e: 'A001', t: 1, h: 5, wt: 1, cu: 0, ec: 0, tr: 4, ls: 0, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 1, iss: ['HINT_PRESALE_PRODUCT'], ct: '' },
  ],
  issues: [
    { i: 1, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['x'], snippet: '' },
    { i: 4, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['x'], snippet: '' },
  ],
  days: [],
} as unknown as YitianData

const ALL: CpFilter = { start: '', end: '', l4s: [], prodCats: [], types: [], mgrMode: 'all' }
const ROWS = selectCpEntries(D, ALL)

describe('presaleHintByL4(B-5①)', () => {
  it('按 L4 汇总条数与工时', () => {
    const r = presaleHintByL4(D, ALL)
    const one = r.find((x) => x.l4 === '一组')
    expect(one).toMatchObject({ count: 2, hours: 15 })   // entries 0(10h) + 3(5h)
  })

  it('按 L4 筛选生效', () => {
    expect(presaleHintByL4(D, { ...ALL, l4s: ['二组'] })).toEqual([])
  })

  it('按日期区间筛选生效', () => {
    const r = presaleHintByL4(D, { ...ALL, start: '2026-06-04', end: '2026-06-04' })
    expect(r).toEqual([{ l4: '一组', count: 1, hours: 5 }])
  })
})

describe('unattributedByWorkType(B-5②)', () => {
  it('按工作类型三拆分,只看 tr===0 的客户类工时', () => {
    const r = unattributedByWorkType(D, ROWS)
    expect(r).toEqual([
      { workType3: '升级加固', count: 1, hours: 20 },
      { workType3: '安装部署', count: 1, hours: 5 },
    ])   // 管理类那条 tr=0 的 100h 不得混进来
  })

  it('按工时降序', () => {
    const r = unattributedByWorkType(D, ROWS)
    expect(r[0].hours).toBeGreaterThan(r[1].hours)
  })
})

describe('calibStat(B-5③)', () => {
  it('四档计数与覆盖率', () => {
    const s = calibStat(D, ROWS)
    expect(s).toMatchObject({ raw: 1, calibrated: 1, ambiguous: 1, unmatched: 1, pending: 3 })
    expect(s.rate).toBeCloseTo(1 / 3)
  })

  it('无待校准记录时 rate 为 null 而不是 0 或 NaN', () => {
    const s = calibStat(D, ROWS.filter((e) => e.ls === 0))
    expect(s.pending).toBe(0)
    expect(s.rate).toBeNull()
  })
})

describe('pmShare(B-6)', () => {
  it('按 L4 分组算占比', () => {
    const r = pmShare(D, ROWS, 'l4')
    const one = r.find((x) => x.name === '一组')
    expect(one).toMatchObject({ total: 15, pm: 10 })
    expect(one?.share).toBeCloseTo(10 / 15)
    const two = r.find((x) => x.name === '二组')
    expect(two).toMatchObject({ total: 25, pm: 0, share: 0 })   // 真的 0%,不是 null
  })

  it('按员工分组用姓名', () => {
    const r = pmShare(D, ROWS, 'emp')
    expect(r.map((x) => x.name).sort()).toEqual(['小李', '老张'])
  })

  it('按占比降序', () => {
    const r = pmShare(D, ROWS, 'l4')
    expect(r[0].name).toBe('一组')
  })

  it('管理类工时不进分母也不进分子', () => {
    const r = pmShare(D, ROWS, 'l4')
    expect(r.reduce((s, x) => s + x.total, 0)).toBe(40)   // 10+20+5+5,不含管理类 100
  })
})
