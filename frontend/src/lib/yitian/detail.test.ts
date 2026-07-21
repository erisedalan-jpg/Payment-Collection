import { describe, it, expect } from 'vitest'
import {
  buildDetailRows, filterDetailRows, detailSummary, buildDetailSheetRows,
  ALL_COLUMNS, DEFAULT_VISIBLE, FILTERABLE,
} from './detail'
import type { YitianData } from '@/types/yitian'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 3,
          employees: 2, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: 'BG1', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '交付' },
    { id: 'A2', name: '李四', l2: 'BG1', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '交付' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: ['某客户'], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO1', top: true, ok: 2, iss: ['MISS_SUMMARY'], ct: '张三完整的工作成果全文内容，超过一百二十字的部分也应完整展示不截断' },
    { d: '2026-06-02', e: 'A2', t: 0, h: 6, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO2', top: false, ok: 1, iss: ['HINT_PRESALE_PRODUCT'], ct: '李四的工作内容' },
    { d: '2026-06-02', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [], ct: '张三的日常管理工作' },
  ],
  issues: [
    { i: 0, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '张三的正文' },
    { i: 1, codes: ['HINT_PRESALE_PRODUCT'], msgs: [], snippet: '' },
  ],
} as unknown as YitianData

describe('buildDetailRows', () => {
  it('逐条还原:码表 + roster join,行数 = 全量 entries', () => {
    const rows = buildDetailRows(DATA)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ empName: '张三', l4: '银行服务组', type: '项目类', customer: '某客户', workOrder: 'WO1', top: true, ok: 2, okText: '问题' })
    expect(rows[1]).toMatchObject({ empName: '李四', ok: 1, okText: '提示', customer: '' })
    expect(rows[2]).toMatchObject({ empName: '张三', ok: 0, okText: '合规', issueReason: '' })
  })

  it('issueReason:有 msgs 用 msgs、msgs 空用 codes→ISSUE_LABELS 兜底;snippet 仅问题行(ok=2)', () => {
    const rows = buildDetailRows(DATA)
    expect(rows[0].issueReason).toBe('缺少工作概述')
    expect(rows[0].snippet).toBe('张三的正文')
    expect(rows[1].issueReason).toBe('售前服务类产品类别不应为「其他」') // codes 兜底(msgs 空)
    expect(rows[1].snippet).toBe('') // ok=1 不带 snippet
  })

  it('工作成果全文(content)整列还原:所有行(含合规行 ok=0)都带全文、不截断', () => {
    const rows = buildDetailRows(DATA)
    expect(rows[0].content).toBe('张三完整的工作成果全文内容，超过一百二十字的部分也应完整展示不截断')
    expect(rows[2].content).toBe('张三的日常管理工作') // 合规行也有全文,不再仅问题行摘要
  })
})

describe('filterDetailRows', () => {
  it('日期区间闭边界', () => {
    const rows = buildDetailRows(DATA)
    expect(filterDetailRows(rows, { start: '2026-06-02', end: '2026-06-02' })).toHaveLength(2)
  })
  it('L4 粗筛(l4s 空=不筛)', () => {
    const rows = buildDetailRows(DATA)
    expect(filterDetailRows(rows, { l4s: [] })).toHaveLength(3)
    expect(filterDetailRows(rows, { l4s: ['浙江服务组'] }).map((r) => r.empName)).toEqual(['李四'])
  })
  it('onlyIssues 只留 ok!=0', () => {
    const rows = buildDetailRows(DATA)
    expect(filterDetailRows(rows, { onlyIssues: true })).toHaveLength(2)
  })
})

describe('detailSummary', () => {
  it('总条数/总工时/三态计数', () => {
    const s = detailSummary(buildDetailRows(DATA))
    expect(s).toEqual({ count: 3, totalHours: 22, ok: 1, warn: 1, issue: 1 })
  })
})

describe('列常量 + 导出', () => {
  it('DEFAULT_VISIBLE ⊂ ALL_COLUMNS 的 key;okText 可筛、date 不可筛', () => {
    const keys = new Set(ALL_COLUMNS.map((c) => c.key))
    expect(DEFAULT_VISIBLE.every((k) => keys.has(k))).toBe(true)
    expect(FILTERABLE.has('okText')).toBe(true)
    expect(FILTERABLE.has('date')).toBe(false)
  })
  it('工作成果列存在且默认可见;纳入可见列时导出全文(不截断)', () => {
    expect(ALL_COLUMNS.some((c) => c.key === 'content' && c.label === '工作成果')).toBe(true)
    expect(DEFAULT_VISIBLE).toContain('content')
    const rows = buildDetailRows(DATA)
    const out = buildDetailSheetRows(rows, ALL_COLUMNS.filter((c) => c.key === 'content'))
    expect(out[0]).toEqual({ 工作成果: '张三完整的工作成果全文内容，超过一百二十字的部分也应完整展示不截断' })
  })
  it('buildDetailSheetRows 按可见列用中文列名作键、不含 snippet', () => {
    const rows = buildDetailRows(DATA)
    const cols = ALL_COLUMNS.filter((c) => ['empName', 'okText'].includes(c.key))
    const out = buildDetailSheetRows(rows, cols)
    expect(out[0]).toEqual({ 员工: '张三', 合规状态: '问题' })
    expect(JSON.stringify(out)).not.toContain('正文')
  })
})
