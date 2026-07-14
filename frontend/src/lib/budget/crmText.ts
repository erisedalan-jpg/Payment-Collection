import type { CalcResult } from './types'

const d1 = (v: number): string => (Number(v) || 0).toFixed(1)

/** 金额:千分位,最多 2 位小数(整数不补 .00)。 */
function money(v: number): string {
  const n = Number(v) || 0
  return '¥' + n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

/** CRM 审批建议。模板逐字沿用原工具 —— 这段文字要贴进 CRM 走审批,不能改口径也不能改措辞。
 *
 *  注意第 2 条的「原厂工程师」人天**含 PM 模块内的技术服务人天**(pmTechDays1/2)。 */
export function genCrmText(r: CalcResult): string {
  const pmDays = r.pmDays1 + r.pmDays2
  const prodTech = r.prodTechDays1 + r.pmTechDays1 + r.prodTechDays2 + r.pmTechDays2
  const prodOut = r.prodOutDays1 + r.prodOutDays2
  const svcTech = r.svcTechDays1 + r.svcTechDays2
  const svcOut = r.svcOutDays1 + r.svcOutDays2
  return [
    '该项目评估后，',
    `1.预计项目经理${d1(pmDays)}人天；`,
    `2.相关产品部署原厂工程师${d1(prodTech)}人天、外包${d1(prodOut)}人天；`,
    `3.其他服务原厂工程师${d1(svcTech)}人天、外包${d1(svcOut)}人天；`,
    `4.直接成本${money(r.directCost)}`,
  ].join('\n')
}
