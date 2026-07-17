import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus, { ElMessageBox } from 'element-plus'
import LanxinPushDrawer from './LanxinPushDrawer.vue'

const PLAN = {
  recipients: [
    { employId: 'A006', name: '张三', role: 'primary',
      card: { headTitle: '项目关注提醒', bodyTitle: '你名下 2 个项目存在关注原因',
              fields: [{ key: '回款延期', value: '2 个项目' }] } },
    { employId: 'A005', name: '耿磊磊', role: 'supervisor',
      card: { headTitle: '项目关注提醒', bodyTitle: '你的团队有 2 个项目存在关注原因',
              fields: [{ key: '张三', value: '2 项：回款延期 2' }] } },
  ],
  unresolved: [{ kind: 'project', id: 'P9', name: '查无此人', reason: '经理不在花名册' }],
  totals: { recipients: 2, unresolved: 1 },
}

vi.mock('@/lib/lanxinApi', () => ({
  getLanxinConfig: vi.fn(async () => ({
    enabled: true, sendIntervalMs: 200,
    credentials: { appId: 'a', appSecret: '', orgId: '1',
                   apiGateway: 'https://x.example.com', idType: 'employ_id', hasSecret: true },
    routes: [
      { key: 'timesheet', label: '倚天工时问题', enabled: true, issueCodes: ['MISS_SUMMARY'],
        recipients: { primary: true, supervisorLevels: 0 } },
      { key: 'project', label: '项目关注原因', enabled: true, reasons: ['回款延期'],
        recipients: { primary: true, supervisorLevels: 1 } },
    ],
  })),
  lanxinPreview: vi.fn(async () => PLAN),
  lanxinSend: vi.fn(async () => ({
    plan: PLAN,
    result: { sent: 1, failed: [{ employId: 'A005', name: '耿磊磊',
                                  errCode: 56008, errMsg: '触发限流' }], msgIds: ['M1'] },
  })),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) } as any)))
})

const mountDrawer = async () => {
  const w = mount(LanxinPushDrawer, {
    props: { modelValue: true },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w
}

describe('LanxinPushDrawer', () => {
  it('打开即预览,列出收件人与卡片文案', async () => {
    const w = await mountDrawer()
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('耿磊磊')
    expect(w.text()).toContain('你名下 2 个项目存在关注原因')
  })

  it('未解析清单必须可见(不静默丢)', async () => {
    const w = await mountDrawer()
    const box = w.find('[data-test="lx-unresolved"]')
    expect(box.exists()).toBe(true)
    expect(box.isVisible()).toBe(true)
    expect(box.text()).toContain('经理不在花名册')
    expect(box.text()).toContain('P9')
  })

  it('推送后失败清单必须可见(不吞)', async () => {
    // 真实二次确认框不会在 jsdom 里自动点击「确定」，须 spy 掉走既有仓库约定
    // (参照 YitianStoreCard.test.ts 对 ElMessageBox.confirm 的处理)。
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const w = await mountDrawer()
    await w.find('[data-test="lx-send"]').trigger('click')
    await flushPromises()
    const box = w.find('[data-test="lx-failed"]')
    expect(box.exists()).toBe(true)
    expect(box.isVisible()).toBe(true)
    expect(box.text()).toContain('耿磊磊')
    expect(box.text()).toContain('56008')
    confirmSpy.mockRestore()
  })

  it('推送按钮在预览出结果前禁用', async () => {
    const w = mount(LanxinPushDrawer, { props: { modelValue: true },
                                        global: { plugins: [ElementPlus] } })
    // el-drawer 首次挂载的插槽内容要等一个 tick 才 rendered=true(Element Plus 内部机制)，
    // 此时预览请求(至少两跳微任务)仍未回来，正好卡在「未出结果」这一态。
    await nextTick()
    expect(w.find('[data-test="lx-send"]').attributes('disabled')).toBeDefined()
  })
})
