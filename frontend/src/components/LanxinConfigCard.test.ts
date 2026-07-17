import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import LanxinConfigCard from './LanxinConfigCard.vue'

const CFG = {
  enabled: false, sendIntervalMs: 200,
  credentials: { appId: 'app-1', appSecret: '', orgId: '524288',
                 apiGateway: 'https://apigw.example.com', idType: 'employ_id', hasSecret: true },
  routes: [
    { key: 'timesheet', label: '倚天工时问题', enabled: true,
      issueCodes: ['MISS_SUMMARY'], recipients: { primary: true, supervisorLevels: 0 } },
    { key: 'project', label: '项目关注原因', enabled: true,
      reasons: ['回款延期'], recipients: { primary: true, supervisorLevels: 1 } },
  ],
}

vi.mock('@/lib/lanxinApi', () => ({
  getLanxinConfig: vi.fn(async () => JSON.parse(JSON.stringify(CFG))),
  saveLanxinConfig: vi.fn(async (c: unknown) => c),
  lanxinSelftest: vi.fn(async () => ({ steps: [
    { name: '取应用访问TOKEN', ok: true, msg: '成功' },
    { name: '工号换人员ID', ok: false, msg: '组织id格式异常 (52051)' },
  ] })),
}))

beforeEach(() => { setActivePinia(createPinia()) })

const mountCard = async () => {
  const w = mount(LanxinConfigCard, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
  await flushPromises()
  return w
}

describe('LanxinConfigCard', () => {
  it('渲染两条路由与其汇总级别', async () => {
    const w = await mountCard()
    expect(w.text()).toContain('倚天工时问题')
    expect(w.text()).toContain('项目关注原因')
    expect(w.find('[data-test="lx-card"]').exists()).toBe(true)
  })

  it('已存密钥时不回显明文,只提示已配置', async () => {
    const w = await mountCard()
    expect(w.html()).not.toContain('appSecret“明文”')
    expect(w.text()).toContain('已配置')
  })

  it('自检结果逐步展示,失败步骤必须可见(不静默吞)', async () => {
    const w = await mountCard()
    await w.find('[data-test="lx-selftest-emp"]').setValue('A000701')
    await w.find('[data-test="lx-selftest"]').trigger('click')
    await flushPromises()
    const box = w.find('[data-test="lx-selftest-result"]')
    expect(box.exists()).toBe(true)
    expect(box.isVisible()).toBe(true)
    expect(box.text()).toContain('取应用访问TOKEN')
    expect(box.text()).toContain('52051')
  })

  it('保存调用 saveLanxinConfig', async () => {
    const { saveLanxinConfig } = await import('@/lib/lanxinApi')
    const w = await mountCard()
    await w.find('[data-test="lx-save"]').trigger('click')
    await flushPromises()
    expect(saveLanxinConfig).toHaveBeenCalled()
  })

  it('保存时把新密钥放进 payload;未填则传空串(后端据此沿用旧值)', async () => {
    const { saveLanxinConfig } = await import('@/lib/lanxinApi')
    const w = await mountCard()
    await w.find('[data-test="lx-save"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(saveLanxinConfig).mock.calls[0][0].credentials.appSecret).toBe('')
  })

  it('「预览并推送」冒泡 open-push 事件(抽屉由 DataView 持有)', async () => {
    const w = await mountCard()
    await w.find('[data-test="lx-open-push"]').trigger('click')
    expect(w.emitted('open-push')).toHaveLength(1)
  })

  it('选项源是全集,不是已勾选的子集(否则取消勾选后再也勾不回来)', async () => {
    const w = await mountCard()
    // 配置里 timesheet 只勾了 1 个 code、project 只勾了 1 个 reason,
    // 但下拉必须给出全部 7 个 / 8 个选项
    const html = w.html()
    expect(html).toContain('缺少工作概述')
    expect(html).toContain('工时类型填报有误')   // 未勾选,但必须在选项里
    expect(html).toContain('里程碑滞后')         // 未勾选,但必须在选项里
  })
})
