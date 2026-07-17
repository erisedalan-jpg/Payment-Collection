import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MainDomainSourceCard from './MainDomainSourceCard.vue'
import * as cookieAgent from '@/lib/cookieAgent'

vi.mock('@/lib/cookieAgent', () => ({
  pingAgent: vi.fn().mockResolvedValue(true),
  fetchPmisCookie: vi.fn(),
  fetchYitianCookie: vi.fn(),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/files/status')) {
      return { ok: true, json: async () => ({ files: { '项目中心.xlsx': '2026-06-12 14:09', 'payment_records.csv': '2026-06-12 14:46' } }) } as any
    }
    return { ok: true, json: async () => ({}) } as any
  }))
})

const mountCard = async () => {
  const w = mount(MainDomainSourceCard, { props: { repRunning: false }, global: { plugins: [ElementPlus] } })
  await flushPromises()
  return w
}

describe('MainDomainSourceCard', () => {
  it('一张卡内同时含 PMIS 九表与项目域文件两分区', async () => {
    const w = await mountCard()
    expect(w.text()).toContain('PMIS 九表')
    expect(w.text()).toContain('项目域文件')
    expect(w.findAll('.dv-fgrid')).toHaveLength(2)
  })

  it('根节点带 files-card 钩子且含核心回款源与根文件', async () => {
    const w = await mountCard()
    const card = w.find('[data-test="files-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('collection_stages.csv')
    expect(card.text()).toContain('组织架构.xlsx')
    expect(card.text()).toContain('payment_records.csv')
    expect(card.text()).toContain('2026-06-12 14:46')
  })

  it('PMIS 九行渲染', async () => {
    const w = await mountCard()
    const rows = w.findAll('[data-test="pmis-row"]')
    expect(rows).toHaveLength(9)
    expect(rows.some((r) => r.text().includes('在建项目里程碑计划数据'))).toBe(true)
  })

  it('repRunning 为真时禁用下载按钮(互斥不得丢失)', async () => {
    const w = mount(MainDomainSourceCard, { props: { repRunning: true }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('[data-test="btn-download"]').attributes('disabled')).toBeDefined()
  })

  it('取到含 SESSION 的 cookie → POST 并 emit cookie-change', async () => {
    const { api } = await import('@/api/client')
    vi.spyOn(api, 'post').mockResolvedValue({ sessionPreview: 'SESSION1' } as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'SESSION=z; a=b', names: ['SESSION', 'a'], hasSession: true, error: '',
    })
    const w = await mountCard()
    await (w.vm as any).onFetchPmisCookie()
    await flushPromises()
    expect(w.emitted('cookie-change')?.[0]).toEqual([{ sessionPreview: 'SESSION1', updatedAt: '刚刚' }])
  })

  it('取到无 SESSION → 告警且不推送、不 emit', async () => {
    const { api } = await import('@/api/client')
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({} as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'a=b', names: ['a'], hasSession: false, error: '',
    })
    const w = await mountCard()
    await (w.vm as any).onFetchPmisCookie()
    await flushPromises()
    expect(postSpy).not.toHaveBeenCalledWith('/api/pmis/cookie', expect.anything())
    expect(w.emitted('cookie-change')).toBeUndefined()
    expect(w.text()).toContain('未检测到 PMIS 登录态')
  })

  it('点下载:cookie 非空时先 POST /api/pmis/cookie 再开 /api/pmis/download', async () => {
    const w = await mountCard()
    await w.find('[data-test="pmis-cookie"]').setValue('x=1; SESSION=abc')
    await w.find('[data-test="btn-download"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/pmis/download'))).toBe(true)
  })
})
