/** 跟进页页脚合同金额合计：按 projectId 去重后，对每个项目取一次 valueKey(万) 数值求和。
 *  - key/temp/payment-key：valueKey='contractWan'，一行一项目 → 去重为恒等。
 *  - risk：valueKey='项目金额'，一项目多条风险 → 每项目只计一次(用户钦定)。
 *  跳过非数值(null/undefined)；无 projectId 的行各自独立计入；空集=0。 */
export function sumDistinctContractWan(rows: Array<Record<string, unknown>>, valueKey: string): number {
  const seen = new Set<string>()
  let sum = 0
  for (const r of rows) {
    const id = String(r.projectId ?? '')
    if (id) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    const v = r[valueKey]
    if (typeof v === 'number') sum += v
  }
  return sum
}
