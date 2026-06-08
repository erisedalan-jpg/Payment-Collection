import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from './settings'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.style.removeProperty('--fs-base')
})

describe('settings store', () => {
  it('defaults to light theme and md font', () => {
    const s = useSettingsStore()
    expect(s.theme).toBe('light')
    expect(s.fontScale).toBe('md')
  })

  it('toggleTheme flips, persists, and toggles html.dark', () => {
    const s = useSettingsStore()
    s.toggleTheme()
    expect(s.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    s.toggleTheme()
    expect(s.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setFontScale persists and sets --fs-base', () => {
    const s = useSettingsStore()
    s.setFontScale('lg')
    expect(localStorage.getItem('font_scale')).toBe('lg')
    expect(document.documentElement.style.getPropertyValue('--fs-base')).toBe('17px')
  })

  it('reads persisted values and applies them on init', () => {
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('font_scale', 'sm')
    const s = useSettingsStore()
    expect(s.theme).toBe('dark')
    expect(s.fontScale).toBe('sm')
    s.init()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--fs-base')).toBe('13px')
  })
})
