import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import YitianGovernanceView from './YitianGovernanceView.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { useYitianStore } from '@/stores/yitian'

// 与 src/lib/yitian/governance.test.ts 的 D 同构但**各自独立维护、勿跨文件 import**。
// 管理类那条同样刻意放在数组最前(与 governance.test.ts 一致):若聚合实现先过滤客户类
// 再按 issues[].i 取下标,下标会整体错位一位、渲染出的数值立刻不同。
// 用 `as never` 绕过类型完整性 —— 视图只读:meta.calendarSource(工具栏日历降级提示) /
// dims / roster / entries / issues / days(工具栏日期选择器)。其余 meta 字段视图一概不读。
const DATA = {
  meta: { top1000Named: {}, calendarSource: 'csv' },
  days: [],
  roster: [
    { id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: true },
    { id: 'A002', name: '小李', l2: '', l3: '', l31: '', l4: '二组', category: '正式', isMgr: false },
  ],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类'],
    workTypes: ['升级加固', '安装部署', '项目管理'],
    customers: ['甲公司'],
    custQuads: [], custBgs: [], prodCats: ['终端安全'],
    products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    // 0:管理类 100h —— 两块一律不得统计
    { d: '2026-06-05', e: 'A002', t: 3, h: 100, wt: 2, cu: null, ec: 0, tr: 0, ls: 0, pm: true,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    // 1:一组 项目类 10h 已校准 pm=true
    { d: '2026-06-01', e: 'A001', t: 0, h: 10, wt: 2, cu: 0, ec: 0, tr: 4, ls: 1, pm: true,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 1, iss: ['HINT_PRESALE_PRODUCT'], ct: '' },
    // 2:二组 项目类 20h 多义 pm=false 客户不可归属(tr=0) 工作类型三=升级加固
    { d: '2026-06-02', e: 'A002', t: 0, h: 20, wt: 0, cu: null, ec: 0, tr: 0, ls: 2, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    // 3:二组 售后类 5h 零命中 tr=0 工作类型三=安装部署
    { d: '2026-06-03', e: 'A002', t: 2, h: 5, wt: 1, cu: null, ec: 0, tr: 0, ls: 3, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    // 4:一组 售前类 5h 原始 pm=false
    { d: '2026-06-04', e: 'A001', t: 1, h: 5, wt: 1, cu: 0, ec: 0, tr: 4, ls: 0, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 1, iss: ['HINT_PRESALE_PRODUCT'], ct: '' },
  ],
  issues: [
    { i: 1, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['x'], snippet: '' },
    { i: 4, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['x'], snippet: '' },
  ],
}

beforeEach(() => setActivePinia(createPinia()))

function mountView() {
  useYitianStore().data = DATA as never
  return mount(YitianGovernanceView, {
    global: { plugins: [ElementPlus], stubs: { RouterLink: true } },
  })
}

/** MetricGrid 的 DOM:每张卡 .mg-card 内 .mg-k(标签) / .mg-v(主值) / .mg-sub(辅值)
 *  —— 与 YitianReadinessCard.test.ts 同款定位。整页 text() 里 toContain('2') 会被
 *  同页「共 2 条」「20」等碰瓷成恒真,故按卡精确取值。 */
function kpi(w: ReturnType<typeof mountView>, label: string) {
  const card = w.findAll('.mg-card').find((c) => c.find('.mg-k').text() === label)
  if (!card) throw new Error(`找不到指标卡:${label}`)
  return { v: card.find('.mg-v').text(), sub: card.find('.mg-sub').text() }
}

/** 取 data-test 容器内那张 DataTable。jsdom 下 el-table 不渲染单元格(实测 td 全空),
 *  故按仓库惯例断言 DataTable 的 props 而非表格 DOM;容器归属靠 DOM 包含关系判定,
 *  这样「表放错容器」也会被逮到。 */
function tableIn(w: ReturnType<typeof mountView>, test: string) {
  const box = w.find(`[data-test="${test}"]`).element
  const t = w.findAllComponents(DataTable).find((x) => box.contains(x.element))
  if (!t) throw new Error(`容器 ${test} 内没有 DataTable`)
  return t
}

describe('YitianGovernanceView', () => {
  it('两大块的标题都在', () => {
    const t = mountView().text()
    for (const s of ['异常指标监控', '售前服务类工时未关联产品', '客户不可归属',
                     '产品线校准覆盖率', '项目管理工时概况']) {
      expect(t, s).toContain(s)
    }
  })

  it('三个异常指标卡显示实际数值', () => {
    const w = mountView()
    // B-5① 命中 2 条(entries 1 的 10h + entries 4 的 5h,均属一组)
    expect(kpi(w, '售前服务类未关联产品').v).toBe('2')
    // B-5② tr=0 的客户类工时 20h + 5h = 25h / 2 条;管理类那条 tr=0 的 100h 不得混进来
    expect(kpi(w, '客户不可归属')).toEqual({ v: '25', sub: 'h · 2 条' })
    // B-5③ 覆盖率 = 已校准 1 / 待校准 3
    expect(kpi(w, '产品线校准覆盖率')).toEqual({ v: '33%', sub: '已校准 1 / 待校准 3' })
  })

  it('两张项目管理占比表各自拿到组织级/个人级数据', () => {
    const w = mountView()
    // 一组/老张:10+5=15h,其中 pm 10h;二组/小李:20+5=25h,pm 0(管理类 100h 不进分母)
    expect(tableIn(w, 'ygv-pm-l4').props('rows')).toEqual([
      { name: '一组', total: 15, pm: 10, share: 10 / 15 },
      { name: '二组', total: 25, pm: 0, share: 0 },
    ])
    expect(tableIn(w, 'ygv-pm-emp').props('rows')).toEqual([
      { name: '老张', total: 15, pm: 10, share: 10 / 15 },
      { name: '小李', total: 25, pm: 0, share: 0 },
    ])
  })

  it('占比列格式化:0 显 0%、null 显 "-"(两者不可混)', () => {
    const cols = tableIn(mountView(), 'ygv-pm-l4').props('columns') as DataColumn[]
    const f = cols.find((c) => c.key === 'share')?.formatter
    expect(f).toBeTypeOf('function')
    expect(f!(10 / 15, {})).toBe('67%')
    expect(f!(0, {})).toBe('0%')      // 真的 0%
    expect(f!(null, {})).toBe('-')    // 分母为 0
  })

  it('两张明细表的行按工时降序、且不含管理类工时', () => {
    const w = mountView()
    const tables = w.findAllComponents(DataTable)
    const hint = tables.find((t) => (t.props('columns') as DataColumn[])[0].key === 'l4')!
    expect(hint.props('rows')).toEqual([{ l4: '一组', count: 2, hours: 15 }])
    const unattr = tables.find((t) => (t.props('columns') as DataColumn[])[0].key === 'workType3')!
    expect(unattr.props('rows')).toEqual([
      { workType3: '升级加固', count: 1, hours: 20 },
      { workType3: '安装部署', count: 1, hours: 5 },
    ])
  })

  it('组织级与个人级两张表都在', () => {
    const w = mountView()
    expect(w.find('[data-test="ygv-pm-l4"]').exists()).toBe(true)
    expect(w.find('[data-test="ygv-pm-emp"]').exists()).toBe(true)
  })

  it('store 无数据时不炸', () => {
    setActivePinia(createPinia())
    const w = mount(YitianGovernanceView, {
      global: { plugins: [ElementPlus], stubs: { RouterLink: true } },
    })
    expect(w.exists()).toBe(true)
  })
})
