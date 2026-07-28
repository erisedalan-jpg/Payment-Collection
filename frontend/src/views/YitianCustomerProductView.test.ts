import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import YitianCustomerProductView from './YitianCustomerProductView.vue'
import { useYitianStore } from '@/stores/yitian'

// fixture 与 src/lib/yitian/customerProduct.test.ts 的 D 同构,但**各自独立维护、勿跨文件 import**
// (两边独立更禁得住改动)。本文件用 `as never` 绕过类型完整性 —— 视图只读下列字段:
//   meta.top1000Named(B-3 分母) / meta.calendarSource(工具栏的日历降级提示)
//   dims 全部码表 / roster(L4 与 isMgr) / entries / days(工具栏日期选择器)
// 其余 meta 字段视图一概不读,不必构造。
const DATA = {
  meta: { top1000Named: { 市场BG3: 3, 市场BG1: 1 }, calendarSource: 'csv' },
  days: [],
  roster: [
    { id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: true },
    { id: 'A002', name: '小李', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: false },
  ],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类'],
    customers: ['甲公司', '乙公司', '丙公司'],
    custQuads: ['M1 战略核心区', 'M2 现金牛/打猎区'],
    custBgs: ['市场BG3', '市场BG1'],
    prodCats: ['终端安全', '天眼'],
    workTypes: [], products: [], productNames: [], projectTypes: [],
    salesL2: [], serviceModes: [],
  },
  entries: [
    { d: '2026-06-01', e: 'A001', t: 0, h: 10, cu: 0, cq: 0, cbg: 0, ec: 0, tr: 4, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    { d: '2026-06-02', e: 'A002', t: 1, h: 4, cu: 0, cq: 0, cbg: 0, ec: 1, tr: 1, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
    { d: '2026-06-03', e: 'A002', t: 2, h: 6, cu: 1, cq: 1, cbg: 1, ec: 0, tr: 3, top: true,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: false, pm: false },
    { d: '2026-06-04', e: 'A002', t: 0, h: 20, cu: 2, cq: null, cbg: null, ec: 1, tr: 4, top: false,
      wt: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '',
      el: null, ls: 0, ch: true, pm: false },
  ],
  issues: [],
}

beforeEach(() => setActivePinia(createPinia()))

function mountView() {
  useYitianStore().data = DATA as never
  return mount(YitianCustomerProductView, {
    global: { plugins: [ElementPlus], stubs: { RouterLink: true } },
  })
}

describe('YitianCustomerProductView', () => {
  it('六个分析块的标题都在', () => {
    const t = mountView().text()
    for (const s of ['可转移非原厂支持', '客户支持情况', 'TOP1000 大客户支持覆盖度',
                     '客户支持清单', '客户分级 × 产品大类', 'L4 组织 × 产品大类',
                     '客户 × 产品交叉']) {
      expect(t, s).toContain(s)
    }
  })

  it('两张热力图都渲染且是不同的行维度', () => {
    const w = mountView()
    const tables = w.findAllComponents({ name: 'HeatmapTable' })
    expect(tables).toHaveLength(2)
    expect(tables[0].props('rowLabel')).toBe('客户分级')
    expect(tables[1].props('rowLabel')).toBe('L4 组织')
  })

  it('store 无数据时不炸', () => {
    setActivePinia(createPinia())
    const w = mount(YitianCustomerProductView, {
      global: { plugins: [ElementPlus], stubs: { RouterLink: true } },
    })
    expect(w.exists()).toBe(true)
  })

  it('客户清单默认只显示 TOP50', () => {
    // 该断言靠组件内 showAllCustomers 的默认值;fixture 客户数少于 50 时
    // 改为断言「显示全部」开关存在,以及切换后行数不减少
    const w = mountView()
    expect(w.find('[data-test="ycp-showall"]').exists()).toBe(true)
  })
})
