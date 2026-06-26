export type OppColType = 'text' | 'number' | 'date' | 'select' | 'auto' | 'derived'
export interface OppColumn {
  key: string; label: string; type: OppColType
  options?: string[]; width?: number; wrap?: boolean; sortable?: boolean; filterable?: boolean
}

export const L4_OPTIONS = ['小金融服务组','银行服务组','运营商服务组','京津服务组','河北服务组','广东二服务组','辽宁服务组','浙江服务组','上海一服务组','黑龙江服务组','吉林服务组']
const TOP1000_OPTIONS = ['TOP1000','非TOP1000','其他非指名']
const STATUS_OPTIONS = ['方案设计沟通','售前测试','意向沟通','招投标','商务谈判','需求确认','合同签约','赢单','丢单','进行中']
const FORECAST_OPTIONS = ['可参与','可承诺','可争取','赢单']
const YN = ['是','否']
const BID_OPTIONS = ['已中标','未中标','待定']
const OPPORTUNITY_LEVEL_OPTIONS = ['P1', 'P2', 'P3', 'P4']

export const OPP_COLUMNS: OppColumn[] = [
  { key: 'l4', label: 'L4组织', type: 'select', options: L4_OPTIONS, width: 130, filterable: true },
  { key: 'salesOwner', label: '销售负责人', type: 'text', width: 110, filterable: true },
  { key: 'customer', label: '客户名称', type: 'text', width: 180, wrap: true },
  { key: 'industry', label: '行业归属', type: 'text', width: 120, filterable: true },
  { key: 'top1000', label: '是否TOP1000客户', type: 'select', options: TOP1000_OPTIONS, width: 140, filterable: true },
  { key: 'status', label: '商机状态', type: 'select', options: STATUS_OPTIONS, width: 120, filterable: true },
  { key: 'forecast', label: '主观预测', type: 'select', options: FORECAST_OPTIONS, width: 110, filterable: true },
  { key: 'name', label: '商机名称/项目名称', type: 'text', width: 200, wrap: true },
  { key: 'amountWan', label: '预估金额(万元)', type: 'number', width: 120, sortable: true },
  { key: 'opportunityLevel', label: '商机级别', type: 'select', options: OPPORTUNITY_LEVEL_OPTIONS, width: 100, filterable: true },
  { key: 'expectedDate', label: '预估落单时间', type: 'date', width: 130, sortable: true },
  { key: 'majorPoc', label: '是否重大POC', type: 'select', options: YN, width: 120, filterable: true },
  { key: 'productCategory', label: '产品大类', type: 'text', width: 120, filterable: true },
  { key: 'mainProducts', label: '主要涉及产品', type: 'text', width: 160, wrap: true },
  { key: 'outsource', label: '是否含外包外采', type: 'select', options: YN, width: 120, filterable: true },
  { key: 'frOwner', label: 'FR负责人', type: 'text', width: 110, filterable: true },
  { key: 'frMatch', label: 'FR能力是否匹配', type: 'select', options: YN, width: 120, filterable: true },
  { key: 'deliveryMatch', label: '交付资源是否匹配', type: 'select', options: YN, width: 130, filterable: true },
  { key: 'crossRegion', label: '是否需要外区域支持', type: 'select', options: YN, width: 140, filterable: true },
  { key: 'keyOpp', label: '是否重点商机', type: 'select', options: YN, width: 120, filterable: true },
  { key: 'earlyIntervene', label: '是否提前介入', type: 'select', options: YN, width: 120, filterable: true },
  { key: 'remark', label: '当前进展/风险说明/情况备注', type: 'text', width: 240, wrap: true },
  { key: 'bidStatus', label: '实际中标状态', type: 'select', options: BID_OPTIONS, width: 120, filterable: true },
  { key: 'bidDate', label: '中标日期', type: 'date', width: 120, sortable: true },
  { key: 'firstReg', label: '首次登记日期', type: 'auto', width: 120, sortable: true },
  { key: 'lastUpdate', label: '最后一次更新日期', type: 'auto', width: 150, sortable: true },
  { key: 'recentUpdate', label: '是否近7天更新', type: 'derived', width: 120, filterable: true },
]

export const OPP_FIELDS = OPP_COLUMNS.filter((c) => !['auto', 'derived'].includes(c.type)).map((c) => c.key)

export const DEFAULT_VISIBLE = ['l4','salesOwner','customer','top1000','status','forecast','name','amountWan','opportunityLevel','expectedDate','majorPoc','bidStatus','lastUpdate','recentUpdate']
export const FILTERABLE = new Set(OPP_COLUMNS.filter((c) => c.filterable).map((c) => c.key))

/** lastUpdate 距今 ≤7 天→是;空/更早→否。比较按日期(取前 10 位)。 */
export function recentUpdateOf(lastUpdate: string, now: Date): '是' | '否' {
  const s = (lastUpdate || '').slice(0, 10)
  if (!s) return '否'
  const [y, m, d] = s.split('-').map(Number)
  if (!y) return '否'
  const lu = new Date(y, (m || 1) - 1, d || 1).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((today - lu) / 86400000)
  return days >= 0 && days <= 7 ? '是' : '否'
}
