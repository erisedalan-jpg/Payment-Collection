import type { RiskReason } from './riskReasons'

export interface RiskClassEntry {
  category: string
  tone: 'warn' | 'danger' | 'mut'
  count: number
  projects: { projectId: string; projectName: string; detail: string }[]
}

// 输入行类型（与 ProjectRow 兼容，不直接引入 ProjectRow 避免循环）
interface InputRow {
  projectId: string
  projectName: string
  health: string
  isAnomalous: boolean
  riskReasons: RiskReason[]
}

/** 6类固定顺序及其 tone */
const CATEGORIES: { category: string; tone: RiskClassEntry['tone'] }[] = [
  { category: '回款延期', tone: 'warn' },
  { category: '里程碑滞后', tone: 'warn' },
  { category: '成本超支', tone: 'danger' },
  { category: '风险未闭环', tone: 'danger' },
  { category: '数据异常', tone: 'mut' },
  { category: '健康度低', tone: 'danger' },
]

/** 健康度低的命中条件 */
const LOW_HEALTH_VALUES = new Set(['关注', '风险'])

/**
 * 将项目列表按 6 类风险分类汇总。
 * - 前 5 类（回款延期/里程碑滞后/成本超支/风险未闭环/数据异常）从 row.riskReasons 中匹配。
 * - 健康度低：health ∈ {'关注','风险'} 时命中，detail 固定为 "健康度评级: " + health。
 * - 各类互不排斥，一个项目可同时计入多类。
 * - 始终返回长度为 6 的数组，顺序固定。
 */
export function classifyProjects(projects: InputRow[]): RiskClassEntry[] {
  // 初始化 6 类空桶
  const buckets: Map<string, RiskClassEntry> = new Map(
    CATEGORIES.map(({ category, tone }) => [
      category,
      { category, tone, count: 0, projects: [] },
    ]),
  )

  for (const row of projects) {
    const { projectId, projectName, health, riskReasons } = row

    // 前 5 类：从 riskReasons 匹配；总/交付成本超支 remap 回「成本超支」桶（首页不拆桶）
    const COST_SPLIT = new Set(['总成本超支', '交付成本超支'])
    for (const rr of riskReasons) {
      const cat = COST_SPLIT.has(rr.category) ? '成本超支' : rr.category
      const bucket = buckets.get(cat)
      if (bucket) {
        bucket.projects.push({ projectId, projectName, detail: rr.detail })
      }
    }

    // 健康度低
    if (LOW_HEALTH_VALUES.has(health)) {
      const bucket = buckets.get('健康度低')!
      bucket.projects.push({ projectId, projectName, detail: `健康度评级: ${health}` })
    }
  }

  // 同步 count
  for (const entry of buckets.values()) {
    entry.count = entry.projects.length
  }

  // 按固定顺序返回
  return CATEGORIES.map(({ category }) => buckets.get(category)!)
}
