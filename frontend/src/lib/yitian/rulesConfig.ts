import * as XLSX from 'xlsx'

export const MULTI_SEP = '、'

export interface CheckKw { enabled: boolean; keywords: string[] }
export interface YitianRulesConfig {
  version: number
  checkedTypes: string[]
  checks: {
    summary: CheckKw
    progress: CheckKw
    next: CheckKw
    serviceMode: { enabled: boolean; effectiveDate: string }
    typeMismatch: { enabled: boolean; rules: Record<string, [string, string][]> }
    product: {
      enabled: boolean
      lineKeywords: { linePatterns: string[]; keywords: string[] }[]
      nameKeywords: { namePatterns: string[]; keywords: string[] }[]
      exclusiveKws: string[]
    }
    customer: { enabled: boolean; hintKeywords: string[] }
    presaleProductHint: { enabled: boolean; skipWorkTypes: string[] }
  }
}

const splitMulti = (s: unknown): string[] =>
  String(s ?? '').split(MULTI_SEP).map((x) => x.trim()).filter(Boolean)
const joinMulti = (a: string[]): string => a.join(MULTI_SEP)
const yn = (b: boolean): string => (b ? '是' : '否')
const isYes = (s: unknown): boolean => String(s ?? '').trim() === '是'

const ENABLE_ROWS: [string, keyof YitianRulesConfig['checks']][] = [
  ['启用-缺概述', 'summary'], ['启用-缺进展', 'progress'], ['启用-缺下一步', 'next'],
  ['启用-服务方式', 'serviceMode'], ['启用-类型一致性', 'typeMismatch'],
  ['启用-产品类别', 'product'], ['启用-客户名称', 'customer'], ['启用-售前提示', 'presaleProductHint'],
]

export function configToWorkbook(cfg: YitianRulesConfig): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const base: Record<string, string>[] = [
    { 项: '受检工时类型', 值: joinMulti(cfg.checkedTypes) },
    { 项: '服务方式生效日', 值: cfg.checks.serviceMode.effectiveDate },
    { 项: '客户提示词', 值: joinMulti(cfg.checks.customer.hintKeywords) },
    { 项: '售前跳过工时类型', 值: joinMulti(cfg.checks.presaleProductHint.skipWorkTypes) },
    ...ENABLE_ROWS.map(([label, key]) => ({ 项: label, 值: yn(cfg.checks[key].enabled) })),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(base), '开关与基础')

  const req = [
    { 检查项: '概述', 关键词: joinMulti(cfg.checks.summary.keywords) },
    { 检查项: '进展', 关键词: joinMulti(cfg.checks.progress.keywords) },
    { 检查项: '下一步', 关键词: joinMulti(cfg.checks.next.keywords) },
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(req), '必填三段')

  const tm: Record<string, string>[] = []
  for (const [wt, pairs] of Object.entries(cfg.checks.typeMismatch.rules))
    for (const [kw, target] of pairs) tm.push({ 工时类型: wt, 禁止词: kw, 应归属类型: target })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tm.length ? tm : [{ 工时类型: '', 禁止词: '', 应归属类型: '' }]), '类型一致性')

  const line = cfg.checks.product.lineKeywords.map((e) => ({ 产品线匹配词: joinMulti(e.linePatterns), 合法关键词: joinMulti(e.keywords) }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(line.length ? line : [{ 产品线匹配词: '', 合法关键词: '' }]), '产品线关键词')

  const name = cfg.checks.product.nameKeywords.map((e) => ({ 产品名称匹配词: joinMulti(e.namePatterns), 合法关键词: joinMulti(e.keywords) }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(name.length ? name : [{ 产品名称匹配词: '', 合法关键词: '' }]), '产品名称复核')

  const excl = cfg.checks.product.exclusiveKws.map((k) => ({ 专属词: k }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(excl.length ? excl : [{ 专属词: '' }]), '专属词')

  return wb
}

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name]
  return ws ? (XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]) : []
}

export function workbookToConfig(wb: XLSX.WorkBook): YitianRulesConfig {
  const baseRows = sheetRows(wb, '开关与基础')
  const baseMap = new Map<string, string>()
  for (const r of baseRows) baseMap.set(String(r['项'] ?? '').trim(), String(r['值'] ?? ''))
  const enabledOf = (label: string): boolean => isYes(baseMap.get(label))

  const reqRows = sheetRows(wb, '必填三段')
  const reqKw = (label: string): string[] => {
    const hit = reqRows.find((r) => String(r['检查项'] ?? '').trim() === label)
    return splitMulti(hit?.['关键词'])
  }

  const rules: Record<string, [string, string][]> = {}
  for (const r of sheetRows(wb, '类型一致性')) {
    const wt = String(r['工时类型'] ?? '').trim()
    const kw = String(r['禁止词'] ?? '').trim()
    const tgt = String(r['应归属类型'] ?? '').trim()
    if (!wt || !kw || !tgt) continue
    ;(rules[wt] ||= []).push([kw, tgt])
  }

  const lineKeywords = sheetRows(wb, '产品线关键词')
    .map((r) => ({ linePatterns: splitMulti(r['产品线匹配词']), keywords: splitMulti(r['合法关键词']) }))
    .filter((e) => e.linePatterns.length && e.keywords.length)
  const nameKeywords = sheetRows(wb, '产品名称复核')
    .map((r) => ({ namePatterns: splitMulti(r['产品名称匹配词']), keywords: splitMulti(r['合法关键词']) }))
    .filter((e) => e.namePatterns.length && e.keywords.length)
  const exclusiveKws = sheetRows(wb, '专属词').map((r) => String(r['专属词'] ?? '').trim()).filter(Boolean)

  return {
    version: 1,
    checkedTypes: splitMulti(baseMap.get('受检工时类型')),
    checks: {
      summary: { enabled: enabledOf('启用-缺概述'), keywords: reqKw('概述') },
      progress: { enabled: enabledOf('启用-缺进展'), keywords: reqKw('进展') },
      next: { enabled: enabledOf('启用-缺下一步'), keywords: reqKw('下一步') },
      serviceMode: { enabled: enabledOf('启用-服务方式'), effectiveDate: String(baseMap.get('服务方式生效日') ?? '').trim() },
      typeMismatch: { enabled: enabledOf('启用-类型一致性'), rules },
      product: { enabled: enabledOf('启用-产品类别'), lineKeywords, nameKeywords, exclusiveKws },
      customer: { enabled: enabledOf('启用-客户名称'), hintKeywords: splitMulti(baseMap.get('客户提示词')) },
      presaleProductHint: { enabled: enabledOf('启用-售前提示'), skipWorkTypes: splitMulti(baseMap.get('售前跳过工时类型')) },
    },
  }
}

export function downloadJson(cfg: YitianRulesConfig, filename = '倚天合规规则.json'): void {
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function downloadXlsx(cfg: YitianRulesConfig, filename = '倚天合规规则.xlsx'): void {
  XLSX.writeFile(configToWorkbook(cfg), filename)
}

export async function parseImportFile(file: File): Promise<YitianRulesConfig> {
  if (file.name.toLowerCase().endsWith('.json')) {
    return JSON.parse(await file.text()) as YitianRulesConfig
  }
  const buf = await file.arrayBuffer()
  return workbookToConfig(XLSX.read(buf, { type: 'array' }))
}
