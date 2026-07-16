import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from './ui'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('ui store', () => {
  it('defaults to expanded sidebar', () => {
    const ui = useUiStore()
    expect(ui.sidebarCollapsed).toBe(false)
  })

  it('toggle flips and persists', () => {
    const ui = useUiStore()
    ui.toggleSidebar()
    expect(ui.sidebarCollapsed).toBe(true)
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true')
  })

  it('reads persisted collapsed state on init', () => {
    localStorage.setItem('sidebar_collapsed', 'true')
    const ui = useUiStore()
    expect(ui.sidebarCollapsed).toBe(true)
  })
})

describe('ui store 分区折叠', () => {
  it('sectionExpanded 默认空对象', () => {
    const ui = useUiStore()
    expect(ui.sectionExpanded).toEqual({})
  })
  it('setSection 写入并持久化到 sidebar_sections', () => {
    const ui = useUiStore()
    ui.setSection('analysis', true)
    expect(ui.sectionExpanded['analysis']).toBe(true)
    expect(JSON.parse(localStorage.getItem('sidebar_sections')!)).toEqual({ analysis: true })
  })
  it('setSection 多次累加不互相覆盖', () => {
    const ui = useUiStore()
    ui.setSection('analysis', true)
    ui.setSection('payment', false)
    expect(ui.sectionExpanded).toEqual({ analysis: true, payment: false })
  })
  it('初始化读持久化的分区态', () => {
    localStorage.setItem('sidebar_sections', JSON.stringify({ payment: false }))
    const ui = useUiStore()
    expect(ui.sectionExpanded['payment']).toBe(false)
  })
  it('损坏 JSON 降级为空对象', () => {
    localStorage.setItem('sidebar_sections', '{bad json')
    const ui = useUiStore()
    expect(ui.sectionExpanded).toEqual({})
  })
})
