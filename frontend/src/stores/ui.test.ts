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
