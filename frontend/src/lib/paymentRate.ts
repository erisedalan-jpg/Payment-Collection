/** 回款达成率的聚合口径 —— 全站唯一实现。
 *
 * 口径(CLAUDE.md「回款口径约定」)：达成率 = Σ流水净额 ÷ Σ合同总额。
 *
 * ★ 2026-09-01 目验发现的缺陷:各聚合点原本是
 *       分子 = Σ(全部项目的流水)
 *       分母 = Σ(contract ?? 0)
 *   两个总和【不是同一批项目】—— 有流水但没合同的项目进了分子、给分母记 0。
 *   生产实测:6 个售前项目、流水 136.68 万,把全域达成率从 47.56% 抬到 47.85%(+0.29pp)。
 *   这与当年 /insight 算出 107.57% 是同一个形状(分子计了、分母没计),只是这次偏差
 *   小到没人会怀疑 —— 更难被发现。
 *
 * ★ 修法(用户 2026-09-01 拍板):**合同记 0 的,分子也不计入**。
 *   于是分子分母恒为同一集合,页面上「已回款 ÷ 合同额」自己除一下就等于显示的完成率,
 *   不会出现「两个显示值除不出第三个显示值」那种让人怀疑数据的情形。
 *   被排除的项目不藏起来 —— 治理页单列一张表(dataQuality.paymentNoContract)。
 *
 * ★ 为什么做成一个函数而不是各处 filter:七个聚合点分散改必然漂移,
 *   而漂移的方向必然是「某一页忘了改、数字对不上别处」。本仓吃过这个亏。
 */

export interface RateAgg {
  /** 参与达成率计算的项目数(contract > 0 的那些) */
  ratedCount: number
  /** 被排除的项目数(contract <= 0 或缺失) */
  excludedCount: number
  contractSum: number
  actualSum: number
  /** Σ流水 ÷ Σ合同;无有效合同 → null(前端显 '-') */
  rate: number | null
}

/**
 * @param items       任意行/项目
 * @param contractOf  取合同总额(可为 null/undefined)
 * @param actualOf    取流水净额(全时口径,含负值红冲,不取绝对值)
 */
export function aggregateRate<T>(
  items: readonly T[],
  contractOf: (t: T) => number | null | undefined,
  actualOf: (t: T) => number | null | undefined,
): RateAgg {
  let contractSum = 0
  let actualSum = 0
  let ratedCount = 0
  let excludedCount = 0
  for (const it of items) {
    const c = Number(contractOf(it) ?? 0)
    if (!(c > 0)) { excludedCount++; continue }   // NaN 也落这里,不污染合计
    ratedCount++
    contractSum += c
    actualSum += Number(actualOf(it) ?? 0)
  }
  return {
    ratedCount,
    excludedCount,
    contractSum,
    actualSum,
    rate: contractSum > 0 ? actualSum / contractSum : null,
  }
}
