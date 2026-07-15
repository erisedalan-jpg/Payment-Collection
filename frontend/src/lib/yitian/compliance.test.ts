import { describe, it, expect } from 'vitest'
import { ISSUE_LABELS, issueRows, countByCode, countByL4, issueHeatmap } from './compliance'
import type { YitianData } from '@/types/yitian'
import type { IssueRow } from './compliance'

const DATA = {
  meta: { hoursPerDay: 8, thisBgL2: ['交付中心'] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' },
    { id: 'A2', name: '李四', l2: '', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: {
    types: ['项目类'], workTypes: [], customers: ['某客户'], products: [], productNames: [],
    projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO1', top: false, ok: 2, iss: ['MISS_SUMMARY', 'MISS_NEXT'] },
    { d: '2026-06-02', e: 'A2', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 2, iss: ['MISS_SUMMARY'] },
    { d: '2026-06-02', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
  ],
  issues: [
    { i: 0, codes: ['MISS_SUMMARY', 'MISS_NEXT'], msgs: ['缺少工作概述', '缺少下一步工作计划'], snippet: '张三的正文' },
    { i: 1, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '李四的正文' },
  ],
} as unknown as YitianData

describe('ISSUE_LABELS', () => {
  it('八码齐全', () => {
    expect(Object.keys(ISSUE_LABELS).sort()).toEqual([
      'HINT_PRESALE_PRODUCT', 'MISS_CUSTOMER', 'MISS_NEXT', 'MISS_PROGRESS',
      'MISS_SERVICE_MODE', 'MISS_SUMMARY', 'PRODUCT_MISMATCH', 'TYPE_MISMATCH',
    ])
  })
})

describe('issueRows', () => {
  it('只出问题行,并挂上员工/组织/客户', () => {
    const rows = issueRows(DATA, '2026-06-01', '2026-06-02')
    expect(rows).toHaveLength(2)
    const r0 = rows.find((r) => r.empId === 'A1')!
    expect(r0.empName).toBe('张三')
    expect(r0.l4).toBe('银行服务组')       // 组织取自花名册
    expect(r0.customer).toBe('某客户')
    expect(r0.workOrder).toBe('WO1')
    expect(r0.snippet).toBe('张三的正文')
    expect(r0.codes).toEqual(['MISS_SUMMARY', 'MISS_NEXT'])
  })

  it('按区间过滤', () => {
    expect(issueRows(DATA, '2026-06-01', '2026-06-01')).toHaveLength(1)
  })

  it('按 L4 过滤', () => {
    const rows = issueRows(DATA, '2026-06-01', '2026-06-02', ['浙江服务组'])
    expect(rows.map((r) => r.empId)).toEqual(['A2'])
  })

  it('合规行不出现在问题清单', () => {
    const rows = issueRows(DATA, '2026-06-01', '2026-06-02')
    expect(rows.every((r) => r.ok !== 0)).toBe(true)
  })
})

describe('countByCode / countByL4', () => {
  const rows = issueRows(DATA, '2026-06-01', '2026-06-02')
  it('按问题码计数(一行多码则各计一次)', () => {
    const c = countByCode(rows)
    expect(c[0]).toMatchObject({ code: 'MISS_SUMMARY', label: '缺少工作概述', count: 2 })
    expect(c.find((x) => x.code === 'MISS_NEXT')!.count).toBe(1)
  })
  it('按 L4 计数(问题行数,不是问题码数)', () => {
    const c = countByL4(rows)
    expect(c).toHaveLength(2)
    expect(c.every((x) => x.count === 1)).toBe(true)
  })
})

// I-7:合规明细页(issueRows)必须吃 excludedTypes,否则超管把某类型剔出合规范围后,
// /yitian 总览的问题数变了,/yitian/compliance 仍原样列出这些行,两页对不上。
const DATA_WITH_EXCLUDABLE_TYPE = {
  ...DATA,
  dims: { ...DATA.dims, types: ['项目类', '假期类'] },
  entries: [
    ...DATA.entries,
    // 第 4 条(下标 3):假期类问题行,issues[].i 必须指向这个原始下标(带 index 遍历,不能先过滤)
    { d: '2026-06-02', e: 'A2', t: 1, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 2, iss: ['MISS_SUMMARY'] },
  ],
  issues: [
    ...DATA.issues,
    { i: 3, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '假期类问题行正文' },
  ],
} as unknown as YitianData

describe('issueRows · excludedTypes(I-7,口径与总览/趋势页同源)', () => {
  it('excludedTypes 为空时不剔除任何类型', () => {
    const rows = issueRows(DATA_WITH_EXCLUDABLE_TYPE, '2026-06-01', '2026-06-02', [], [])
    expect(rows.some((r) => r.type === '假期类')).toBe(true)
  })

  it('excludedTypes 剔除假期类后,该行从问题明细里消失', () => {
    const rows = issueRows(DATA_WITH_EXCLUDABLE_TYPE, '2026-06-01', '2026-06-02', [], ['假期类'])
    expect(rows.some((r) => r.type === '假期类')).toBe(false)
    expect(rows).toHaveLength(2)   // 只剩原来两条项目类问题行
  })

  it('剔除后 issues[].i 下标映射仍然正确(不能先过滤 entries 再遍历)', () => {
    const rows = issueRows(DATA_WITH_EXCLUDABLE_TYPE, '2026-06-01', '2026-06-02', [], [])
    const r3 = rows.find((r) => r.type === '假期类')!
    expect(r3.snippet).toBe('假期类问题行正文')
  })
})

const R: IssueRow[] = [
  { date: '', empId: '', empName: '', l4: '银行组', l31: '', type: '', customer: '', workOrder: '', hours: 0, ok: 2, codes: ['MISS_SUMMARY', 'MISS_NEXT'], msgs: [], snippet: '' },
  { date: '', empId: '', empName: '', l4: '银行组', l31: '', type: '', customer: '', workOrder: '', hours: 0, ok: 2, codes: ['MISS_SUMMARY'], msgs: [], snippet: '' },
  { date: '', empId: '', empName: '', l4: '浙江组', l31: '', type: '', customer: '', workOrder: '', hours: 0, ok: 1, codes: ['MISS_NEXT'], msgs: [], snippet: '' },
]

describe('issueHeatmap', () => {
  const h = issueHeatmap(R)
  it('码轴按问题码计数降序', () => {
    expect(h.codes.map((c) => c.code)).toEqual(['MISS_SUMMARY', 'MISS_NEXT']) // 2 vs 2? 见下:MISS_SUMMARY=2,MISS_NEXT=2
  })
  it('L4 轴按问题行数降序', () => {
    expect(h.l4s).toEqual(['银行组', '浙江组']) // 银行组2行 > 浙江组1行
  })
  it('cells 为 [l4Index, codeIndex, count],max 正确', () => {
    // 银行组(x=0) × MISS_SUMMARY(y=0) = 2
    const bankSummary = h.cells.find((c) => c[0] === 0 && c[1] === 0)
    expect(bankSummary?.[2]).toBe(2)
    expect(h.max).toBe(2)
  })
})
