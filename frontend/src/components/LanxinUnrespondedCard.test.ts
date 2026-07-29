import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import LanxinUnrespondedCard from './LanxinUnrespondedCard.vue'
import { getLanxinUnresponded, type UnrespondedRow } from '@/lib/lanxinApi'

vi.mock('@/lib/lanxinApi', () => ({
  getLanxinUnresponded: vi.fn(async () => ({ success: true, rows: [], deadlineHours: 24 })),
}))

/** mock 方式沿用 LanxinInboxCard.test.ts 的 mountInbox 写法;区别是这里不 await 内部
 *  的异步加载 —— 调用方自己 await flushPromises(),与本文件测试用例的既定写法一致。 */
function mountWithRows(rows: UnrespondedRow[], deadlineHours = 24): VueWrapper {
  vi.mocked(getLanxinUnresponded).mockResolvedValueOnce({ success: true, rows, deadlineHours })
  return mount(LanxinUnrespondedCard, { global: { plugins: [ElementPlus] } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(getLanxinUnresponded).mockReset()
})

describe('LanxinUnrespondedCard', () => {
  it('默认只列「已超时且未响应」的行', async () => {
    // 清单的用途是「谁该催」,默认就该是待办视图;全部行可切换查看
    const w = mountWithRows([
      { sentAt: '2026-07-28 09:00:00', employId: 'A001', name: '张三', routeKey: 'project',
        projectCount: 3, dueAt: '2026-07-29 09:00:00', overdue: true, responded: false, firstResponseAt: '' },
      { sentAt: '2026-07-28 09:00:00', employId: 'A002', name: '李四', routeKey: 'project',
        projectCount: 1, dueAt: '2026-07-29 09:00:00', overdue: true, responded: true,
        firstResponseAt: '2026-07-28 10:00:00' },
      { sentAt: '2026-07-29 08:00:00', employId: 'A003', name: '王五', routeKey: 'timesheet',
        projectCount: 0, dueAt: '2026-07-30 08:00:00', overdue: false, responded: false, firstResponseAt: '' },
    ])
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
    const w = mountWithRows([
      { sentAt: '2026-07-28 09:00:00', employId: 'A001', name: '张三', routeKey: 'project',
        projectCount: 3, dueAt: '2026-07-29 09:00:00', overdue: true, responded: false, firstResponseAt: '' },
      { sentAt: '2026-07-28 09:00:00', employId: 'A002', name: '李四', routeKey: 'project',
        projectCount: 1, dueAt: '2026-07-29 09:00:00', overdue: true, responded: true,
        firstResponseAt: '2026-07-28 10:00:00' },
      { sentAt: '2026-07-29 08:00:00', employId: 'A003', name: '王五', routeKey: 'timesheet',
        projectCount: 0, dueAt: '2026-07-30 08:00:00', overdue: false, responded: false, firstResponseAt: '' },
    ])
    await flushPromises()
    const vm = w.vm as unknown as { filterMode: 'pending' | 'all' }
    vm.filterMode = 'all'
    await flushPromises()
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('李四')
    expect(w.text()).toContain('王五')
  })

  it('状态列与涉及项目数列按行精确取值,不是页面文本碰瓷', async () => {
    // 不能用 w.text().toContain('未响应') 判定 —— 本组件切换行的 dv-hint 里就写着
    // 「默认只列已超时且未响应的记录」,这行静态文案恒渲染,任何 statusOf() 的实现(哪怕
    // 判断整个写反)都不会让它消失,那种断言测不出真正的坏。改用 data-test 定位到具体单元格,
    // 按行序逐一核对状态文字与涉及项目数,才能钉住 responded 判断取反 / projectCount 错绑两类坏实现。
    const w = mountWithRows([
      { sentAt: '2026-07-28 09:00:00', employId: 'A001', name: '张三', routeKey: 'project',
        projectCount: 3, dueAt: '2026-07-29 09:00:00', overdue: true, responded: false, firstResponseAt: '' },
      { sentAt: '2026-07-28 09:00:00', employId: 'A002', name: '李四', routeKey: 'project',
        projectCount: 1, dueAt: '2026-07-29 09:00:00', overdue: true, responded: true,
        firstResponseAt: '2026-07-28 10:00:00' },
      { sentAt: '2026-07-29 08:00:00', employId: 'A003', name: '王五', routeKey: 'timesheet',
        projectCount: 0, dueAt: '2026-07-30 08:00:00', overdue: false, responded: false, firstResponseAt: '' },
    ])
    await flushPromises()
    const vm = w.vm as unknown as { filterMode: 'pending' | 'all' }
    vm.filterMode = 'all'   // 切到全部,三行(未响应/已响应/未到期三态齐全)都要在场才能逐一核对
    await flushPromises()

    const statusCells = w.findAll('[data-test="lu-status"]')
    const countCells = w.findAll('[data-test="lu-projcount"]')
    expect(statusCells.map((c) => c.text())).toEqual(['未响应', '已响应', '未到期'])
    expect(countCells.map((c) => c.text())).toEqual(['3', '1', '0'])
  })
})
