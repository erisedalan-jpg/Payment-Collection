import { describe, it, expect, vi } from 'vitest'
import { buildSheets, estimateFileName, exportEstimate } from './exportEstimate'
import { calcBudget, emptyForm } from './calc'
import { calcSalesOrder } from './salesOrder'
import type { BudgetConfig, BudgetForm, DayCells } from './types'

vi.mock('@/lib/exportXlsx', () => ({ exportSheets: vi.fn(), exportRows: vi.fn() }))
import { exportSheets } from '@/lib/exportXlsx'

const CFG: BudgetConfig = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [
    { key: 'pm', code: 'JY-CPJF-OTHER-PM', name: 'PM一线' },
    { key: 'pm2ndc', code: 'JY-CPJF-OTHER-PM-2NDC-PISN', name: 'PM二线' },
    { key: 'eng1stc', code: 'JY-CPJF-AZ-OTHER-1STC-ENG', name: '工程师一线' },
    { key: 'eng2ndc', code: 'JY-CPJF-AZ-OTHER-2NDC-ENG', name: '工程师二线' },
  ],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: '这是防火墙自己的标准实施说明', nonstdDesc: '目录里的非标说明' }],
  pmPhases: [{ name: '项目启动阶段', content: '启动模板' },
             { name: '项目规划阶段', content: '规划模板' }],
  services: [{ name: '巡检服务', desc: '巡检说明' }],
}

const Z: DayCells = { tech1: 0, tech2: 0, out1: 0, out2: 0 }
const cells = (p: Partial<DayCells>): DayCells => ({ ...Z, ...p })

function fullForm(): BudgetForm {
  const f = emptyForm(CFG)
  f.basic = { quoteName: '某某项目', customerName: '某客户', salesName: '张三',
              location: '北京', projectAmount: 100, projectLevel: 'P2',
              customerLevel: 'TOP1000', signType: '直签', thirdParty: '否' }
  f.products = [{
    uid: 'u1', id: '1.1', name: '防火墙', isCustom: false,
    qty: 3, stdDays: 1.5, coefficient: 0.8,
    std: cells({ tech1: 2 }),
    nonStdDesc: '用户填的非标工作内容', nonStd: cells({ tech2: 1 }),
    customDesc: '', custom: Z,
  }, {
    uid: 'u2', id: 'other', name: '自定义产品X', isCustom: true,
    qty: 0, stdDays: 0, coefficient: 0, std: Z, nonStdDesc: '', nonStd: Z,
    customDesc: '用户填的自定义工作内容', custom: cells({ out1: 4 }),
  }]
  f.pmPhases[0].pm1 = 5
  f.services = [{ uid: 's1', name: '巡检服务', isOther: false,
                  content: '季度巡检', cells: cells({ tech1: 2 }) }]
  f.direct.allowanceDomDays = 3
  f.direct.localTransportBase = 100
  f.direct.localTransportTrip = 200
  f.ratioExplanation = ''
  f.crmText = '该项目评估后，\n1.预计项目经理5.0人天；'
  return f
}

function sheetsOf() {
  const f = fullForm()
  const r = calcBudget(f, CFG)
  return { f, r, sheets: buildSheets(f, CFG, r, calcSalesOrder(r, f.margin, CFG)) }
}

describe('buildSheets', () => {
  it('恰好 8 个 sheet,名称与顺序固定', () => {
    const { sheets } = sheetsOf()
    expect(sheets.map((s) => s.name)).toEqual([
      '项目基本信息', '成本比例', '产品实施', '项目经理',
      '其他服务', '直接成本', 'CRM审批建议', '销售下单建议',
    ])
  })

  it('基本信息 sheet 含 9 项信息与概算汇总', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[0].rows as { 字段: string; 内容: unknown }[]
    const get = (k: string) => rows.find((x) => x.字段 === k)?.内容
    expect(get('报价名称')).toBe('某某项目')
    expect(get('客户名称')).toBe('某客户')
    expect(get('项目金额（万元）')).toBe(100)
    expect(get('项目级别')).toBe('P2')
    expect(get('是否含第三方外采')).toBe('否')
    expect(get('总成本')).toBeDefined()
    expect(get('销售下单金额')).toBeDefined()
  })

  it('产品实施 sheet:标准段与非标段各出一行,类型不同', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[2].rows as Record<string, unknown>[]
    const types = rows.map((x) => x['类型'])
    expect(types).toEqual(['标准实施', '非标准实施', '自定义产品'])
  })

  it('产品实施 sheet:补齐 数量/单台标准人天/设备系数/合计参考人天 四列', () => {
    const { sheets } = sheetsOf()
    const std = (sheets[2].rows as Record<string, unknown>[])[0]
    expect(std['数量']).toBe(3)
    expect(std['单台标准人天']).toBe(1.5)
    expect(std['设备系数']).toBe(0.8)
    expect(std['合计参考人天']).toBe(3.6)          // 3 × 1.5 × 0.8
    expect(std['一类技服人天']).toBe(2)
  })

  it('产品实施 sheet:工作内容说明取真实内容,不是一句写死的通用文案', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[2].rows as Record<string, unknown>[]
    expect(rows[0]['工作内容说明']).toBe('这是防火墙自己的标准实施说明')   // 标准 → 目录 stdDesc
    expect(rows[1]['工作内容说明']).toBe('用户填的非标工作内容')           // 非标 → 用户填的
    expect(rows[2]['工作内容说明']).toBe('用户填的自定义工作内容')         // 自定义 → 用户填的
    // 三行的说明必须互不相同(原工具三行是同一句)
    const descs = rows.map((x) => x['工作内容说明'])
    expect(new Set(descs).size).toBe(3)
  })

  it('产品实施 sheet:人天全零的段不导出', () => {
    const f = emptyForm(CFG)
    f.basic.quoteName = 'x'
    f.products = [{ uid: 'u', id: '1.1', name: '防火墙', isCustom: false,
                    qty: 1, stdDays: 1.5, coefficient: 0.8,
                    std: cells({ tech1: 1 }), nonStdDesc: '', nonStd: Z,
                    customDesc: '', custom: Z }]
    const r = calcBudget(f, CFG)
    const rows = buildSheets(f, CFG, r, calcSalesOrder(r, f.margin, CFG))[2].rows
    expect(rows.length).toBe(1)                     // 非标段全零 → 不出行
  })

  it('成本比例 sheet 含比例/建议范围/状态,建议范围取自配置', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[1].rows as { 项目: string; 数值: unknown }[]
    const get = (k: string) => rows.find((x) => x.项目 === k)?.数值
    expect(get('建议范围')).toBe('3% - 15%')
    expect(String(get('状态'))).toMatch(/正常|偏高|偏低/)
  })

  it('项目经理 sheet:每个阶段一行,含四类人天与工作内容', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[3].rows as Record<string, unknown>[]
    expect(rows.length).toBe(2)                     // CFG 里两个阶段
    expect(rows[0]['阶段']).toBe('项目启动阶段')
    expect(rows[0]['PM(一类人天)']).toBe(5)
  })

  it('直接成本 sheet:11 行,含两个独立的交通类目', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[5].rows as { 项目: string }[]
    expect(rows.length).toBe(11)
    const names = rows.map((x) => x.项目)
    expect(names).toContain('本地交通（员工base地）')
    expect(names).toContain('当地交通（差旅期间）')
    expect(names).toContain('城际交通')
  })

  it('CRM审批建议 sheet 输出正文', () => {
    const { sheets } = sheetsOf()
    expect(String((sheets[6].rows[0] as Record<string, unknown>)['审批建议']))
      .toContain('该项目评估后')
  })

  it('销售下单建议 sheet:4 个物料行 + 1 个合计行', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[7].rows as Record<string, unknown>[]
    expect(rows.length).toBe(5)
    expect(rows[0]['物料编号']).toBe('JY-CPJF-OTHER-PM')
    expect(rows[4]['物料名称']).toBe('合计')
    const sum = rows.slice(0, 4).reduce((s, x) => s + Number(x['金额']), 0)
    expect(rows[4]['金额']).toBe(sum)
  })
})

describe('estimateFileName', () => {
  it('概算_{名称}_{YYYYMMDD}.xlsx —— 按本地日期,不用 toISOString(时区会退一天)', () => {
    expect(estimateFileName('某某项目', new Date(2026, 6, 13)))
      .toBe('概算_某某项目_20260713.xlsx')
  })
})

describe('exportEstimate', () => {
  it('调用 exportSheets 并传入 8 个 sheet', () => {
    const { f, r } = sheetsOf()
    exportEstimate(f, CFG, r, calcSalesOrder(r, f.margin, CFG), new Date(2026, 6, 13))
    expect(exportSheets).toHaveBeenCalledTimes(1)
    const [filename, sheets] = (exportSheets as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0] as [string, { name: string }[]]
    expect(filename).toBe('概算_某某项目_20260713.xlsx')
    expect(sheets.length).toBe(8)
  })
})
