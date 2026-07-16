import { describe, it, expect } from 'vitest'
import { filterPayNodes, payDashSummary, payTierStats } from './payDashboard'
import type { PayNodeRow } from './paymentPmis'
import type { Project, PaymentNodePmis, PaymentRecordsEntry } from '@/types/analysis'

function node(p: Partial<PayNodeRow>): PayNodeRow {
  return {
    projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-01', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0, projectManager: '张三',
    status: '待回款', dept: 'A组', orgL3_1: '', projStage: '', tier: '100万以上', progress: '部分回款', ...p,
  }
}

describe('filterPayNodes', () => {
  const rows = [
    node({ projectId: 'P1', dept: 'A组', projectManager: '张三', planDate: '2026-02-01' }),
    node({ projectId: 'P2', dept: 'B组', projectManager: '李四', planDate: '2026-08-01' }),
    node({ projectId: 'P3', dept: 'A组', projectManager: '张三', planDate: '' }),
  ]
  const base = { dateStart: '', dateEnd: '', viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  it('视角 l4 按 dept 过滤', () => {
    expect(filterPayNodes(rows, { ...base, viewMode: 'l4', viewL4: 'A组' }).map((r) => r.projectId)).toEqual(['P1', 'P3'])
  })
  it('视角 pm 按 projectManager 过滤', () => {
    expect(filterPayNodes(rows, { ...base, viewMode: 'pm', viewPM: '李四' }).map((r) => r.projectId)).toEqual(['P2'])
  })
  it('排除按 excludedIds', () => {
    expect(filterPayNodes(rows, { ...base, excludeActive: true, excludedIds: { P1: true } }).map((r) => r.projectId)).toEqual(['P2', 'P3'])
  })
  it('dateStart/dateEnd 均空=全部（含空 planDate）', () => {
    expect(filterPayNodes(rows, { ...base }).map((r) => r.projectId)).toEqual(['P1', 'P2', 'P3'])
  })
  it('区间过滤 2026-01-01~2026-06-30: P1 在内 P2 不在 P3(空 planDate)排除', () => {
    expect(filterPayNodes(rows, { ...base, dateStart: '2026-01-01', dateEnd: '2026-06-30' }).map((r) => r.projectId)).toEqual(['P1'])
  })
  it('仅 dateStart 限制下界', () => {
    expect(filterPayNodes(rows, { ...base, dateStart: '2026-07-01', dateEnd: '' }).map((r) => r.projectId)).toEqual(['P2'])
  })
})

describe('payDashSummary', () => {
  const rows = [
    node({ projectId: 'P1', expectedPayment: 1000, receivedAmount: 600, unpaidAmount: 400, status: '部分回款', planDate: '2026-02-01' }),
    node({ projectId: 'P2', expectedPayment: 500, receivedAmount: 0, unpaidAmount: 500, status: '延期', planDate: '2026-08-01' }),
  ]
  // paymentPmis.contract：P1=1200, P2=1000，Σ=2200（用于新 rate 分母）
  const projects = [
    { projectId: 'P1', orgL4: 'A组', projectManager: '张三', paymentPmis: { contract: 1200 } },
    { projectId: 'P2', orgL4: 'B组', projectManager: '李四', paymentPmis: { contract: 1000 } },
  ] as any
  const opts = { viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  // paymentRecords: P1 有流水 700, P2 有流水 200
  const paymentRecords = {
    P1: { records: [{ date: '2026-02-10', amount: 700 }] },
    P2: { records: [{ date: '2026-08-05', amount: 200 }] },
  } as any
  // paymentNodes: 与 rows planDate 对应
  const paymentNodes = {
    P1: [{ planDate: '2026-02-01', expectedPayment: 1000, unpaidAmount: 400, reached: false, status: '部分回款' }],
    P2: [{ planDate: '2026-08-01', expectedPayment: 500, unpaidAmount: 500, reached: false, status: '延期' }],
  } as any

  it('全部口径: 已回款=Σ全流水(inScope), 完成率=totalActual/Σcontract, 延期项目/relatedNodeCount', () => {
    const s = payDashSummary(rows, projects, opts, paymentRecords, paymentNodes, '', '')
    expect(s.relatedNodeCount).toBe(2)
    expect(s.totalActual).toBe(900)           // P1:700 + P2:200
    expect(s.totalExpected).toBe(1500)        // 来自 rows
    expect(s.totalRemaining).toBe(900)        // 来自 rows
    // 分母改为 Σcontract=1200+1000=2200
    expect(s.rate).toBeCloseTo(900 / 2200)
    expect(s.delayedProjects).toBe(1)
    // 全部下两个项目均有活动
    expect(s.totalProjects).toBe(2)
  })

  it('区间收窄：已回款恒全时(不随区间)、项目活动数=区间内有活动', () => {
    // 区间 2026-01-01~2026-06-30：已回款/完成率恒全时(全站统一口径)，不随区间；仅项目活动数按区间
    const s = payDashSummary(rows, projects, opts, paymentRecords, paymentNodes, '2026-01-01', '2026-06-30')
    expect(s.totalActual).toBe(900)           // 全时=P1:700 + P2:200（不因区间收窄丢掉 P2 的 200）
    expect(s.totalProjects).toBe(1)           // 项目活动数仍按区间：只有 P1 有活动(节点 2026-02-01 在区间内)
  })

  it('完成率恒全时：区间收窄不改分子分母(全站统一口径 Σ流水全加÷Σ合同)', () => {
    // 替代旧 S8 区间自洢分母口径：完成率= Σ全时流水(900) ÷ Σ全 inScope 合同(2200)，不随区间
    const s = payDashSummary(rows, projects, opts, paymentRecords, paymentNodes, '2026-01-01', '2026-06-30')
    expect(s.rate).toBeCloseTo(900 / 2200)
  })

  it('全部口径不变式: start=end="" 时 totalActual=Σ全流水(inScope)', () => {
    const s = payDashSummary(rows, projects, opts, paymentRecords, paymentNodes, '', '')
    expect(s.totalActual).toBe(900)
    // 分母改为 Σcontract=2200
    expect(s.rate).toBeCloseTo(900 / 2200)
  })

  it('无 paymentRecords 时 totalActual=0', () => {
    const s = payDashSummary(rows, projects, opts, undefined, undefined, '', '')
    expect(s.totalActual).toBe(0)
    expect(s.rate).toBe(0)
  })

  it('totalProjects 排除 orgL4 空项目', () => {
    const p2 = [
      { projectId: 'A', projectName: 'a', orgL4: '组1' } as any,
      { projectId: 'X', projectName: 'x', orgL4: '' } as any,
    ]
    const opts2 = { viewMode: 'global', viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} } as any
    // 全部口径, 无活动(paymentRecords/paymentNodes 均空), 只有 A(orgL4非空) 在 inScope
    // start=end='' 下 hasActivityInRange 对空 nodes/records 返回 false => totalProjects=0
    expect(payDashSummary([], p2, opts2, {}, {}, '', '').totalProjects).toBe(0)
    // inScope 仍有 1 个项目(A), 只是无活动
    expect(payDashSummary([], p2, opts2).relatedNodeCount).toBe(0)
  })
})

describe('payTierStats', () => {
  // P1: contract=2000000 => 100万以上; P2: contract=600000 => 50-100万; P3: contract=300000 => 50万以下
  const projects: Project[] = [
    { projectId: 'P1', projectName: 'A', paymentPmis: { contract: 2000000 } } as any,
    { projectId: 'P2', projectName: 'B', paymentPmis: { contract: 600000 } } as any,
    { projectId: 'P3', projectName: 'C', paymentPmis: { contract: 300000 } } as any,
  ]
  // paymentNodes: P1 有两节点(planDate 2026-02-01 在区间内、2026-08-01 不在); P2 节点 2026-02-10 在区间内; P3 节点 2026-02-15 在区间内
  const paymentNodes: Record<string, PaymentNodePmis[]> = {
    P1: [
      { planDate: '2026-02-01', expectedPayment: 1000000, unpaidAmount: 400000, status: '延期' } as any,
      { planDate: '2026-08-01', expectedPayment: 500000, unpaidAmount: 500000, status: '待回款' } as any,
    ],
    P2: [
      { planDate: '2026-02-10', expectedPayment: 200000, unpaidAmount: 100000, status: '已回款' } as any,
    ],
    P3: [
      { planDate: '2026-02-15', expectedPayment: 80000, unpaidAmount: 80000, status: '待回款' } as any,
    ],
  }
  // paymentRecords: P1 流水 2026-02-15 共 700000; P2 流水 2026-08-20 共 150000(区间外)
  const paymentRecords: Record<string, PaymentRecordsEntry> = {
    P1: { records: [{ date: '2026-02-15', amount: 700000 }] } as any,
    P2: { records: [{ date: '2026-08-20', amount: 150000 }] } as any,
  }
  const start = '2026-01-01'
  const end = '2026-06-30'

  it('按 contract 档位分组，计划/节点数/延期 走节点(planDate∈R)', () => {
    const s = payTierStats('100万以上', projects, paymentNodes, paymentRecords, start, end)
    expect(s.projectCount).toBe(1)                         // 只有 P1
    expect(s.relatedNodeCount).toBe(1)                     // P1 只有 2026-02-01 在区间
    expect(s.expectedAmountWan).toBeCloseTo(100)           // 1000000/10000
    expect(s.remainingAmountWan).toBeCloseTo(40)           // 400000/10000
    expect(s.delayedCount).toBe(1)
    expect(s.paidCount).toBe(0)
  })

  it('已回款=Σ流水(actualInRange), 区间外流水不计', () => {
    const s1 = payTierStats('100万以上', projects, paymentNodes, paymentRecords, start, end)
    expect(s1.actualAmountWan).toBeCloseTo(70)             // P1 流水 700000/10000

    const s2 = payTierStats('50-100万', projects, paymentNodes, paymentRecords, start, end)
    expect(s2.actualAmountWan).toBeCloseTo(0)              // P2 流水 2026-08-20 不在区间
    expect(s2.relatedNodeCount).toBe(1)                    // P2 节点 2026-02-10 在区间
    expect(s2.paidCount).toBe(1)                           // 节点 status=已回款
  })

  it('全部不变式: start=end="" 时 relatedNodeCount=全节点数, actualAmountWan=全流水', () => {
    const s = payTierStats('100万以上', projects, paymentNodes, paymentRecords, '', '')
    expect(s.relatedNodeCount).toBe(2)                     // P1 全部 2 节点
    expect(s.actualAmountWan).toBeCloseTo(70)              // P1 全部流水
  })

  it('无 paymentNodes/paymentRecords 时全零', () => {
    const s = payTierStats('100万以上', projects, undefined, undefined, start, end)
    expect(s.projectCount).toBe(1)
    expect(s.relatedNodeCount).toBe(0)
    expect(s.expectedAmountWan).toBe(0)
    expect(s.actualAmountWan).toBe(0)
  })

  it('空 projects => 全零', () => {
    const s = payTierStats('100万以上', [], paymentNodes, paymentRecords, start, end)
    expect(s.projectCount).toBe(0)
    expect(s.relatedNodeCount).toBe(0)
    expect(s.actualAmountWan).toBe(0)
  })
})

import { payOrgRanking, payMonthlyTrend, payQuarterlyTrend } from './payDashboard'

describe('payOrgRanking', () => {
  // 两个 L4 服务组，各有一个项目；paymentPmis.contract 用于新达成率分母
  const projects = [
    { projectId: 'P1', orgL4: 'A组', projectManager: '张三', paymentPmis: { contract: 1200 } },
    { projectId: 'P2', orgL4: 'B组', projectManager: '李四', paymentPmis: { contract: 2500 } },
  ] as any

  // P1: 计划节点 2026-02-01 期望=1000；P2: 计划节点 2026-08-01 期望=2000
  const paymentNodes = {
    P1: [{ planDate: '2026-02-01', expectedPayment: 1000 }],
    P2: [{ planDate: '2026-08-01', expectedPayment: 2000 }],
  } as any

  // P1: 流水 2026-02-10 金额=800；P2: 流水 2026-08-05 金额=500
  const paymentRecords = {
    P1: { records: [{ date: '2026-02-10', amount: 800 }] },
    P2: { records: [{ date: '2026-08-05', amount: 500 }] },
  } as any

  it('全部口径(start=end=""): 计划=Σ全节点, 已回款=Σ全流水, 达成率=已回/合同, 按 actualTotal 降序', () => {
    const r = payOrgRanking(projects, paymentNodes, paymentRecords, '', '', 'actualTotal')
    expect(r[0].org).toBe('A组')
    expect(r[0].expectedTotal).toBe(1000)
    expect(r[0].actualTotal).toBe(800)
    // 分母改为合同：A组 contract=1200 → 800/1200≈0.667
    expect(r[0].achievementRate).toBeCloseTo(800 / 1200)
    expect(r[1].org).toBe('B组')
    expect(r[1].actualTotal).toBe(500)
  })

  it('按 achievementRate 降序: A组(800/1200) > B组(500/2500)', () => {
    const r = payOrgRanking(projects, paymentNodes, paymentRecords, '', '', 'achievementRate')
    expect(r[0].org).toBe('A组')
    // A组: 800/1200≈0.667; B组: 500/2500=0.2（分母改合同）
    expect(r[0].achievementRate).toBeCloseTo(800 / 1200)
    expect(r[1].achievementRate).toBeCloseTo(500 / 2500)
  })

  it('区间 2026-01-01~2026-06-30: 计划节点按区间(只计 P1);已回款恒全时(V2.6.7 起 P1/P2 流水均计入)', () => {
    const r = payOrgRanking(projects, paymentNodes, paymentRecords, '2026-01-01', '2026-06-30', 'actualTotal')
    const a = r.find((o) => o.org === 'A组')!
    const b = r.find((o) => o.org === 'B组')!
    expect(a.expectedTotal).toBe(1000)   // 节点计划日在区间内
    expect(a.actualTotal).toBe(800)      // 已回款恒全时
    expect(b.expectedTotal).toBe(0)      // 节点计划日 2026-08-01 不在区间
    expect(b.actualTotal).toBe(500)      // 已回款恒全时,即使流水到账日 2026-08-05 不在所选区间
  })

  it('全部不变式: start=end="" 时计划=Σ全节点、已回=Σ全流水', () => {
    const r = payOrgRanking(projects, paymentNodes, paymentRecords, '', '', 'actualTotal')
    const totalExpected = r.reduce((s, o) => s + o.expectedTotal, 0)
    const totalActual = r.reduce((s, o) => s + o.actualTotal, 0)
    expect(totalExpected).toBe(3000)   // 1000 + 2000
    expect(totalActual).toBe(1300)     // 800 + 500
  })

  it('actualTotalWan = actualTotal / 10000', () => {
    const r = payOrgRanking(projects, paymentNodes, paymentRecords, '', '', 'actualTotal')
    for (const o of r) expect(o.actualTotalWan).toBeCloseTo(o.actualTotal / 10000)
  })

  it('无 paymentRecords/paymentNodes 时 actualTotal=0, expectedTotal=0', () => {
    const r = payOrgRanking(projects, undefined, undefined, '', '', 'actualTotal')
    for (const o of r) {
      expect(o.actualTotal).toBe(0)
      expect(o.expectedTotal).toBe(0)
      expect(o.achievementRate).toBe(0)
    }
  })

  it('达成率分母恒全量合同(V2.6.7 起不再随区间收窄到"区间内有活动项目",对齐 payDashSummary 全站口径)', () => {
    // A组两项目同组: PA 区间内有活动(2026-02), PB 区间外(2026-08); 合同各 1000
    const projects2 = [
      { projectId: 'PA', orgL4: 'A组', paymentPmis: { contract: 1000 } },
      { projectId: 'PB', orgL4: 'A组', paymentPmis: { contract: 1000 } },
    ] as any
    const nodes2 = {
      PA: [{ planDate: '2026-02-01', expectedPayment: 500 }],
      PB: [{ planDate: '2026-08-01', expectedPayment: 500 }],
    } as any
    const recs2 = {
      PA: { records: [{ date: '2026-02-10', amount: 600 }] },
      PB: { records: [{ date: '2026-08-05', amount: 700 }] },
    } as any
    const r = payOrgRanking(projects2, nodes2, recs2, '2026-01-01', '2026-06-30', 'actualTotal')
    const a = r.find((o) => o.org === 'A组')!
    expect(a.actualTotal).toBe(1300)                    // PA+PB 流水恒全时计入(不受所选区间限制)
    expect(a.contractTotal).toBe(2000)                  // 分母=全量合同(PA+PB),不再按区间活动筛选
    expect(a.achievementRate).toBeCloseTo(1300 / 2000)  // 65%
  })
})

describe('payOrgRanking 恒全时口径', () => {
  const projects = [{ projectId: 'P1', orgL4: 'A组', paymentPmis: { contract: 1000000 } }] as any
  const paymentNodes = { P1: [{ planDate: '2026-02-01', expectedPayment: 500000, status: '待回款' }] } as any
  // 2025 年到账流水:区间口径(本年度)会漏,全时口径应计入
  const paymentRecords = { P1: { records: [{ date: '2025-06-01', amount: 500000 }] } } as any

  it('已回款/达成率取全时,即使日期区间为 2026 年', () => {
    const r = payOrgRanking(projects, paymentNodes, paymentRecords, '2026-01-01', '2026-12-31', 'achievementRate')
    expect(r[0].actualTotal).toBe(500000)          // 全时含 2025 流水
    expect(r[0].contractTotal).toBe(1000000)       // 全量合同
    expect(r[0].achievementRate).toBeCloseTo(0.5)  // 50%
  })
})

describe('payMonthlyTrend/payQuarterlyTrend', () => {
  const rows = [
    node({ tier: '100万以上', planDate: '2026-02-10', unpaidAmount: 10000, status: '待回款' }),
    node({ tier: '100万以上', planDate: '2026-05-10', unpaidAmount: 20000, status: '延期' }),
    node({ tier: '100万以上', planDate: '2026-02-10', unpaidAmount: 99999, status: '已回款' }),
  ]
  it('月度按 planDate 月份分桶，已回款不计（start/end 空=全部）', () => {
    const s = payMonthlyTrend(rows, '', '')
    expect(s.categories).toContain('2026-02')
    const t = s.series.find((x) => x.tier === '100万以上')!
    const i = s.categories.indexOf('2026-02')
    expect(t.data[i]).toBeCloseTo(1)
  })
  it('指定区间补满月份键（2026-01-01~2026-12-31 补 12 个月）', () => {
    expect(payMonthlyTrend(rows, '2026-01-01', '2026-12-31').categories.length).toBe(12)
  })
  it('季度分桶 key 形如 2026-Q1（start/end 空=全部）', () => {
    expect(payQuarterlyTrend(rows, '', '').categories).toContain('2026-Q1')
  })
  it('指定区间补满季度键（2026-01-01~2026-12-31 补 4 季度）', () => {
    expect(payQuarterlyTrend(rows, '2026-01-01', '2026-12-31').categories.length).toBe(4)
  })
  it('趋势桶值为整数万（含小数 unpaid 四舍五入）', () => {
    // 123456 元 → 12.3456 万 → Math.round = 12
    // 135000 元 → 13.5 万 → Math.round = 14（四舍五入）
    const decimalRows = [
      node({ tier: '100万以上', planDate: '2026-03-01', unpaidAmount: 123456, status: '待回款' }),
      node({ tier: '100万以上', planDate: '2026-03-15', unpaidAmount: 135000, status: '延期' }),
    ]
    const s = payMonthlyTrend(decimalRows, '', '')
    const t = s.series.find((x) => x.tier === '100万以上')!
    const i = s.categories.indexOf('2026-03')
    // 同桶合并后: (123456 + 135000) / 10000 = 25.8456 → Math.round = 26
    expect(Number.isInteger(t.data[i])).toBe(true)
    expect(t.data[i]).toBe(26)
  })
  it('趋势桶值整数万（季度分桶）', () => {
    const decimalRows = [
      node({ tier: '50-100万', planDate: '2026-04-01', unpaidAmount: 99999, status: '待回款' }),
    ]
    const s = payQuarterlyTrend(decimalRows, '', '')
    const t = s.series.find((x) => x.tier === '50-100万')!
    const i = s.categories.indexOf('2026-Q2')
    // 99999 / 10000 = 9.9999 → Math.round = 10
    expect(Number.isInteger(t.data[i])).toBe(true)
    expect(t.data[i]).toBe(10)
  })
})

import { noStageProjects } from './payDashboard'

describe('payDashboard 整体项目数/无回款阶段', () => {
  const OPTS = { viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  const P = (id: string, orgL4 = 'X', contract = 1000000) =>
    ({ projectId: id, projectName: id + '名', projectManager: '张', orgL4, paymentPmis: { contract } }) as any

  it('totalAll=在建主域全量, noStageCount=空节点数', () => {
    const projects = [P('A'), P('B'), P('C')]
    const paymentNodes = { A: [{ planDate: '2026-01-01', expectedPayment: 1, unpaidAmount: 0, status: '待回款' }], B: [], C: [] } as any
    const s = payDashSummary([], projects, OPTS, {}, paymentNodes, '', '')
    expect(s.totalAll).toBe(3)
    expect(s.noStageCount).toBe(2)  // B、C 空节点
  })

  it('noStageProjects 只列空节点项目 + 合同额转万', () => {
    const projects = [P('A'), P('B'), P('C')]
    const paymentNodes = { A: [{ planDate: '2026-01-01', expectedPayment: 1, unpaidAmount: 0, status: '待回款' }], B: [], C: [] } as any
    const rows = noStageProjects(projects, paymentNodes, OPTS)
    expect(rows.map((r) => r.projectId)).toEqual(['B', 'C'])
    expect(rows[0]).toMatchObject({ projectId: 'B', projectName: 'B名', projectManager: '张', orgL4: 'X', contractWan: 100 })
  })
})

describe('除零回退 null', () => {
  it('无合同的服务组 achievementRate 为 null', () => {
    const projects = [{ projectId: 'P1', orgL4: 'A组', paymentPmis: { contract: 0 } }] as any
    const paymentRecords = { P1: { records: [{ date: '2026-05-01', amount: 100000 }] } } as any
    const r = payOrgRanking(projects, {}, paymentRecords, '', '', 'achievementRate')
    expect(r[0].achievementRate).toBeNull()
  })
  it('payDashSummary 无合同时 rate 为 null', () => {
    const projects = [{ projectId: 'P1', paymentPmis: { contract: 0 } }] as any
    const s = payDashSummary([], projects, { viewMode: 'global', viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} } as any)
    expect(s.rate).toBeNull()
  })
})
