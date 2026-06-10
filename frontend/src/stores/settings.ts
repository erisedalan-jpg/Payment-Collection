import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Theme = 'light' | 'dark'
export type FontScale = 'sm' | 'md' | 'lg'

const THEME_KEY = 'theme'
const FONT_KEY = 'font_scale'

// 字号档位 → 根字号（rem 基准）；新组件用 rem，切档即整体缩放。小14/中16/大18。
export const FONT_PX: Record<FontScale, string> = { sm: '14px', md: '16px', lg: '18px' }

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || 'light')
  const fontScale = ref<FontScale>((localStorage.getItem(FONT_KEY) as FontScale) || 'md')

  function apply() {
    const el = document.documentElement
    el.classList.toggle('dark', theme.value === 'dark')
    el.style.setProperty('--fs-base', FONT_PX[fontScale.value])
  }

  function setTheme(t: Theme) {
    theme.value = t
    localStorage.setItem(THEME_KEY, t)
    apply()
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function setFontScale(f: FontScale) {
    fontScale.value = f
    localStorage.setItem(FONT_KEY, f)
    apply()
  }

  // 启动时按持久化值应用到 <html>（由 main.ts 调用一次）
  function init() {
    apply()
  }

  return { theme, fontScale, setTheme, toggleTheme, setFontScale, init }
})
