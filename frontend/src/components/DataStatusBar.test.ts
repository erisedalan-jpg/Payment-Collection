import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DataStatusBar from './DataStatusBar.vue'

const base = {
  lastUpdate: '2026-07-09 10:00',
  lastPmis: '2026-07-08',
  agentOnline: true,
  cookieStatus: { sessionPreview: 'abc12345', updatedAt: '刚刚' },
  yitianStatus: { sessionPreview: '', updatedAt: '' },
}

describe('DataStatusBar', () => {
  it('渲染处理/PMIS 时间', () => {
    const w = mount(DataStatusBar, { props: base })
    expect(w.text()).toContain('2026-07-09 10:00')
    expect(w.text()).toContain('2026-07-08')
  })

  it('代理在线=ok/离线=warn 三态', () => {
    const on = mount(DataStatusBar, { props: base })
    expect(on.get('[data-test="dsb-agent"]').classes()).toContain('ok')
    expect(on.get('[data-test="dsb-agent"]').text()).toBe('已连接')
    const off = mount(DataStatusBar, { props: { ...base, agentOnline: false } })
    expect(off.get('[data-test="dsb-agent"]').classes()).toContain('warn')
    expect(off.get('[data-test="dsb-agent"]').text()).toBe('未运行')
  })

  it('cookie 有效显预览、未设置显 warn', () => {
    const has = mount(DataStatusBar, { props: base })
    expect(has.get('[data-test="dsb-cookie"]').classes()).toContain('ok')
    expect(has.get('[data-test="dsb-cookie"]').text()).toContain('abc12345')
    const none = mount(DataStatusBar, { props: { ...base, cookieStatus: { sessionPreview: '', updatedAt: '' } } })
    expect(none.get('[data-test="dsb-cookie"]').classes()).toContain('warn')
    expect(none.get('[data-test="dsb-cookie"]').text()).toBe('未设置')
  })

  it('倚天 已存/无', () => {
    const none = mount(DataStatusBar, { props: base })
    expect(none.get('[data-test="dsb-yitian"]').text()).toBe('-')
    const has = mount(DataStatusBar, { props: { ...base, yitianStatus: { sessionPreview: 'x', updatedAt: '刚刚' } } })
    expect(has.get('[data-test="dsb-yitian"]').text()).toContain('已存')
  })

  it('V4.5.0 外层改用 AppCard(raised),.dsb 只留 AppCard 不接管的布局属性', () => {
    const w = mount(DataStatusBar, { props: base })
    expect(w.classes()).toContain('ac--raised')
    expect(w.classes()).toContain('dsb')        // 布局类与 AppCard 并存,不被替换掉
    expect(w.classes()).not.toContain('ac--flat')
    expect(w.classes()).not.toContain('ac--default')
    const src = readFileSync(resolve(__dirname, 'DataStatusBar.vue'), 'utf-8')
    const dsb = src.match(/^\.dsb\s*\{([^}]*)\}/m)![1]
    // 卡片外观(含 padding)全部交给 AppCard;留一条在 .dsb 里就是两套值按加载顺序打架
    for (const p of ['background', 'border', 'box-shadow', 'padding']) {
      expect(dsb, `.dsb 不应再自写 ${p}`).not.toContain(p)
    }
    expect(dsb).toContain('display: flex')       // 布局属性必须留下,否则状态条会塌成竖排
  })
})
