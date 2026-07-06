import { describe, it, expect } from 'vitest'
import { costStatusOf, buildCostRows, costKpis, costL4Dist, costL4Summary, deliveryStatusOf } from './costAnalysis'

describe('costStatusOf(riskReasons 口径:totalOverspend + overspendAmount)', () => {
  it('未超支=非总成本超支;超支按 overspendAmount 是否 > 5000 分档', () => {
    expect(costStatusOf(false, 999999)).toBe('未超支')     // 非总成本超支 → 未超支(不看金额)
    expect(costStatusOf(true, 5000.01)).toBe('超支大于5k')
    expect(costStatusOf(true, 5000)).toBe('超支不足5k')     // =5000 归不足5k(排他)
    expect(costStatusOf(true, 0)).toBe('超支不足5k')        // flag 型超支(overspendAmount≤0)→ 不足5k
    expect(costStatusOf(true, -3000)).toBe('超支不足5k')
  })
})

const projects = [
  { projectId: 'WS1', projectName: '甲', projectManager: '张', orgL4: 'D1', orgL3_1: 'L31', overspendAmount: 8000 },
  { projectId: 'XS9', projectName: 'XS项目', projectManager: '李', orgL4: 'D2', orgL3_1: '', overspendAmount: 8000 },
] as any
const pmis = {
  WS1: { status: { 项目类型: '正常实施类' }, team: { L3部门: '交付一部' }, cost: { 总预算: 1000, 核算: 1200, 剩余预算: -6000 } },
  XS9: { status: { 项目类型: '正常实施类' }, team: { L3部门: '交付二部' }, cost: { 剩余预算: -8000 } },
} as any

describe('buildCostRows', () => {
  it('字段映射 + 成本状态走 riskReasons(不再对 XS 强制未超支)', () => {
    const rows = buildCostRows(projects, pmis)
    const a = rows.find((r) => r.projectId === 'WS1')!
    expect(a).toMatchObject({ projectName: '甲', projectType: '正常实施类', orgL3: '交付一部', orgL3_1: 'L31', orgL4: 'D1', manager: '张', status: '超支大于5k', totalBudget: 1000, actualCost: 1200, remaining: -6000 })
    const x = rows.find((r) => r.projectId === 'XS9')!
    expect(x.status).toBe('超支大于5k') // XS 不再强制未超支:overspendAmount 8000 → 超支大于5k
  })
  it('交付剩余字段映射(缺类别/无 deliveryCosts → 0)', () => {
    const projects2 = [
      { projectId: 'W1', projectName: 'a', projectManager: '', orgL4: 'D1', orgL3_1: '', paymentPmis: { contract: 500 },
        deliveryCosts: [{ 类别: '交付部门人工成本', 剩余预算: 30 }, { 类别: '交付外包服务成本', 剩余预算: 70 }] },
      { projectId: 'W2', projectName: 'b', projectManager: '', orgL4: 'D1', orgL3_1: '', paymentPmis: { contract: 200 } },
    ] as any
    const pmis2 = { W1: { cost: { 剩余预算: 5 } }, W2: { cost: { 剩余预算: 9 } } } as any
    const rows = buildCostRows(projects2, pmis2)
    expect(rows[0]).toMatchObject({ amount: 500, remaining: 5, deliveryDeptRemaining: 30, deliveryOutsourceRemaining: 70 })
    expect(rows[1]).toMatchObject({ amount: 200, deliveryDeptRemaining: 0, deliveryOutsourceRemaining: 0 })
  })
})

function cr(o: Partial<any> = {}): any {
  return { projectId: 'W', projectName: 'x', projectType: '', orgL3: '', orgL3_1: '', orgL4: 'D1', manager: '', amount: 0, status: '未超支', totalBudget: 0, actualCost: 0, remaining: 0, deliveryDeptRemaining: 0, deliveryOutsourceRemaining: 0, ...o }
}

describe('costKpis 五值(不剔任何行)', () => {
  const mk = (o: Partial<any>) => ({ totalOverspend: false, deliveryOverspend: false, overspendAmount: 0, ...o })
  it('total=全部行;未超支=两维度皆否;总超支/大于5000/交付超支', () => {
    const rows = [
      mk({}),                                             // 未超支
      mk({ totalOverspend: true, overspendAmount: 8000 }),// 总超支 + 大于5000
      mk({ totalOverspend: true, overspendAmount: 3000 }),// 总超支但不大于5000
      mk({ deliveryOverspend: true }),                    // 交付超支
      mk({ totalOverspend: true, deliveryOverspend: true, overspendAmount: 9000 }), // 两者
      mk({}),                                             // 未超支
    ] as any
    const k = costKpis(rows)
    expect(k.total).toBe(6)
    expect(k.notOverspent).toBe(2)       // 两个空行
    expect(k.totalOverspend).toBe(3)     // 三行 totalOverspend
    expect(k.totalOverspendOver5k).toBe(2) // 8000、9000
    expect(k.deliveryOverspend).toBe(2)  // 两行 deliveryOverspend
  })
})

describe('costL4Dist / costL4Summary(不再剔 XS,XS 交由整页标签排除)', () => {
  const rows = [
    cr({ orgL4: 'B', status: '未超支' }),
    cr({ orgL4: 'B', status: '超支不足5k' }),
    cr({ orgL4: 'A', status: '超支大于5k' }),
    cr({ orgL4: 'A', status: '超支大于5k' }),
    cr({ projectId: 'XS1', orgL4: 'A', status: '超支大于5k' }), // XS 前缀不再被跳过,照常计入
  ]
  it('L4 分布按 orgL4 升序、两档(含 XS 行)', () => {
    expect(costL4Dist(rows)).toEqual([
      { orgL4: 'A', under5k: 0, over5k: 3 },  // 含 XS1
      { orgL4: 'B', under5k: 1, over5k: 0 },
    ])
  })
  it('L4 汇总含占比(大于5k/总数,含 XS 行)', () => {
    const s = costL4Summary(rows)
    expect(s.find((x) => x.orgL4 === 'A')).toMatchObject({ total: 3, over5k: 3, over5kRatio: 100 })
    expect(s.find((x) => x.orgL4 === 'B')).toMatchObject({ total: 2, normal: 1, under5k: 1, over5k: 0, over5kRatio: 0 })
  })
  it('L4 汇总四金额列求和(含 XS 行)', () => {
    const rows = [
      cr({ orgL4: 'A', amount: 1000, remaining: 100, deliveryDeptRemaining: 10, deliveryOutsourceRemaining: 20 }),
      cr({ orgL4: 'A', amount: 2000, remaining: -50, deliveryDeptRemaining: 5, deliveryOutsourceRemaining: 0 }),
      cr({ projectId: 'XS2', orgL4: 'A', amount: 9999, remaining: 0 }),
    ]
    const a = costL4Summary(rows).find((x) => x.orgL4 === 'A')!
    expect(a).toMatchObject({ contractTotal: 12999, remainingTotal: 50, deliveryDeptRemaining: 15, deliveryOutsourceRemaining: 20 })
  })
})

describe('deliveryStatusOf', () => {
  it('部门≥0 且 外包≥0 → 未超支(含 =0 边界)', () => {
    expect(deliveryStatusOf(100, 50)).toBe('未超支')
    expect(deliveryStatusOf(0, 0)).toBe('未超支')
    expect(deliveryStatusOf(0, 10)).toBe('未超支')
  })
  it('部门<0 且 外包≥0 → 交付预算超支', () => {
    expect(deliveryStatusOf(-1, 50)).toBe('交付预算超支')
    expect(deliveryStatusOf(-1, 0)).toBe('交付预算超支')
  })
  it('部门≥0 且 外包<0 → 交付外包超支', () => {
    expect(deliveryStatusOf(50, -1)).toBe('交付外包超支')
    expect(deliveryStatusOf(0, -1)).toBe('交付外包超支')
  })
  it('部门<0 且 外包<0 → 原厂外包均超支', () => {
    expect(deliveryStatusOf(-1, -1)).toBe('原厂外包均超支')
  })
})

describe('buildCostRows 售前预算回退原项目 + 超支布尔', () => {
  it('售前项目三列取原项目:总预算=原总预算、已核算=原核算+售前自身核算、剩余=总-已', () => {
    const projects = [
      { projectId: 'SF1', projectName: '售前甲', isPresale: true, relatedClosedId: 'O1', orgL4: 'D1',
        deliveryCosts: [{ 类别: '交付部门人工成本', 剩余预算: 100 }, { 类别: '交付外包服务成本', 剩余预算: -5 }] },
    ] as any
    const pmis = {
      SF1: { cost: { 核算: 100 }, status: {}, team: {} },
      O1: { cost: { 总预算: 1000, 核算: 600 }, status: {}, team: {} },
    } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalBudget).toBe(1000)
    expect(r.actualCost).toBe(700)   // 原核算600 + 售前核算100
    expect(r.remaining).toBe(300)    // 1000 - 700
    expect(r.deliveryStatus).toBe('交付外包超支') // 部门100≥0, 外包-5<0
  })
  it('售前超支布尔来自售前自身 pmis,不泄漏原项目(Q4 钦定:预算走原项目、判定走自身)', () => {
    const projects = [{ projectId: 'SF3', isPresale: true, relatedClosedId: 'O2', orgL4: 'D1', deliveryCosts: [] }] as any
    // 原项目 O2 有 交付超支/项目超支 flag,售前 SF3 自身无 → 售前判定必须不受 O2 影响
    const pmis = {
      SF3: { cost: { 核算: 0 }, status: {}, team: {} },
      O2: { cost: { 总预算: 1000, 核算: 900, 交付超支: true, 项目超支: true }, status: {}, team: {} },
    } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.deliveryOverspend).toBe(false) // O2 的交付超支不泄漏到售前
    expect(r.totalOverspend).toBe(false)    // O2 的项目超支不泄漏到售前
    expect(r.totalBudget).toBe(1000)        // 但预算三列仍取原项目(证明两者分离)
  })
  it('非售前项目三列读自身 cost(不变)', () => {
    const projects = [{ projectId: 'WS1', orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { WS1: { cost: { 总预算: 200, 核算: 50, 剩余预算: 150 }, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalBudget).toBe(200)
    expect(r.actualCost).toBe(50)
    expect(r.remaining).toBe(150)
  })
  it('售前无 relatedClosedId → 原项目按 0:总预算 0、已核算=售前自身核算、剩余=−自身核算(可为负)', () => {
    const projects = [{ projectId: 'SF2', isPresale: true, orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { SF2: { cost: { 核算: 50 }, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalBudget).toBe(0)      // 原项目缺 → 0(不再读自身总预算)
    expect(r.actualCost).toBe(50)      // 原核算 0 + 售前自身核算 50
    expect(r.remaining).toBe(-50)      // 0 − 50(理论值为负,忠实"售前成本挂原项目")
  })
  it('售前超支(overspendAmount>0)无原项目 → 剩余=−超支额(负)、已核算=超支额(非0)、成本状态=超支', () => {
    // 实测线上:37 个售前超支只在 overspendAmount(实际成本−原剩余预算),PMIS cost 全空、原项目也缺。
    const projects = [{ projectId: 'WSGF-SF-X', isPresale: true, orgL4: 'D1', overspendAmount: 894277, deliveryCosts: [] }] as any
    const pmis = { 'WSGF-SF-X': { cost: {}, status: {}, team: {} } } as any // 无 relatedClosedId、PMIS 成本空
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalOverspend).toBe(true)    // 卡口径:overspendAmount>0
    expect(r.status).toBe('超支大于5k')     // 成本状态与卡一致
    expect(r.totalBudget).toBe(0)          // 原项目缺 → 0
    expect(r.remaining).toBe(-894277)      // 剩余=−超支额(负),消除"剩余≥0但超支"
    expect(r.actualCost).toBe(894277)      // 已核算=总预算0+超支额(含现项目实际成本,超支必非0)
  })
  it('售前超支且有原项目 → 剩余=−超支额、已核算=原总预算+超支额', () => {
    const projects = [{ projectId: 'SF-O', isPresale: true, relatedClosedId: 'ORG', orgL4: 'D1', overspendAmount: 2839986, deliveryCosts: [] }] as any
    const pmis = { 'SF-O': { cost: {}, status: {}, team: {} }, ORG: { cost: { 总预算: 4147176, 核算: 3611064 }, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalBudget).toBe(4147176)
    expect(r.remaining).toBe(-2839986)              // 旧口径为 +536111(原总−原核算);现改 −超支额
    expect(r.actualCost).toBe(4147176 + 2839986)    // 总预算 + 超支额(含现项目实际成本)
  })
  it('总成本超支布尔与 overspendAmount(overspendAmount>0)', () => {
    const projects = [{ projectId: 'WS2', orgL4: 'D1', overspendAmount: 8000, deliveryCosts: [] }] as any
    const pmis = { WS2: { cost: {}, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalOverspend).toBe(true)
    expect(r.overspendAmount).toBe(8000)
    expect(r.deliveryOverspend).toBe(false)
  })
  it('交付成本超支布尔(cost.交付超支 flag)', () => {
    const projects = [{ projectId: 'WS3', orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { WS3: { cost: { 交付超支: true }, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.deliveryOverspend).toBe(true)
    expect(r.totalOverspend).toBe(false)
  })
  it('异常项目(orgL4 空)两超支均否(riskReasons 短路数据异常)', () => {
    const projects = [{ projectId: 'WS4', orgL4: '', overspendAmount: 9000, deliveryCosts: [] }] as any
    const pmis = { WS4: { cost: { 交付超支: true }, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.totalOverspend).toBe(false)
    expect(r.deliveryOverspend).toBe(false)
  })
})

describe('buildCostRows — 风险派生列', () => {
  it('riskLevel/openRisks/riskMajorCats(去重去空,含已关闭)', () => {
    const projects = [{ projectId: 'WS5', orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { WS5: { cost: {}, status: {}, team: {},
      risk: { 最高等级: '高', 未关闭风险数: 2 },
      riskRecords: [{ 风险大类: '进度' }, { 风险大类: '成本' }, { 风险大类: '进度' }, { 风险大类: '' }] } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.riskLevel).toBe('高')
    expect(r.openRisks).toBe(2)
    expect(r.riskMajorCats).toEqual(['进度', '成本'])
  })
  it('无风险数据 → riskLevel=无 / openRisks=0 / riskMajorCats=[]', () => {
    const projects = [{ projectId: 'WS6', orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { WS6: { cost: {}, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.riskLevel).toBe('无')
    expect(r.openRisks).toBe(0)
    expect(r.riskMajorCats).toEqual([])
  })
})
