/** V4.5.4 派生字段的展示标签。下标必须与后端 yitian_derive.py 的枚举严格一一对应。 */

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
