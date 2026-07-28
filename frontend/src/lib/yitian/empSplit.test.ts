import { describe, it, expect } from 'vitest'
import type { YitianData } from '@/types/yitian'
import { empSplit } from './empSplit'

const D = {
  roster: [{ id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: false }],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类', '假期类'],
    workTypes: [], customers: [], custQuads: [], custBgs: [], prodCats: [],
    products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    { d: '2026-06-01', e: 'A001', t: 0, h: 10 }, { d: '2026-06-02', e: 'A001', t: 1, h: 4 },
    { d: '2026-06-03', e: 'A001', t: 2, h: 6 }, { d: '2026-06-04', e: 'A001', t: 3, h: 8 },
    { d: '2026-06-05', e: 'A001', t: 4, h: 8 },
  ],
  meta: {}, days: [], issues: [],
} as unknown as YitianData

describe('empSplit', () => {
  it('五类工时各自归位,面向客户 = 三类之和', () => {
    const m = empSplit(D, D.entries)
    const s = m.get('A001')
    expect(s).toEqual({ nonCustomer: 16, customer: 20, project: 10, presale: 4, postsale: 6 })
    expect(s!.customer).toBe(s!.project + s!.presale + s!.postsale)
  })

  it('工时类型为空的行计入非面向客户', () => {
    const d2 = { ...D, entries: [{ d: '2026-06-01', e: 'A001', t: null, h: 3 }] } as unknown as YitianData
    expect(empSplit(d2, d2.entries).get('A001')).toMatchObject({ nonCustomer: 3, customer: 0 })
  })

  it('无记录的员工不出现在 Map 里(调用方用 ?? 缺省)', () => {
    expect(empSplit(D, []).size).toBe(0)
  })
})
