import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import DataView from './DataView.vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'

const DEFAULTS = {
  回款数据: 'https://yundocs.qianxin-inc.cn/weboffice/l/sRs8GgCmE2ygb',
  '项目状态信息数据.xlsx': 'https://pmis.example/status0',
  '项目状态信息数据-已关闭.xlsx': 'https://pmis.example/status1',
  '项目风险数据.xlsx': 'https://pmis.example/risk',
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/pmis/links')) {
      return { ok: true, json: async () => ({ links: { ...DEFAULTS }, defaults: { ...DEFAULTS } }) } as any
    }
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

describe('DataView(R3 重排)', () => {
  it('五卡结构与时间行', async () => {
    const w = await mountView()
    const heads = w.findAll('.dv-card-head').map((n) => n.text())
    expect(heads.some((t) => t.includes('回款数据'))).toBe(true)
    expect(heads.some((t) => t.includes('PMIS'))).toBe(true)
    expect(heads.some((t) => t.includes('项目域文件'))).toBe(true)
    expect(heads.some((t) => t.includes('更新数据'))).toBe(true)
    expect(heads.some((t) => t.includes('设置'))).toBe(true)
    expect(w.text()).toContain('2026-06-12 16:40')
  })

  it('WPS 默认链接预填+重置按钮', async () => {
    const w = await mountView()
    const input = w.find('[data-test="wps-input"]').element as HTMLInputElement
    expect(input.value).toContain('yundocs.qianxin-inc.cn')
    expect(w.find('[data-test="wps-reset"]').exists()).toBe(true)
  })

  it('PMIS 九行:直链项有输入+重置,无直链项有徽章,行内时间', async () => {
    const w = await mountView()
    const rows = w.findAll('[data-test="pmis-row"]')
    expect(rows).toHaveLength(9)
    const statusRow = rows.find((r) => r.text().includes('项目状态信息数据.xlsx'))!
    expect((statusRow.find('input').element as HTMLInputElement).value).toContain('pmis.example/status0')
    expect(statusRow.text()).toContain('2026-06-12 14:09')
    const centerRow = rows.find((r) => r.text().includes('项目中心.xlsx'))!
    expect(centerRow.find('input').exists()).toBe(false)
    expect(centerRow.text()).toContain('需手动导出上传')
    expect(centerRow.text()).toContain('-')   // 无文件时间
    const msRow = rows.find((r) => r.text().includes('在建项目里程碑计划数据'))
    expect(msRow).toBeTruthy()
  })

  it('重置把链接恢复为默认值', async () => {
    const w = await mountView()
    const statusRow = w.findAll('[data-test="pmis-row"]').find((r) => r.text().includes('项目状态信息数据.xlsx'))!
    const input = statusRow.find('input')
    await input.setValue('http://changed')
    await statusRow.find('[data-test="link-reset"]').trigger('click')
    expect((input.element as HTMLInputElement).value).toBe('https://pmis.example/status0')
  })

  it('项目域文件卡列出 7 文件与时间', async () => {
    const w = await mountView()
    const card = w.find('[data-test="inputs-card"]')
    expect(card.text()).toContain('组织架构.xlsx')
    expect(card.text()).toContain('payment_records.csv')
    expect(card.text()).toContain('budget_data.csv')
    expect(card.text()).toContain('2026-06-12 14:46')
  })

  it('挂载即拉 links 与 files/status', async () => {
    await mountView()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/pmis/links'))).toBe(true)
    expect(calls.some((u: string) => u.includes('/api/files/status'))).toBe(true)
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
    // tag 名称渲染在 input[value] 属性上，用 html() 检查
    expect(w.html()).toContain('BH项目')
  })
})
