import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DisplaySettings from './DisplaySettings.vue'
import { useSettingsStore } from '@/stores/settings'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  document.documentElement.className = ''
})

describe('DisplaySettings', () => {
  it('clicking 深色 switches theme to dark', async () => {
    const wrapper = mount(DisplaySettings)
    await wrapper.get('[data-test="display-theme-dark"]').trigger('click')
    expect(useSettingsStore().theme).toBe('dark')
  })

  it('clicking 大 sets font scale to lg', async () => {
    const wrapper = mount(DisplaySettings)
    await wrapper.get('[data-test="display-font-lg"]').trigger('click')
    expect(useSettingsStore().fontScale).toBe('lg')
  })

  it('marks active theme and font buttons', () => {
    useSettingsStore().setTheme('dark')
    const wrapper = mount(DisplaySettings)
    expect(wrapper.get('[data-test="display-theme-dark"]').classes()).toContain('on')
    expect(wrapper.get('[data-test="display-font-md"]').classes()).toContain('on')
  })
})
