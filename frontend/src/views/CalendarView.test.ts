import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import CalendarView from './CalendarView.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useAuthStore } from '@/stores/auth'
import { ALL_PAGE_LINKS } from '@/nav'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  useFilterStore().setPreset('all')
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {},
    summary: {},
    rawNodes: [],
    displayColumns: {},
    followupRecords: {},
    projects: [
      { projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: 'A组', orgL3_1: '三部一组', paymentPmis: { contract: 1000000 } },
    ],
    projectPmis: {},
    paymentNodes: {
      P1: [
        { stage: '到货款', planDate: '2026-02-10', actualDate: '', payRatio: 0.5, actualRatio: 0, expectedPayment: 500000, receivedAmount: 0, unpaidAmount: 500000, status: '待回款' },
      ],
    },
  } as any
}

/** 存档按账号隔离(userScopedKey),持久化用例须先登录,存档键才是确定的 's:view_calendar'。 */
function login(account = 's') {
  useAuthStore().user = {
    account, displayName: account, isSuper: true, allowedPages: ['*'], allowedL4: [],
  } as any
}
const mountView = () => mount(CalendarView, { global: { plugins: [ElementPlus] } })

describe('CalendarView', () => {
  it('渲染标题/仪表卡/筛选条/网格', () => {
    seed()
    const w = mount(CalendarView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('回款日历')
    expect(w.text()).toContain('当月待回款(万)')
    expect(w.text()).toContain('7天内到期')
    expect(w.findComponent({ name: 'CalGrid' }).exists()).toBe(true)
    expect(w.text()).toContain('即将到期回款节点')
  })

  it('切到议程列表视图渲染 CalAgenda', async () => {
    seed()
    const w = mount(CalendarView, { global: { plugins: [ElementPlus] } })
    await w.get('[data-test="seg-agenda"]').trigger('click')
    expect(w.find('.cag').exists()).toBe(true)
    expect(w.find('.cal-grid-row').exists()).toBe(false)
  })

  it('点击年度热力条某月聚焦该月', async () => {
    seed()
    const w = mount(CalendarView, { global: { plugins: [ElementPlus] } })
    expect(w.find('.cyh').exists()).toBe(true)
    // 点击有数据的「热」格才会 emit(冷格 remaining<=0 无响应);seed 数据在 2 月(month 索引 1)。
    // 断言随点击的绝对月份,不依赖当前系统月(旧测试点冷格、实测默认当前月,跨月界会 flaky)。
    await w.findAll('.cyh-cell')[1].trigger('click')
    expect(w.findComponent({ name: 'CalGrid' }).props('month')).toBe(1)
  })

  it('渲染页头标题(与 nav.ts 的 label 逐字一致)', () => {
    seed()
    const w = mountView()
    // 与 nav.ts 比对而非各写各的字面量:否则会出现「tab 条叫回款日历、页头叫日历视图」
    expect(w.find('.ph-title').text()).toBe(ALL_PAGE_LINKS.find((l) => l.to === '/payment/calendar')!.label)
  })

  it('视图选择持久化:切议程列表 → 卸载 → 重新挂载后仍是议程列表', async () => {
    login()
    seed()
    const w1 = mountView()
    // 走真实交互路径(点视图选项卡)而非直接给 vm 赋值,避免赋值静默无效导致的假绿
    await w1.get('[data-test="seg-agenda"]').trigger('click')
    expect((w1.vm as any).view).toBe('agenda')
    await nextTick()                           // 等 watch 落盘
    expect(JSON.parse(localStorage.getItem('s:view_calendar')!)).toEqual({ view: 'agenda' })
    w1.unmount()

    const w2 = mountView()
    await flushPromises()
    expect((w2.vm as any).view).toBe('agenda')
    expect(w2.find('.cag').exists()).toBe(true)
  })

  it('V4.5.0 仪表五卡改用 AppCard(inset),.cd-card 只留 text-align', () => {
    seed()
    const w = mountView()
    const cards = w.findAll('.cd-card')
    expect(cards).toHaveLength(5)
    for (const c of cards) {
      // 本页 .cd-card 归 inset —— CostDetailView 有同名类但归 flat,变体不可按类名硬套
      expect(c.classes()).toContain('ac--inset')
      expect(c.classes()).not.toContain('ac--flat')
      expect(c.classes()).not.toContain('ac--default')
      expect(c.classes()).not.toContain('ac--raised')
    }
    const src = readFileSync(resolve(__dirname, 'CalendarView.vue'), 'utf-8')
    const cd = src.match(/^\.cd-card\s*\{([^}]*)\}/m)![1]
    for (const p of ['background', 'border', 'padding']) {
      expect(cd, `.cd-card 不应再自写 ${p}`).not.toContain(p)
    }
    expect(cd).toContain('text-align: center')   // AppCard 不接管的文本对齐必须留下
  })

  it('V4.5.1「即将到期回款节点」改用 SectionTitle(card 级),.cal-up-title 只剩底边距', () => {
    seed()
    const w = mountView()
    const t = w.find('.cal-up-title')
    expect(t.exists()).toBe(true)
    expect(t.element.tagName).toBe('H3')
    expect(t.classes()).toContain('st--card')          // 原值 --fs-4 → card
    expect(t.classes()).not.toContain('st--section')
    expect(t.text()).toBe('即将到期回款节点')
    // 复合选择器 .st.cal-up-title 是刻意的:否则与组件 .st { margin: 0 } 同特异性、靠打包顺序决胜负
    const rule = readFileSync(resolve(__dirname, 'CalendarView.vue'), 'utf-8')
      .match(/\.st\.cal-up-title\s*\{([^}]*)\}/)![1]
    for (const p of ['font-size', 'font-weight', 'color']) {
      expect(rule, `.cal-up-title 不应再自写 ${p}`).not.toContain(p)
    }
    expect(rule).toContain('margin-bottom: var(--sp-3)')   // 布局属性必须留下
  })
})
