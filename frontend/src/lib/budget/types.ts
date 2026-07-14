// 概算工具的全部类型。本域不进 schema.py(不产出 analysis_data.json),
// 所以这里是前端唯一类型来源,不要跑 npm run gen:types。

// —— 配置(后端 budget_config.py 的镜像) ——
export interface CityRate { pm: number; tech: number; out: number }
export interface BudgetRates { city1: CityRate; city2: CityRate }

export type MaterialKey = 'pm' | 'pm2ndc' | 'eng1stc' | 'eng2ndc'
export interface Material { key: MaterialKey; code: string; name: string }
export type SalesPrices = Record<MaterialKey, number>

/** 住宿的城市分类(一线/省会/其他/港澳)与人工成本的城市分类(一类/二类)是两套互不相干的
 *  口径,外包差旅又用回一类/二类。这是原工具的既定事实,不要合并。 */
export interface HotelRates {
  type1: number; capital: number; other: number; hk: number
  outType1: number; outType2: number
}
export interface Allowance { dom: number; intl: number }
export interface MarginOption { value: number; label: string }
export interface RatioThreshold { min: number; max: number }

export interface ProductDef {
  id: string; name: string
  coefficient: number; stdDays: number
  stdDesc: string; nonstdDesc: string
}
export interface PmPhaseDef { name: string; content: string }
export interface ServiceDef { name: string; desc: string; isOther?: boolean }

export interface BudgetConfig {
  version: number
  rates: BudgetRates
  salesPrices: SalesPrices
  materials: Material[]
  hotel: HotelRates
  allowance: Allowance
  fx: number
  margins: MarginOption[]
  ratio: RatioThreshold
  products: ProductDef[]
  pmPhases: PmPhaseDef[]
  services: ServiceDef[]
}

// —— 表单 ——
/** 四格人天:技服一类/二类、外包一类/二类。人天一律手填 —— 系数只给参考值。 */
export interface DayCells { tech1: number; tech2: number; out1: number; out2: number }

export interface ProductRow {
  uid: string                 // 前端唯一键(列表渲染/删除用)
  id: string                  // 目录 id;自定义产品固定为 'other'
  name: string                // 自定义产品由用户填
  isCustom: boolean
  // 标准实施(仅非自定义)
  qty: number
  stdDays: number
  coefficient: number
  std: DayCells
  // 非标实施(仅非自定义)
  nonStdDesc: string
  nonStd: DayCells
  // 自定义产品(仅自定义)
  customDesc: string
  custom: DayCells
}

export interface PmPhaseRow {
  name: string
  pm1: number; pm2: number       // 项目经理人天:一类/二类
  tech1: number; tech2: number   // 技术服务人天:一类/二类
  note: string                   // 工作内容
}

export interface ServiceRow {
  uid: string
  name: string
  isOther: boolean
  content: string
  cells: DayCells
}

export interface DirectCostForm {
  allowanceDomDays: number      // 差补(境内)天数
  allowanceIntlDays: number     // 差补(境外)天数
  hotelType1: number            // 住宿:一线城市 晚数
  hotelCapital: number          // 住宿:省会城市 晚数
  hotelOther: number            // 住宿:其他城市 晚数
  hotelHk: number               // 住宿:港澳 晚数
  hotelOutType1: number         // 外包差旅:一类城市 晚数
  hotelOutType2: number         // 外包差旅:二类城市 晚数
  localTransportBase: number    // 本地交通(员工 base 地) —— 员工常驻地交通费
  localTransportTrip: number    // 当地交通(差旅期间) —— 差旅期间在目的地的交通费
  interCityTransport: number    // 城际交通
}

export interface BasicInfo {
  quoteName: string
  customerName: string
  salesName: string
  location: string              // 纯记录:与"一类/二类城市"无任何联动
  projectAmount: number | null  // 万元;成本比例的分母
  projectLevel: string          // P1 | P2 | P3 | P4
  customerLevel: string         // TOP1000 | 指名客户 | 非指名客户
  signType: string              // 直签 | 渠道 | 项目合作
  thirdParty: string            // 否 | 是
}

export interface BudgetForm {
  basic: BasicInfo
  products: ProductRow[]
  pmPhases: PmPhaseRow[]
  services: ServiceRow[]
  direct: DirectCostForm
  margin: number                // 毛利率:0.13 | 0.06
  ratioExplanation: string      // 成本比例异常说明(三态非 normal 时必填)
  crmText: string
  crmUserEdited: boolean        // 用户手改过 → 停止自动覆盖
}

// —— 计算结果 ——
export type RatioStatus = 'low' | 'normal' | 'high' | 'na'

export interface CalcResult {
  // 人天
  pmDays1: number; pmDays2: number
  pmTechDays1: number; pmTechDays2: number
  prodTechDays1: number; prodTechDays2: number
  prodOutDays1: number; prodOutDays2: number
  svcTechDays1: number; svcTechDays2: number
  svcOutDays1: number; svcOutDays2: number
  // 人工成本
  pmCost: number; pmTechCost: number
  prodTechCost: number; prodOutCost: number
  svcTechCost: number; svcOutCost: number
  laborCost: number
  // 直接成本
  travelAllowance: number; hotelCost: number; hotelOutCost: number
  directCost: number
  // 汇总
  totalCost: number            // 未含税总成本 = laborCost + directCost
  salesAmount: number          // 销售下单金额(含税) = totalCost × (1 + margin)
  costRatio: number | null     // 百分数;项目金额<=0 或 总成本=0 → null
  ratioStatus: RatioStatus
}
