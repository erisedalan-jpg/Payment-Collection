import { fmtYuan, pct } from './format'

/** 忠实移植 app.js isDateKey */
export function isDateKey(k: string): boolean {
  return /(?:Date|日期|时间)(?:$|_)/.test(k) || (/^(?:plan|actual|stage|expected|next|close)/.test(k) && /Date$/.test(k))
}

/** 忠实移植 app.js excelDate：Excel 序列号(40000~60000) → YYYY-MM-DD，否则 null */
export function excelDate(v: unknown): string | null {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{4,5}$/.test(v) ? Number(v) : null)
  if (n !== null && n > 40000 && n < 60000) {
    const d = new Date(Math.round((n - 25569) * 86400000))
    if (!isNaN(d.getTime())) {
      // 用 UTC getter 读:序列号换算出的是 UTC 零点,与进程时区无关(避免 UTC-偏移环境回退一天)
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0')
    }
  }
  return null
}

const AMOUNT_KEYS = new Set(['projectAmount', 'expectedPayment', 'actualPayment'])
const RATIO_KEYS = new Set(['planPaymentRatio', 'paymentRatio', 'actualPaymentRatio', 'projectCompletion'])
const BOOL_KEYS = new Set(['isPaymentRelated', 'isMilestoneAchieved', 'canAdvance'])

/** 忠实移植 app.js fmtCell 的取值格式化（返回纯字符串；徽章配色等展示样式不在此层）。 */
export function formatCellValue(value: unknown, key: string): string {
  if (value === null || value === undefined || value === '') return '-'
  const v = value
  if (isDateKey(key)) {
    const ed = excelDate(v)
    if (ed) return ed
    if (typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) return v.slice(0, 10)
  }
  if (typeof v === 'string' && /^\d{4,5}$/.test(v)) {
    const ed = excelDate(v)
    if (ed) return ed
  }
  if (AMOUNT_KEYS.has(key)) return fmtYuan(v as number)
  if (RATIO_KEYS.has(key)) return pct(v)
  if (BOOL_KEYS.has(key)) return v === true || v === 'true' || v === '是' ? '是' : '否'
  if (key === '纳管') return v === '否' ? '否' : v === '是' || v === true || v === 'true' ? '是' : '-'
  if (key === 'delayDays') return `${v}天`
  return String(v).replace(/[\r\n]+/g, ' ')
}
