<script setup lang="ts">
import { useSettingsStore, type FontScale, type Theme } from '@/stores/settings'

const settings = useSettingsStore()
const THEMES: { key: Theme; label: string }[] = [
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
]
const FONTS: { key: FontScale; label: string }[] = [
  { key: 'sm', label: '小' },
  { key: 'md', label: '中' },
  { key: 'lg', label: '大' },
]
</script>

<template>
  <div class="display-settings">
    <div class="seg" role="group" aria-label="主题">
      <button v-for="t in THEMES" :key="t.key" :data-test="`display-theme-${t.key}`"
        class="seg-btn" :class="{ on: settings.theme === t.key }"
        @click="settings.setTheme(t.key)">{{ t.label }}</button>
    </div>
    <div class="seg" role="group" aria-label="字号">
      <button v-for="f in FONTS" :key="f.key" :data-test="`display-font-${f.key}`"
        class="seg-btn" :class="{ on: settings.fontScale === f.key }"
        @click="settings.setFontScale(f.key)">{{ f.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.display-settings { display: flex; align-items: center; gap: var(--sp-2); }
.seg { display: flex; border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden; }
.seg-btn { border: none; background: var(--card); color: var(--sub); cursor: pointer;
  font-size: var(--fs-1); padding: var(--sp-1) var(--sp-3); }
.seg-btn + .seg-btn { border-left: 1px solid var(--line); }
.seg-btn.on { background: var(--accent); color: #fff; font-weight: 700; }
.seg-btn:hover:not(.on) { color: var(--txt); }
</style>
