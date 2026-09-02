import { describe, it, expect } from 'vitest'
import { computeKpis } from './overview'
import { buildPayBoardRows } from './paymentBoard'
import { projectPaymentRows } from './paymentPmis'
import type { Project } from '@/types/analysis'

// 回款完成率的分子只有一个合法来源:payment_records 流水净额(CLAUDE.md 全站统一口径)。
//
// ★ 2026-08-31 审查:这三处原本写着「无流水表时退化到 payment 上的 actualTotal」——
//   而那个字段是【节点已收】,与流水净额生产实测差 570 万(46.36% vs 47.56%)。
//   现已改名 nodeActualTotal,并拆掉降级分支。
//   CLAUDE.md 回款口径约定白纸黑字写着「例外清单当前为空,今后再要开例外必须在此处
//   登记并写明理由」,这三条降级就是三条【未登记的例外】。
//
// 拿掉之后,流水表缺失时分子为 0、比率显 0% —— 明显坏掉,有人会报。
// 而退化到节点口径是「悄悄给一个看起来合理的错数」,没人会发现。
// 两害相权:宁可明显坏,不要悄悄错。

const PAY_NODE_ONLY = {
  relatedNodeCount: 1,
  expectedTotal: 1000000,
  nodeActualTotal: 600000, // 节点已收 —— 绝不能被当成分子
  // ★ 旧键刻意保留:模拟【升级后未点更新数据】的真实场景(旧 analysis_data.json
  //   里 actualTotal 还在)。不放它,改名的副作用会让降级分支取到 undefined→0,
  //   于是这些用例在「降级分支还没拆掉」时也照样绿 —— 测了个寂寞。
  actualTotal: 600000,
  remainingTotal: 400000,
  paymentRatio: null,
  delayedCount: 0,
}

function proj(id: string): Project {
  return {
    projectId: id,
    projectName: id,
    projectManager: '张三',
    orgL4: 'A组',
    payment: { ...PAY_NODE_ONLY },
    paymentPmis: { contract: 1000000 },
  } as unknown as Project
}

const NODES = { P1: [{ planDate: '2026-01-01', expectedPayment: 1000000, unpaidAmount: 400000, status: '部分回款', receivedAmount: 600000 }] } as any

describe('回款分子口径:无流水表时不得退化为节点已收', () => {
  it('computeKpis:paymentRecords 缺失 → 分子 0,而不是节点已收 600000', () => {
    const k = computeKpis([proj('P1')], {}, undefined)
    // 退化成节点口径的话这里会是 0.6
    expect(k.paymentRatio).toBe(0)
  })

  it('computeKpis:有流水表 → 用流水净额', () => {
    const recs = { P1: { total: 800000, count: 1, records: [{ date: '2026-02-01', amount: 800000 }] } } as any
    const k = computeKpis([proj('P1')], {}, recs)
    expect(k.paymentRatio).toBe(0.8)
  })

  it('buildPayBoardRows:paymentRecords 缺失 → actualAll 0', () => {
    const rows = buildPayBoardRows([proj('P1')], {}, NODES, undefined, '', '')
    expect(rows[0].actualAll).toBe(0)
  })

  it('buildPayBoardRows:有流水表 → 用流水净额', () => {
    const recs = { P1: { total: 800000, count: 1, records: [{ date: '2026-02-01', amount: 800000 }] } } as any
    const rows = buildPayBoardRows([proj('P1')], {}, NODES, recs, '', '')
    expect(rows[0].actualAll).toBe(800000)
  })

  it('projectPaymentRows:paymentRecords 缺失 → 行级 actualTotal 0', () => {
    const rows = projectPaymentRows([proj('P1')], {}, NODES, undefined, '', '')
    expect(rows[0].actualTotal).toBe(0)
    expect(rows[0].paymentRatio).toBe(0)
  })

  it('projectPaymentRows:有流水表 → 用流水净额', () => {
    const recs = { P1: { total: 800000, count: 1, records: [{ date: '2026-02-01', amount: 800000 }] } } as any
    const rows = projectPaymentRows([proj('P1')], {}, NODES, recs, '', '')
    expect(rows[0].actualTotal).toBe(800000)
  })

  it('★ 夹具自证:节点已收与流水净额【确实不同】,否则上面全是空断言', () => {
    // 这条守的是夹具本身。若 nodeActualTotal 恰好等于流水金额,
    // 前面每一条断言都会在两种口径下同时成立 —— 测了个寂寞(本仓栽过多次的假绿形态)。
    expect(PAY_NODE_ONLY.nodeActualTotal).toBe(600000)
    expect(PAY_NODE_ONLY.actualTotal).toBe(600000)  // 旧键也在,降级分支若还活着会取到它
    expect(PAY_NODE_ONLY.nodeActualTotal).not.toBe(800000)
  })
})
