import type { YitianData, YitianEntry } from '@/types/yitian'

/** 面向客户的三类工时。与后端 transferable 判定、V4.5.5 的 selectCpEntries 同一口径。 */
const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']

export interface EmpSplit {
  nonCustomer: number
  customer: number
  project: number
  presale: number
  postsale: number
}

/** 工号 → 五类工时拆分。
 *  **刻意不进 metrics.ts 的 EmpStat** —— 那里承载的是 V4.4.5 双基准饱和度口径,
 *  三期一贯禁改。本函数是纯展示派生,由视图 decorate 到行上(值必须并到行对象,
 *  否则排序/列筛选/导出三处都读不到)。
 *  区间/L4 过滤由调用方先做好(传进来的 entries 已是选定范围)。 */
export function empSplit(data: YitianData, entries: YitianEntry[]): Map<string, EmpSplit> {
  const out = new Map<string, EmpSplit>()
  for (const e of entries) {
    const t = e.t === null || e.t === undefined ? '' : (data.dims.types[e.t] ?? '')
    let s = out.get(e.e)
    if (!s) {
      s = { nonCustomer: 0, customer: 0, project: 0, presale: 0, postsale: 0 }
      out.set(e.e, s)
    }
    const i = CUSTOMER_TYPES.indexOf(t)
    if (i < 0) { s.nonCustomer += e.h; continue }
    s.customer += e.h
    if (i === 0) s.project += e.h
    else if (i === 1) s.presale += e.h
    else s.postsale += e.h
  }
  return out
}
