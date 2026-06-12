import { describe, it, expect } from 'vitest'
import { buildHealthReport } from './governance'
import type { AnalysisData } from '@/types/analysis'

function makeData(over: Record<string, any> = {}): AnalysisData {
  return {
    meta: { lastUpdate: '2026-06-12 09:00', totalProjects: 10, totalPaymentNodes: 50 },
    dashboard: {}, summary: {}, projectOverview: {},
    rawNodes: [{ projectId: 'P-1', tier: '100万以上', isPaymentRelated: true }],
    dataQuality: {
      summary: { pmisProvided: true, joinRate: 0.95, matchedActive: 8, matchedClosed: 2, unmatched: 0, lastPmisUpdate: '2026-06-11' },
      themes: [
        { theme: '成本', coveragePct: 0.9, verdict: 'green' },
        { theme: '进度', coveragePct: 0.8, verdict: 'green' },
      ],
      unmatched: [], backfill: [], conflicts: [], dirty: [],
    },
    projectsQuality: {
      deptProjectCount: 9,
      orgFile: { provided: true, rows: 30, matched: 25, matchRate: 0.83 },
      mappingFile: { provided: true, rows: 5, matched: 5, matchRate: 1 },
      deliveryFile: { provided: true, rows: 40, matched: 38, matchRate: 0.95 },
      staffNoProject: [], managerNotInOrg: [], presaleTotal: 3, presaleMapped: 3, presaleUnmapped: [],
    },
    ...over,
  } as any
}

describe('buildHealthReport', () => {
  it('全源就绪零告警 → 绿', () => {
    const r = buildHealthReport(makeData())
    expect(r.verdict).toBe('green')
    expect(r.title).toBe('数据就绪')
    expect(r.sources).toHaveLength(5)
    expect(r.sources.every((s) => s.provided)).toBe(true)
    expect(r.alerts.every((a) => a.count === 0)).toBe(true)
    expect(r.metaLine).toContain('2026-06-12 09:00')
  })

  it('仅低优先告警不阻塞绿,副文案附注条数', () => {
    const d = makeData()
    ;(d.dataQuality as any).dirty = [{ type: '金额', projectId: 'P-1', field: 'x', value: 'y' }]
    const r = buildHealthReport(d)
    expect(r.verdict).toBe('green')
    expect(r.sub).toBe('1 条低优先提示')
  })

  it('高/中告警 → 黄,标题计类数,backfill 缺失字段 join', () => {
    const d = makeData()
    ;(d.dataQuality as any).unmatched = [{ projectId: 'X-1', projectName: '甲', kind: '在建' }]
    ;(d.dataQuality as any).backfill = [{ projectId: 'P-2', projectName: '乙', missingFields: ['评级', '行业'] }]
    const r = buildHealthReport(d)
    expect(r.verdict).toBe('yellow')
    expect(r.title).toBe('2 类告警需关注')
    expect(r.alerts.find((a) => a.key === 'backfill')!.rows[0].missingFields).toBe('评级、行业')
  })

  it('云文档缺失 → 红(优先级最高)', () => {
    const r = buildHealthReport(makeData({ rawNodes: [] }))
    expect(r.verdict).toBe('red')
    expect(r.title).toContain('数据不可用')
    expect(r.sources.find((s) => s.key === 'yundocs')!.provided).toBe(false)
  })

  it('辅源缺失 → 卡未提供 + 高严重度缺失告警(note 降级说明) + 黄', () => {
    const d = makeData()
    ;(d.projectsQuality as any).orgFile = { provided: false, rows: 0, matched: 0, matchRate: 0 }
    const r = buildHealthReport(d)
    expect(r.verdict).toBe('yellow')
    const card = r.sources.find((s) => s.key === 'org')!
    expect(card.provided).toBe(false)
    expect(card.subs).toEqual(['未提供'])
    const miss = r.alerts.find((a) => a.key === 'missing-org')!
    expect(miss.severity).toBe('high')
    expect(miss.columns).toEqual([])
    expect(miss.note).toContain('组织架构')
  })

  it('dataQuality 整体缺失 → PMIS 卡未提供且不崩', () => {
    const r = buildHealthReport(makeData({ dataQuality: null }))
    expect(r.sources.find((s) => s.key === 'pmis')!.provided).toBe(false)
    expect(r.alerts.find((a) => a.key === 'missing-pmis')).toBeTruthy()
    expect(r.verdict).toBe('yellow')
  })

  it('projectsQuality 整体缺失 → 三卡未提供+三条缺失告警', () => {
    const r = buildHealthReport(makeData({ projectsQuality: null }))
    expect(r.sources.filter((s) => !s.provided).map((s) => s.key)).toEqual(['org', 'mapping', 'delivery'])
    expect(r.alerts.filter((a) => a.key.startsWith('missing-'))).toHaveLength(3)
  })

  it('排序:0条沉底,非零按严重度高→低再条数降序', () => {
    const d = makeData()
    ;(d.dataQuality as any).unmatched = [{ projectId: 'a' }]
    ;(d.projectsQuality as any).managerNotInOrg = [{ projectId: 'b' }, { projectId: 'c' }]
    ;(d.dataQuality as any).dirty = [{ type: 't', projectId: 'p', field: 'f', value: 'v' }]
    const r = buildHealthReport(d)
    expect(r.alerts.filter((a) => a.count > 0).map((a) => a.key)).toEqual(['managerNotInOrg', 'unmatched', 'dirty'])
    expect(r.alerts[r.alerts.length - 1].count).toBe(0)
  })

  it('主题覆盖不足进中级告警,PMIS 卡辅信息含主题可用比', () => {
    const d = makeData()
    ;(d.dataQuality as any).themes = [
      { theme: '成本', coveragePct: 0.9, verdict: 'green' },
      { theme: '风险', coveragePct: 0.2, verdict: 'red' },
    ]
    const r = buildHealthReport(d)
    const t = r.alerts.find((a) => a.key === 'themesLow')!
    expect(t.count).toBe(1)
    expect(t.rows[0]).toEqual({ theme: '风险', coverage: '20%', verdict: '不足' })
    expect(r.sources.find((s) => s.key === 'pmis')!.subs[0]).toContain('主题 1/2 可用')
  })

  it('导出文件名只挂在指定四类目', () => {
    const r = buildHealthReport(makeData())
    expect(r.alerts.filter((a) => a.exportName).map((a) => a.key).sort())
      .toEqual(['backfill', 'managerNotInOrg', 'presaleUnmapped', 'unmatched'])
  })
})
