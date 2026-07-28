import { describe, it, expect } from 'vitest'
import type { YitianData, YitianEntry } from '@/types/yitian'
import {
  TRANSFER_LABELS, LINE_SRC_LABELS, transferLabel, lineSrcLabel, transferBuckets,
} from './derived'

describe('derived 标签', () => {
  it('五档标签下标与后端枚举一一对应', () => {
    expect(TRANSFER_LABELS).toHaveLength(5)
    expect(TRANSFER_LABELS[0]).toBe('客户不可归属')
    expect(TRANSFER_LABELS[4]).toBe('可转移非原厂')
  })

  it('校准状态四档', () => {
    expect(LINE_SRC_LABELS).toHaveLength(4)
    expect(LINE_SRC_LABELS[1]).toBe('已校准')
  })

  it('越界下标返回空串而不是 undefined', () => {
    expect(transferLabel(99)).toBe('')
    expect(lineSrcLabel(-1)).toBe('')
  })
})

/** 本文件自建 fixture(刻意不跨文件 import customerProduct.test.ts 的那份——
 *  两边各自独立更禁得住改动)。tr 分别为 4/1/3/4,末条管理类 tr=4 须被排除。 */
const D2 = {
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类'],
    customers: [], custQuads: [], custBgs: [], prodCats: [],
    workTypes: [], products: [], productNames: [], projectTypes: [],
    salesL2: [], serviceModes: [],
  },
  roster: [],
  entries: [
    { d: '2026-06-01', e: 'A001', t: 0, h: 10, tr: 4, top: true, cu: null, cq: null, cbg: null,
      ec: null, wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0,
      iss: [], ct: '', el: null, ls: 0, ch: true, pm: false },
    { d: '2026-06-02', e: 'A002', t: 1, h: 4, tr: 1, top: true, cu: null, cq: null, cbg: null,
      ec: null, wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0,
      iss: [], ct: '', el: null, ls: 0, ch: true, pm: false },
    { d: '2026-06-03', e: 'A002', t: 2, h: 6, tr: 3, top: true, cu: null, cq: null, cbg: null,
      ec: null, wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0,
      iss: [], ct: '', el: null, ls: 0, ch: false, pm: false },
    { d: '2026-06-04', e: 'A002', t: 0, h: 20, tr: 4, top: false, cu: null, cq: null, cbg: null,
      ec: null, wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0,
      iss: [], ct: '', el: null, ls: 0, ch: true, pm: false },
    // 管理类 100h —— 五档一律不得统计
    { d: '2026-06-05', e: 'A002', t: 3, h: 100, tr: 4, top: false, cu: null, cq: null, cbg: null,
      ec: null, wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0,
      iss: [], ct: '', el: null, ls: 0, ch: true, pm: false },
  ],
  days: [], issues: [], meta: {},
} as unknown as YitianData
const ENTRIES2 = D2.entries as YitianEntry[]

it('transferBuckets 只统计客户类工时并算出比例', () => {
  // 合计 40h:tr4=30(10+20) tr1=4 tr3=6
  const r = transferBuckets(D2, ENTRIES2)
  expect(r).toHaveLength(5)
  expect(r[4]).toMatchObject({ label: '可转移非原厂', hours: 30 })
  expect(r[4].pct).toBeCloseTo(0.75)
  expect(r[1].hours).toBe(4)
  expect(r[0].hours).toBe(0)
})

it('总量为 0 时 pct 为 0 而不是 NaN', () => {
  const r = transferBuckets(D2, [])
  for (const b of r) expect(b.pct).toBe(0)
})
