import type { YitianDay } from '@/types/yitian'

export type WeekMode = 'iso' | 'calc'

export interface WeekBucket {
  key: string
  workdays: number
  start: string
  end: string
}

/** [start, end] 闭区间过滤。日期是 'YYYY-MM-DD',字典序即时序。空区间 = 全时。 */
export function daysInRange(days: YitianDay[], start: string, end: string): YitianDay[] {
  if (!start || !end) return days
  return days.filter((d) => d.d >= start && d.d <= end)
}

/** 区间内工作日天数(基础工时 = 本值 × meta.hoursPerDay)。 */
export function workdayCount(days: YitianDay[], start: string, end: string): number {
  return daysInRange(days, start, end).filter((d) => d.workday).length
}

/** 双周口径:iso = ISO 自然周(周一~周日);calc = 倚天计算周(上周五~本周四)。 */
export function weekKeyOf(day: YitianDay, mode: WeekMode): string {
  return mode === 'calc' ? day.calcWeek : day.isoWeek
}

/** 区间内按周分桶(按起始日升序);每桶带工作日数,供趋势图 X 轴与周维度汇总。 */
export function weekBuckets(days: YitianDay[], start: string, end: string, mode: WeekMode): WeekBucket[] {
  const map = new Map<string, WeekBucket>()
  for (const d of daysInRange(days, start, end)) {
    const k = weekKeyOf(d, mode)
    const b = map.get(k)
    if (!b) {
      map.set(k, { key: k, workdays: d.workday ? 1 : 0, start: d.d, end: d.d })
    } else {
      if (d.workday) b.workdays += 1
      if (d.d < b.start) b.start = d.d
      if (d.d > b.end) b.end = d.d
    }
  }
  return [...map.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

/** 数据实际跨度。日期选择器必须钳制在此范围内——超出范围没有工作日标注,基础工时算不出来。 */
export function dataRange(days: YitianDay[]): { start: string; end: string } {
  if (!days.length) return { start: '', end: '' }
  return { start: days[0].d, end: days[days.length - 1].d }
}
