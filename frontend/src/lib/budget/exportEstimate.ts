import { exportSheets } from '@/lib/exportXlsx'
import { productTotalDays } from './calc'
import { ratioStatusText } from './status'
import type { SalesOrder } from './salesOrder'
import type { BudgetConfig, BudgetForm, CalcResult, ProductRow } from './types'

type Row = Record<string, unknown>
export interface Sheet { name: string; rows: Row[] }

/** 毛利率的展示文案:优先用配置里那档的 label(如「13%（含产品）」),配置里找不到就按百分比拼。
 *  Excel 是给审批人看的那一份 —— 总成本(未含税)与销售下单金额(含税)之间差的就是这个数,
 *  不写出来审批人只能自己反除。 */
function marginText(margin: number, cfg: BudgetConfig): string {
  return cfg.margins.find((m) => m.value === margin)?.label
    ?? `${(margin * 100).toFixed(0)}%`
}

/** 文件名里的日期用**本地**年月日拼 —— toISOString() 会把本地零点退回前一天(UTC+8 下 off-by-one)。 */
export function estimateFileName(quoteName: string, today: Date): string {
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `概算_${quoteName}_${y}${m}${d}.xlsx`
}

const hasDays = (c: { tech1: number; tech2: number; out1: number; out2: number }): boolean =>
  (c.tech1 || 0) + (c.tech2 || 0) + (c.out1 || 0) + (c.out2 || 0) > 0

/** 产品实施 sheet 的行。
 *
 *  原工具丢了 数量/单台标准人天/设备系数/合计参考人天 四列(审批人看不到人天是怎么估出来的),
 *  且「说明」列对 19 个产品输出**同一句写死的通用文案**。这里两处都补上:
 *  标准实施取该产品目录里的 stdDesc,非标与自定义取用户填的内容。
 */
function productRows(form: BudgetForm, cfg: BudgetConfig): Row[] {
  const rows: Row[] = []
  const defOf = (p: ProductRow) => cfg.products.find((x) => x.id === p.id)
  for (const p of form.products) {
    if (p.isCustom) {
      if (!hasDays(p.custom)) continue
      rows.push({
        产品名称: p.name, 类型: '自定义产品',
        数量: '', 单台标准人天: '', 设备系数: '', 合计参考人天: '',
        一类技服人天: p.custom.tech1, 二类技服人天: p.custom.tech2,
        一类外包人天: p.custom.out1, 二类外包人天: p.custom.out2,
        工作内容说明: p.customDesc,
      })
      continue
    }
    if (hasDays(p.std)) {
      rows.push({
        产品名称: p.name, 类型: '标准实施',
        数量: p.qty, 单台标准人天: p.stdDays, 设备系数: p.coefficient,
        合计参考人天: productTotalDays(p.qty, p.stdDays, p.coefficient),
        一类技服人天: p.std.tech1, 二类技服人天: p.std.tech2,
        一类外包人天: p.std.out1, 二类外包人天: p.std.out2,
        工作内容说明: defOf(p)?.stdDesc ?? '',       // 该产品自己的标准实施说明
      })
    }
    if (hasDays(p.nonStd)) {
      rows.push({
        产品名称: p.name, 类型: '非标准实施',
        数量: '', 单台标准人天: '', 设备系数: '', 合计参考人天: '',
        一类技服人天: p.nonStd.tech1, 二类技服人天: p.nonStd.tech2,
        一类外包人天: p.nonStd.out1, 二类外包人天: p.nonStd.out2,
        工作内容说明: p.nonStdDesc,                   // 用户填的
      })
    }
  }
  return rows
}

export function buildSheets(form: BudgetForm, cfg: BudgetConfig,
                            r: CalcResult, order: SalesOrder): Sheet[] {
  const b = form.basic

  const basicRows: Row[] = [
    { 字段: '报价名称', 内容: b.quoteName },
    { 字段: '客户名称', 内容: b.customerName },
    { 字段: '销售', 内容: b.salesName },
    { 字段: '项目所在地', 内容: b.location },
    { 字段: '项目金额（万元）', 内容: b.projectAmount ?? '' },
    { 字段: '项目级别', 内容: b.projectLevel },
    { 字段: '客户级别', 内容: b.customerLevel },
    { 字段: '签约类型', 内容: b.signType },
    { 字段: '是否含第三方外采', 内容: b.thirdParty },
    { 字段: '', 内容: '' },
    { 字段: '【概算汇总】', 内容: '' },
    { 字段: 'PM（一类人天）', 内容: r.pmDays1 },
    { 字段: 'PM（二类人天）', 内容: r.pmDays2 },
    { 字段: '技术服务（一类人天）', 内容: r.prodTechDays1 + r.pmTechDays1 + r.svcTechDays1 },
    { 字段: '技术服务（二类人天）', 内容: r.prodTechDays2 + r.pmTechDays2 + r.svcTechDays2 },
    { 字段: '外包服务（一类人天）', 内容: r.prodOutDays1 + r.svcOutDays1 },
    { 字段: '外包服务（二类人天）', 内容: r.prodOutDays2 + r.svcOutDays2 },
    { 字段: '直接成本', 内容: r.directCost },
    // 含税/未含税的限定词一个都不能丢:页面上写清了,Excel 恰恰是丢掉限定词的那一份,
    // 而它是给审批人看的 —— 误读的代价直接是钱。中间的毛利率也补上(两者相差的就是它)。
    { 字段: '总成本（未含税）', 内容: r.totalCost },
    { 字段: '毛利率', 内容: marginText(form.margin, cfg) },
    { 字段: '销售下单金额（含税）', 内容: r.salesAmount },
  ]

  const ratioRows: Row[] = [
    { 项目: '成本比例', 数值: r.costRatio === null ? '--' : `${r.costRatio.toFixed(2)}%` },
    { 项目: '建议范围', 数值: `${cfg.ratio.min}% - ${cfg.ratio.max}%` },
    { 项目: '状态', 数值: ratioStatusText(r.ratioStatus) },
  ]
  if (form.ratioExplanation.trim()) {
    ratioRows.push({ 项目: '异常说明', 数值: form.ratioExplanation })
  }

  const pmRows: Row[] = form.pmPhases.map((p) => ({
    阶段: p.name,
    'PM(一类人天)': p.pm1, 'PM(二类人天)': p.pm2,
    '技术服务(一类人天)': p.tech1, '技术服务(二类人天)': p.tech2,
    工作内容: p.note,
  }))

  const svcRows: Row[] = form.services.map((s) => ({
    服务名称: s.name, 工作内容: s.content,
    一类技服: s.cells.tech1, 二类技服: s.cells.tech2,
    一类外包: s.cells.out1, 二类外包: s.cells.out2,
  }))

  const d = form.direct
  const directRows: Row[] = [
    { 项目: '差补（境内）', 类型: '天数', 数值: d.allowanceDomDays },
    { 项目: '差补（境外）', 类型: '天数', 数值: d.allowanceIntlDays },
    { 项目: '住宿（一线城市）', 类型: '晚数', 数值: d.hotelType1 },
    { 项目: '住宿（省会城市）', 类型: '晚数', 数值: d.hotelCapital },
    { 项目: '住宿（其他城市）', 类型: '晚数', 数值: d.hotelOther },
    { 项目: '住宿（港澳）', 类型: '晚数', 数值: d.hotelHk },
    { 项目: '外包差旅（一类城市）', 类型: '晚数', 数值: d.hotelOutType1 },
    { 项目: '外包差旅（二类城市）', 类型: '晚数', 数值: d.hotelOutType2 },
    // 两个交通字段是两个类目:前者是员工常驻地交通费,后者属差旅费用。
    { 项目: '本地交通（员工base地）', 类型: '金额（元）', 数值: d.localTransportBase },
    { 项目: '当地交通（差旅期间）', 类型: '金额（元）', 数值: d.localTransportTrip },
    { 项目: '城际交通', 类型: '金额（元）', 数值: d.interCityTransport },
  ]

  const orderRows: Row[] = order.rows.map((x) => ({
    物料编号: x.code, 物料名称: x.name, 单价: x.price, 数量: x.qty, 金额: x.amount,
  }))
  orderRows.push({ 物料编号: '', 物料名称: '合计', 单价: '', 数量: '', 金额: order.grandTotal })

  return [
    { name: '项目基本信息', rows: basicRows },
    { name: '成本比例', rows: ratioRows },
    { name: '产品实施', rows: productRows(form, cfg) },
    { name: '项目经理', rows: pmRows },
    { name: '其他服务', rows: svcRows },
    { name: '直接成本', rows: directRows },
    { name: 'CRM审批建议', rows: [{ 审批建议: form.crmText }] },
    { name: '销售下单建议', rows: orderRows },
  ]
}

export function exportEstimate(form: BudgetForm, cfg: BudgetConfig, r: CalcResult,
                               order: SalesOrder, today: Date = new Date()): void {
  exportSheets(estimateFileName(form.basic.quoteName, today),
               buildSheets(form, cfg, r, order))
}
