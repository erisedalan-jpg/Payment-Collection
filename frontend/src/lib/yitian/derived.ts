/** V4.5.4 派生字段的展示标签。下标必须与后端 yitian_derive.py 的枚举严格一一对应。 */
import type { YitianData, YitianEntry } from '@/types/yitian'

/** 可转移五档,下标 = entry.tr */
export const TRANSFER_LABELS = [
  '客户不可归属',
  '不可转移：M1/M2 战略客户',
  '不可转移：项目管理工时',
  '不可转移：非渠道可交付产品',
  '可转移非原厂',
]

/** 校准状态四档,下标 = entry.ls */
export const LINE_SRC_LABELS = ['原始', '已校准', '多义未校准', '无匹配']

export function transferLabel(tr: number): string {
  return TRANSFER_LABELS[tr] ?? ''
}

export function lineSrcLabel(ls: number): string {
  return LINE_SRC_LABELS[ls] ?? ''
}

/** 五档聚合的唯一实现。总览页那张卡与客户与产品分析页都调它 —— 同一口径两份实现必漂移。 */
export interface TransferBucket { label: string; hours: number; pct: number }

/** 五档只统计客户类工时,与后端 transferable 判定口径一致。 */
const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']

export function transferBuckets(data: YitianData, rows: YitianEntry[]): TransferBucket[] {
  const acc = [0, 0, 0, 0, 0]
  for (const e of rows) {
    const t = e.t === null || e.t === undefined ? '' : (data.dims.types[e.t] ?? '')
    if (!CUSTOMER_TYPES.includes(t)) continue
    acc[e.tr] = (acc[e.tr] ?? 0) + e.h
  }
  const tot = acc.reduce((a, b) => a + b, 0)
  return acc.map((h, i) => ({
    label: TRANSFER_LABELS[i],
    hours: h,
    pct: tot ? h / tot : 0,     // 分母为 0 → 0,不得产出 NaN(会渲染成空白)
  }))
}
