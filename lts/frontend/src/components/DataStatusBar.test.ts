import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DataStatusBar from './DataStatusBar.vue'

const base = {
  lastUpdate: '2026-07-09 10:00',
  lastPmis: '2026-07-08',
  agentOnline: true,
  cookieStatus: { sessionPreview: 'abc12345', updatedAt: '刚刚' },
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
})
