import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import DataView from './DataView.vue'
import DataStatusBar from '@/components/DataStatusBar.vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import * as cookieAgent from '@/lib/cookieAgent'

vi.mock('@/lib/manualApi', () => ({
  manualApi: {
    backups: vi.fn(async () => ({ success: true, versions: [] })),
    import: vi.fn(async () => ({ success: true, message: '导入成功' })),
    rollback: vi.fn(async () => ({ success: true, message: '已回滚' })),
  },
}))

vi.mock('@/lib/cookieAgent', () => ({
  pingAgent: vi.fn().mockResolvedValue(true),
  fetchPmisCookie: vi.fn(),
  fetchYitianCookie: vi.fn(),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/files/status')) {
      return { ok: true, json: async () => ({ files: { '项目状态信息数据.xlsx': '2026-06-12 14:09', '项目中心.xlsx': null, 'payment_records.csv': '2026-06-12 14:46' } }) } as any
    }
    return { ok: true, json: async () => ({}) } as any
  }))
  const ds = useDataStore()
  ds.data = { meta: { lastUpdate: '2026-06-12 16:40' }, dataQuality: { summary: { lastPmisUpdate: '2026-06-09 12:23' } } } as any
})

async function mountView() {
  const w = mount(DataView, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
  await flushPromises()
  return w
}

describe('DataView(两条来源重构)', () => {
  it('顶部时间行渲染', async () => {
    const w = await mountView()
    expect(w.text()).toContain('2026-06-12 16:40')
  })

  it('主区含两种获取方式的说明文本', async () => {
    const w = await mountView()
    expect(w.text()).toContain('两种方式')
    expect(w.text()).toContain('上传文件')
    expect(w.text()).not.toContain('在线下载')   // 沿用旧约束:不得出现该字样
  })

  it('上传文件区含 PMIS 九表与项目域文件两分区', async () => {
    const w = await mountView()
    expect(w.text()).toContain('PMIS 九表')
    expect(w.text()).toContain('项目域文件')
    expect(w.find('[data-test="files-card"]').exists()).toBe(true)
  })

  it('PMIS 九行渲染', async () => {
    const w = await mountView()
    const rows = w.findAll('[data-test="pmis-row"]')
    expect(rows).toHaveLength(9)
    const msRow = rows.find((r) => r.text().includes('在建项目里程碑计划数据'))
    expect(msRow).toBeTruthy()
  })

  it('数据文件清单展示核心回款源 collection_stages.csv', async () => {
    const w = await mountView()
    expect(w.find('[data-test="files-card"]').text()).toContain('collection_stages.csv')
  })

  it('项目域文件区含 组织架构.xlsx 与 payment_records.csv', async () => {
    const w = await mountView()
    const card = w.find('[data-test="files-card"]')
    expect(card.text()).toContain('组织架构.xlsx')
    expect(card.text()).toContain('payment_records.csv')
    expect(card.text()).toContain('budget_data.csv')
    expect(card.text()).toContain('2026-06-12 14:46')
  })

  it('无 WPS/云同步/在线下载/离线导入入口', async () => {
    const w = await mountView()
    const heads = w.findAll('.dv-card-head').map((n) => n.text())
    expect(heads.some((t) => t.includes('WPS') || t.includes('云文档'))).toBe(false)
    expect(w.find('[data-test="wps-input"]').exists()).toBe(false)
    expect(w.find('[data-test="wps-reset"]').exists()).toBe(false)
    expect(w.find('[data-test="link-reset"]').exists()).toBe(false)
    expect(w.text()).not.toContain('在线下载')
    expect(w.text()).not.toContain('云同步')
    expect(w.text()).not.toContain('离线导入')
  })

  it('挂载仅拉 files/status，不再拉 pmis/links', async () => {
    await mountView()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/files/status'))).toBe(true)
    expect(calls.some((u: string) => u.includes('/api/pmis/links'))).toBe(false)
  })

  it('主操作区含「更新看板」，清空数据进维护折叠区', async () => {
    const w = await mountView()
    const heads = w.findAll('.dv-card-head').map((n) => n.text())
    expect(heads.some((t) => t.includes('更新看板'))).toBe(true)
    expect(w.text()).toContain('清空数据')
  })

  it('渲染「人工数据导入 / 回滚」卡', async () => {
    const w = await mountView()
    expect(w.text()).toContain('人工数据导入')
    expect(w.text()).toContain('回滚')
    const card = w.find('[data-test="manual-import-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('项目标签')
    expect(card.text()).toContain('跟进记录')
  })

  it('数据历史卡渲染源说明行', async () => {
    const w = await mountView()
    const note = w.find('[data-test="history-source-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('源数据仅保留最新 1 份')
    expect(note.text()).toContain('回滚仅还原看板数据')
  })

  it('渲染标签库管理 + 按标签排除配置', async () => {
    const tags = useProjectTagsStore()
    tags.load = vi.fn(async () => {
      tags.$patch({ tags: [{ name: 'BH项目' }, { name: '框架合同' }], loaded: true })
    })
    const w = mount(DataView, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
    await flushPromises()
    expect(w.text()).toContain('项目标签')
    expect(w.text()).toContain('按标签排除')
    expect(w.html()).toContain('BH项目')
  })

  it('点下载数据：cookie 非空时先 POST /api/pmis/cookie，再开 /api/pmis/download', async () => {
    const w = await mountView()
    await w.find('[data-test="pmis-cookie"]').setValue('x=1; SESSION=abc')
    await w.find('[data-test="btn-download"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/pmis/cookie'))).toBe(true)
    expect(calls.some((u: string) => u.includes('/api/pmis/download'))).toBe(true)
  })

  it('文件清单为多列网格(.dv-fgrid)，PMIS 仍 9 行且保留全名', async () => {
    const w = await mountView()
    expect(w.findAll('.dv-fgrid').length).toBeGreaterThanOrEqual(2)  // PMIS + 项目域两组
    expect(w.findAll('[data-test="pmis-row"]')).toHaveLength(9)
    expect(w.find('[data-test="files-card"]').text()).toContain('collection_stages.csv')
  })

  it('更新按钮在顶部主操作区，先于 PMIS 域卡的下载按钮出现(DOM 顺序)', async () => {
    const w = await mountView()
    const btns = w.findAll('button').map((b) => b.text())
    const di = btns.findIndex((t) => t.includes('下载数据'))
    const ui = btns.findIndex((t) => t.includes('更新数据（重新处理）'))
    expect(di).toBeGreaterThanOrEqual(0)
    expect(ui).toBeGreaterThanOrEqual(0)
    expect(ui).toBeLessThan(di)
  })

  it('渲染状态总览条 DataStatusBar', async () => {
    const w = await mountView()
    expect(w.findComponent(DataStatusBar).exists()).toBe(true)
  })

  it('项目标签卡 + 维护与历史折叠面板标题齐全', async () => {
    const w = await mountView()
    const t = w.text()
    expect(t).toContain('项目标签')
    expect(t).toContain('人工数据导入')
    expect(t).toContain('数据历史')
    expect(t).toContain('清空数据')
  })
})

describe('DataView 本机取 cookie', () => {
  it('获取本机 PMIS cookie(含 SESSION) → 推送到 /api/pmis/cookie', async () => {
    const { api } = await import('@/api/client')
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ sessionPreview: 'SESSION1' } as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'SESSION=z; a=b', names: ['SESSION', 'a'], hasSession: true, error: '',
    })
    const w = await mountView()
    await flushPromises()
    await (w.vm as unknown as { onFetchPmisCookie: () => Promise<void> }).onFetchPmisCookie()
    await flushPromises()
    expect(postSpy).toHaveBeenCalledWith('/api/pmis/cookie', { cookie: 'SESSION=z; a=b' })
  })

  it('取到无 SESSION → 告警且不推送', async () => {
    const { api } = await import('@/api/client')
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({} as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'a=b', names: ['a'], hasSession: false, error: '',
    })
    const w = await mountView()
    await flushPromises()
    await (w.vm as unknown as { onFetchPmisCookie: () => Promise<void> }).onFetchPmisCookie()
    await flushPromises()
    expect(postSpy).not.toHaveBeenCalledWith('/api/pmis/cookie', expect.anything())
  })
})
