// 倚天工时明细页下钻 query 编解码。独立于 drill.ts(其 scroll 是 analytics 专属),
// 但沿用同一"d 前缀键 + 空字段不输出 + 数组取首项"风格。
// 只设有干净入口的维度键(dL4/dEmp/dOnly)+ 预留周期(dStart/dEnd);不设 dCustomer/dIssue/dType 死键。

export interface DetailDrill {
  l4?: string
  emp?: string      // 员工工号(精确,避同名)
  start?: string
  end?: string
  only?: boolean    // 仅看异常
}

function firstStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v) return v
  if (Array.isArray(v)) return firstStr(v[0])
  return undefined
}

export function buildDetailDrill(d: DetailDrill): Record<string, string> {
  const q: Record<string, string> = {}
  if (d.l4) q.dL4 = d.l4
  if (d.emp) q.dEmp = d.emp
  if (d.start) q.dStart = d.start
  if (d.end) q.dEnd = d.end
  if (d.only) q.dOnly = '1'
  return q
}

export function parseDetailDrill(q: Record<string, any>): DetailDrill {
  const out: DetailDrill = {}
  const l4 = firstStr(q.dL4); if (l4) out.l4 = l4
  const emp = firstStr(q.dEmp); if (emp) out.emp = emp
  const start = firstStr(q.dStart); if (start) out.start = start
  const end = firstStr(q.dEnd); if (end) out.end = end
  if (firstStr(q.dOnly) === '1') out.only = true
  return out
}
