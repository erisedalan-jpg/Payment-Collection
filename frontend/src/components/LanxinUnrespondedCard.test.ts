import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import LanxinUnrespondedCard from './LanxinUnrespondedCard.vue'
import { getLanxinUnresponded, type UnrespondedRow } from '@/lib/lanxinApi'

vi.mock('@/lib/lanxinApi', () => ({
  getLanxinUnresponded: vi.fn(async () => ({ success: true, rows: [], deadlineHours: 24 })),
}))

/** 行工厂：只写本用例关心的差异，其余走默认值。role 默认 'primary'（本人明细卡，
 *  即真正被要求反馈、真正该催的那一类），这样既有用例的语义与新增角色列无关。 */
function row(over: Partial<UnrespondedRow> = {}): UnrespondedRow {
  return {
    sentAt: '2026-07-28 09:00:00', employId: 'A001', name: '张三', routeKey: 'project',
    role: 'primary', projectCount: 3, dueAt: '2026-07-29 09:00:00',
    overdue: true, responded: false, firstResponseAt: '', ...over,
  }
}

/** 三态齐全的基础数据集：未响应 / 已响应 / 未到期，全部为 primary。 */
const THREE_STATES = [
  row(),
  row({ employId: 'A002', name: '李四', projectCount: 1, responded: true,
        firstResponseAt: '2026-07-28 10:00:00' }),
  row({ employId: 'A003', name: '王五', routeKey: 'timesheet', projectCount: 0,
        sentAt: '2026-07-29 08:00:00', dueAt: '2026-07-30 08:00:00', overdue: false }),
]

/** mock 方式沿用 LanxinInboxCard.test.ts 的 mountInbox 写法;区别是这里不 await 内部
 *  的异步加载 —— 调用方自己 await flushPromises(),与本文件测试用例的既定写法一致。 */
function mountWithRows(rows: UnrespondedRow[], deadlineHours = 24): VueWrapper {
  vi.mocked(getLanxinUnresponded).mockResolvedValueOnce({ success: true, rows, deadlineHours })
  return mount(LanxinUnrespondedCard, { global: { plugins: [ElementPlus] } })
}

async function showAll(w: VueWrapper) {
  ;(w.vm as unknown as { filterMode: 'pending' | 'all' }).filterMode = 'all'
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(getLanxinUnresponded).mockReset()
})

describe('LanxinUnrespondedCard', () => {
  it('默认只列「已超时且未响应」的行', async () => {
    // 清单的用途是「谁该催」,默认就该是待办视图;全部行可切换查看
    const w = mountWithRows(THREE_STATES)
    await flushPromises()
    expect(w.text()).toContain('张三')
    expect(w.text()).not.toContain('李四')      // 已响应
    expect(w.text()).not.toContain('王五')      // 未到期
  })

  it('标明人级判定,不让超管误以为是项目级精度', async () => {
    // 一期唯一的回流通道是员工直接回复消息,回复正文里没有项目信息 —— 精度边界必须写在界面上
    const w = mountWithRows([])
    await flushPromises()
    expect(w.text()).toContain('人级')
  })

  it('展示后端下发的时限,不自带默认值', async () => {
    const w = mountWithRows([], 72)
    await flushPromises()
    expect(w.text()).toContain('72')
  })

  it('切到「全部」后展示全部行,含已响应与未到期的记录', async () => {
    // 与「默认只列」互补的另一条分支:只验默认值对了不够,「全部」分支本身也要证明确实
    // 展示全量,否则默认值判断对了但切换后仍缺行这类 bug 不会被任何用例逮到。
    const w = mountWithRows(THREE_STATES)
    await flushPromises()
    await showAll(w)
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('李四')
    expect(w.text()).toContain('王五')
  })

  it('状态列与涉及项目数列按行精确取值,不是页面文本碰瓷', async () => {
    // 不能用 w.text().toContain('未响应') 判定 —— 本组件切换行的 dv-hint 里就写着
    // 「默认只列已超时且未响应的记录」,这行静态文案恒渲染,任何 statusOf() 的实现(哪怕
    // 判断整个写反)都不会让它消失,那种断言测不出真正的坏。改用 data-test 定位到具体单元格,
    // 按行序逐一核对状态文字与涉及项目数,才能钉住 responded 判断取反 / projectCount 错绑两类坏实现。
    const w = mountWithRows(THREE_STATES)
    await flushPromises()
    await showAll(w)   // 切到全部,三行(未响应/已响应/未到期三态齐全)都要在场才能逐一核对

    const statusCells = w.findAll('[data-test="lu-status"]')
    const countCells = w.findAll('[data-test="lu-projcount"]')
    expect(statusCells.map((c) => c.text())).toEqual(['未响应', '已响应', '未到期'])
    expect(countCells.map((c) => c.text())).toEqual(['3', '1', '0'])
  })

  // ── review Important-3:上级汇总卡的收件人不该出现在待催视图 ────────────────

  it('「仅未响应」排除上级（汇总卡）收件人,「全部」仍能看到他们', async () => {
    // 【承重】汇总卡上没有动作要求、没有任何 N 小时反馈承诺(build_summary_card 零改动),
    // 上级压根没被要求反馈。不排除的话超管上线第一天看到的一部分是上级,去催得到的回答是
    // 「我这张卡没让我反馈」;而「涉及项目数」对汇总卡是全部下属项目的并集,看上去反而更像
    // 重点对象。切到「全部」时必须仍能看到 —— 这是台账,不是删数据。
    const w = mountWithRows([
      row({ employId: 'A001', name: '张三', role: 'primary' }),
      row({ employId: 'A009', name: '耿磊磊', role: 'supervisor', projectCount: 12 }),
    ])
    await flushPromises()
    expect(w.text()).toContain('张三')
    expect(w.text()).not.toContain('耿磊磊')

    await showAll(w)
    expect(w.text()).toContain('耿磊磊')
  })

  it('老台账(role 为空串)不被排除,行为向后兼容', async () => {
    // V4.5.8 之前的发送台账没有 role 字段 → 后端退化成空串。只排除明确的 'supervisor',
    // 空串一律保留 —— 宁可多列一行让人自己判断,也不能因为一个新字段把历史台账
    // 整段从清单上抹掉(那是静默数据消失,没人会发现)。
    const w = mountWithRows([row({ employId: 'A007', name: '老记录', role: '' })])
    await flushPromises()
    expect(w.text()).toContain('老记录')
  })

  it('角色列按行取值,三种取值各有可读中文,不直接漏出英文 key', async () => {
    // 排除掉上级之后,超管仍需要在「全部」视图里分辨每行是明细卡还是汇总卡 ——
    // 没有这一列,他看到的两行长得一模一样,无从判断该不该催。
    const w = mountWithRows([
      row({ employId: 'A001', role: 'primary' }),
      row({ employId: 'A009', role: 'supervisor' }),
      row({ employId: 'A007', role: '' }),
    ])
    await flushPromises()
    await showAll(w)
    const cells = w.findAll('[data-test="lu-role"]').map((c) => c.text())
    expect(cells).toEqual(['本人（明细卡）', '上级（汇总卡）', '未记录'])
  })

  it('界面上写明默认视图为什么排除了汇总卡收件人', async () => {
    // 「表里少了一部分人」如果不解释,超管会以为清单漏数据、转而不信任它。
    const w = mountWithRows([])
    await flushPromises()
    const note = w.find('[data-test="lu-role-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('汇总卡')
    expect(note.text()).toContain('全部')      // 指明去哪儿看完整台账
  })
})
