# Plan D1：全局地基（主题 / 字号 / 响应式）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为前端建立全局显示地基——CSS 变量双主题（明/暗）、字号三档（小/中/大）、`settings` Pinia store（localStorage 持久化）、右上角"显示设置"入口、ECharts 双主题、CSS 基线 reset，供 Phase D 后续所有页面统一消费。

**Architecture:** 一套 CSS 变量定义在 `src/styles/theme.css`（`:root` 浅色，`html.dark` 覆盖深色，`--fs-base` 控制根字号），由 `settings` store 在切换时写 `<html>` 的 class 与 `--fs-base`；ECharts 注册浅/深两套主题，`ChartBox` 按 `settings.theme` 选用（无 pinia 时守卫回退浅色，避免破坏既有图表测试）；`DisplaySettings.vue` 挂到 `AppHeader`，并把外壳组件（Header/Layout/Sidebar）的硬编码颜色改吃变量，使深色真正可见。

**Tech Stack:** Vue3 `<script setup lang="ts">`、Pinia、Element Plus（含 dark css-vars）、ECharts/vue-echarts、Vitest + @vue/test-utils（jsdom）。

参考设计：`docs/superpowers/specs/2026-06-04-phase-d-frontend-redesign-design.md` 决策 9 与 §4.1。

---

## 文件结构（本计划涉及）

- Create `frontend/src/styles/theme.css` —— 全局 CSS 变量（双主题 + 字号基准）+ 基线 reset + 断点约定注释。
- Create `frontend/src/stores/settings.ts` —— 主题/字号状态、持久化、应用到 `<html>`。
- Create `frontend/src/stores/settings.test.ts` —— store 单测。
- Create `frontend/src/components/DisplaySettings.vue` —— 主题/字号分段控件（无 emoji，纯文字）。
- Create `frontend/src/components/DisplaySettings.test.ts` —— 组件单测。
- Modify `frontend/src/charts/echartsTheme.ts` —— 新增 `ENT_THEME_DARK`。
- Modify `frontend/src/charts/ChartBox.vue` —— 按 settings 选主题。
- Modify `frontend/src/charts/ChartBox.test.ts` —— 加 pinia + 暗色用例。
- Modify `frontend/src/main.ts` —— 引入 theme.css / EP 暗色 css-vars / 初始化 settings。
- Modify `frontend/src/layout/AppHeader.vue` —— 挂 DisplaySettings + 颜色改吃变量。
- Modify `frontend/src/layout/AppLayout.vue` —— 主区背景改吃变量。
- Modify `frontend/src/layout/AppSidebar.vue` —— 颜色改吃变量。
- Modify `PROGRESS.md` —— 记录 D1 完成。

> 命令约定：测试在 `frontend/` 下跑。单测单文件用 `npx vitest run <相对 src 路径>`；全量 `npm run test:run`；类型 `npm run typecheck`；构建 `npm run build`。提交在仓库根用 `git`。

---

### Task 1：settings store（主题 / 字号 / 持久化 / 应用）

**Files:**
- Create: `frontend/src/stores/settings.ts`
- Test: `frontend/src/stores/settings.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/stores/settings.test.ts`：

```ts
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
    expect(document.documentElement.style.getPropertyValue('--fs-base')).toBe('16px')
  })

  it('reads persisted values and applies them on init', () => {
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('font_scale', 'sm')
    const s = useSettingsStore()
    expect(s.theme).toBe('dark')
    expect(s.fontScale).toBe('sm')
    s.init()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--fs-base')).toBe('14px')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/settings.test.ts`
Expected: FAIL（`Cannot find module './settings'` / `useSettingsStore is not a function`）。

- [ ] **Step 3: 写最小实现**

`frontend/src/stores/settings.ts`：

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Theme = 'light' | 'dark'
export type FontScale = 'sm' | 'md' | 'lg'

const THEME_KEY = 'theme'
const FONT_KEY = 'font_scale'

// 字号档位 → 根字号（rem 基准）；新组件用 rem，切档即整体缩放。
export const FONT_PX: Record<FontScale, string> = { sm: '14px', md: '15px', lg: '16px' }

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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/stores/settings.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/settings.ts frontend/src/stores/settings.test.ts
git commit -m "feat(D1): settings store（明暗主题 + 字号三档 + 持久化）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2：全局样式 theme.css + 启动接线（main.ts）

**Files:**
- Create: `frontend/src/styles/theme.css`
- Modify: `frontend/src/main.ts`

> 说明：本任务是 CSS + 启动配置，无单元测试；验证靠 typecheck + build + 全量 vitest 不回归 + 手动启动确认明暗切换可见。

- [ ] **Step 1: 写全局样式**

`frontend/src/styles/theme.css`：

```css
/* 全局主题变量 + 基线 reset。:root 为浅色；html.dark 覆盖为深色。
   --fs-base 由 settings store 在运行时写到 <html>；此处给默认值兜底。
   断点约定（供后续页面用，本文件不强制）：窄屏 <=768px，常规 <=1200px。 */

:root {
  --fs-base: 15px;

  --bg: #eef2f8;
  --card: #ffffff;
  --card2: #fbfcfe;
  --line: #e6eaf2;
  --line2: #d4dbe8;
  --txt: #1f2a3d;
  --sub: #5b6b85;
  --mut: #93a1b8;
  --accent: #2563eb;
  --cyan: #0891b2;
  --danger: #e11d48;
  --warn: #f59e0b;
  --ok: #10b981;
}

html.dark {
  --bg: #0b1220;
  --card: #111c30;
  --card2: #0f1a2c;
  --line: #1f2c44;
  --line2: #28385a;
  --txt: #e6edf7;
  --sub: #8aa0c0;
  --mut: #5d728f;
  --accent: #3b82f6;
  --cyan: #22d3ee;
  --danger: #fb7185;
  --warn: #fbbf24;
  --ok: #34d399;
}

*, *::before, *::after { box-sizing: border-box; }

html { font-size: var(--fs-base, 15px); }

body {
  margin: 0;
  background: var(--bg);
  color: var(--txt);
  transition: background-color .15s, color .15s;
}
```

- [ ] **Step 2: 接线 main.ts**

把 `frontend/src/main.ts` 整体替换为：

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/theme.css'
import App from './App.vue'
import { router } from './router'
import { useSettingsStore } from './stores/settings'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia).use(router).use(ElementPlus)
// 启动时按持久化的主题/字号应用到 <html>
useSettingsStore(pinia).init()
app.mount('#app')
```

- [ ] **Step 3: 验证类型 + 构建 + 全量测试不回归**

Run: `cd frontend && npm run typecheck && npm run test:run && npm run build`
Expected: typecheck 通过；vitest 全绿（含 Task 1 新增）；build 成功。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/styles/theme.css frontend/src/main.ts
git commit -m "feat(D1): 全局 theme.css 变量体系 + main 接入(EP 暗色/字号初始化)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3：ECharts 双主题 + ChartBox 按 settings 选主题

**Files:**
- Modify: `frontend/src/charts/echartsTheme.ts`
- Modify: `frontend/src/charts/ChartBox.vue`
- Modify: `frontend/src/charts/ChartBox.test.ts`

- [ ] **Step 1: 改测试（加 pinia + 暗色用例）**

把 `frontend/src/charts/ChartBox.test.ts` 整体替换为：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChartBox from './ChartBox.vue'
import { useSettingsStore } from '@/stores/settings'

const VChartStub = {
  name: 'VChart',
  props: ['option', 'theme', 'autoresize'],
  template: '<div class="vchart-stub">{{ Object.keys(option || {}).join(",") }}</div>',
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  document.documentElement.className = ''
})

describe('ChartBox', () => {
  it('renders a chart container and forwards the option to VChart', () => {
    const wrapper = mount(ChartBox, {
      props: { option: { series: [], xAxis: {} } },
      global: { stubs: { VChart: VChartStub } },
    })
    expect(wrapper.find('.chart-box').exists()).toBe(true)
    expect(wrapper.find('.vchart-stub').text()).toContain('series')
    expect(wrapper.findComponent({ name: 'VChart' }).props('theme')).toBe('ent')
  })

  it('applies the given height', () => {
    const wrapper = mount(ChartBox, {
      props: { option: {}, height: '480px' },
      global: { stubs: { VChart: VChartStub } },
    })
    expect((wrapper.find('.chart-box').element as HTMLElement).style.height).toBe('480px')
  })

  it('uses dark echarts theme when settings.theme is dark', () => {
    useSettingsStore().setTheme('dark')
    const wrapper = mount(ChartBox, {
      props: { option: {} },
      global: { stubs: { VChart: VChartStub } },
    })
    expect(wrapper.findComponent({ name: 'VChart' }).props('theme')).toBe('ent-dark')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/charts/ChartBox.test.ts`
Expected: FAIL（暗色用例拿到 `'ent'` 而非 `'ent-dark'`，或 `ENT_THEME_DARK` 未导出）。

- [ ] **Step 3: 实现双主题**

把 `frontend/src/charts/echartsTheme.ts` 整体替换为：

```ts
import { use, registerTheme } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'

// 按需注册 ECharts 模块（tree-shaking）
use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

const PALETTE = ['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899']

// 'ent'：浅色（默认，沿用旧版主名，避免破坏既有引用/测试）
export const ENT_THEME = 'ent'
registerTheme(ENT_THEME, {
  color: PALETTE,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, "Noto Sans SC", sans-serif', color: '#1f2a3d' },
  legend: { textStyle: { color: '#5b6b85' } },
})

// 'ent-dark'：深色
export const ENT_THEME_DARK = 'ent-dark'
registerTheme(ENT_THEME_DARK, {
  color: PALETTE,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, "Noto Sans SC", sans-serif', color: '#e6edf7' },
  legend: { textStyle: { color: '#8aa0c0' } },
})
```

- [ ] **Step 4: ChartBox 按 settings 选主题**

把 `frontend/src/charts/ChartBox.vue` 整体替换为：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { getActivePinia } from 'pinia'
import VChart from 'vue-echarts'
import { ENT_THEME, ENT_THEME_DARK } from './echartsTheme'
import { useSettingsStore } from '@/stores/settings'

withDefaults(
  defineProps<{
    option: Record<string, any>
    height?: string
  }>(),
  { height: '320px' },
)

// 无活动 pinia 时（个别不带 store 的测试场景）回退浅色，避免抛错。
const theme = computed(() => {
  if (!getActivePinia()) return ENT_THEME
  return useSettingsStore().theme === 'dark' ? ENT_THEME_DARK : ENT_THEME
})
</script>

<template>
  <div class="chart-box" :style="{ height }">
    <VChart :option="option" :theme="theme" autoresize />
  </div>
</template>

<style scoped>
.chart-box { width: 100%; }
.chart-box :deep(.echarts) { width: 100%; height: 100%; }
</style>
```

- [ ] **Step 5: 跑测试确认通过 + 全量不回归**

Run: `cd frontend && npx vitest run src/charts/ChartBox.test.ts && npm run test:run`
Expected: ChartBox 3 用例 PASS；全量 vitest 全绿（其它图表相关测试因默认浅色仍取 `'ent'`，不受影响）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/charts/echartsTheme.ts frontend/src/charts/ChartBox.vue frontend/src/charts/ChartBox.test.ts
git commit -m "feat(D1): ECharts 双主题 + ChartBox 随 settings 切换

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4：DisplaySettings 显示设置控件

**Files:**
- Create: `frontend/src/components/DisplaySettings.vue`
- Test: `frontend/src/components/DisplaySettings.test.ts`

> 约定：无 emoji，主题与字号都用文字分段控件（浅色/深色、小/中/大）。

- [ ] **Step 1: 写失败测试**

`frontend/src/components/DisplaySettings.test.ts`：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/DisplaySettings.test.ts`
Expected: FAIL（找不到 `DisplaySettings.vue`）。

- [ ] **Step 3: 写组件**

`frontend/src/components/DisplaySettings.vue`：

```vue
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
.display-settings { display: flex; align-items: center; gap: 8px; }
.seg { display: flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.seg-btn { border: none; background: var(--card); color: var(--sub); cursor: pointer;
  font-size: 12px; padding: 4px 10px; }
.seg-btn + .seg-btn { border-left: 1px solid var(--line); }
.seg-btn.on { background: var(--accent); color: #fff; font-weight: 700; }
.seg-btn:hover:not(.on) { color: var(--txt); }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/DisplaySettings.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DisplaySettings.vue frontend/src/components/DisplaySettings.test.ts
git commit -m "feat(D1): DisplaySettings 显示设置控件(主题/字号分段，无 emoji)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5：AppHeader 挂载入口 + 外壳颜色改吃变量

**Files:**
- Modify: `frontend/src/layout/AppHeader.vue`
- Modify: `frontend/src/layout/AppLayout.vue`
- Modify: `frontend/src/layout/AppSidebar.vue`

> 验证：现有 `AppHeader.test.ts`（标题/停止按钮）须仍通过；改色后深色主题在外壳可见。

- [ ] **Step 1: AppHeader 挂 DisplaySettings + 颜色变量化**

把 `frontend/src/layout/AppHeader.vue` 整体替换为：

```vue
<script setup lang="ts">
import { useDataStore } from '@/stores/data'
import { api } from '@/api/client'
import { APP_VERSION } from '@/version'
import DisplaySettings from '@/components/DisplaySettings.vue'

const store = useDataStore()

async function stopServer() {
  if (!confirm('确认停止本地服务？停止后页面将无法继续使用。')) return
  try {
    await api.get('/api/stop')
  } catch {
    // 服务停止时连接会中断，忽略错误
  }
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <span class="title">项目回款跟踪与管控平台</span>
      <span class="version">{{ APP_VERSION }}</span>
    </div>
    <div class="meta">
      <template v-if="store.data">
        <span class="sync-dot" /> 数据已同步
        <span class="date-badge">{{ store.data.meta.lastUpdate }}</span>
      </template>
      <span v-else class="no-data">未加载数据</span>
      <DisplaySettings />
      <button data-test="stop-server" class="stop-btn" title="停止服务" @click="stopServer">■</button>
    </div>
  </header>
</template>

<style scoped>
.app-header { display: flex; justify-content: space-between; align-items: center;
  height: 52px; padding: 0 18px; border-bottom: 1px solid var(--line); background: var(--card); }
.brand { display: flex; align-items: center; gap: 10px; }
.title { font-weight: 700; color: var(--txt); }
.version { font-size: 12px; color: var(--mut); }
.meta { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--sub); }
.sync-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); display: inline-block; }
.date-badge { padding: 2px 8px; background: var(--bg); border-radius: 6px; font-size: 12px; }
.stop-btn { width: 28px; height: 28px; border: 1px solid var(--line); border-radius: 6px;
  background: none; color: var(--danger); cursor: pointer; }
.stop-btn:hover { border-color: var(--danger); background: var(--card2); }
.no-data { color: var(--mut); font-size: 12px; }
</style>
```

- [ ] **Step 2: AppLayout 主区背景变量化**

把 `frontend/src/layout/AppLayout.vue` 的 `<style scoped>` 整段替换为：

```vue
<style scoped>
.app-layout { display: flex; flex-direction: column; height: 100vh; }
.app-body { display: flex; flex: 1; min-height: 0; }
.app-main { flex: 1; overflow: auto; background: var(--bg); }
</style>
```

（`<script setup>` 与 `<template>` 不变。）

- [ ] **Step 3: AppSidebar 颜色变量化**

把 `frontend/src/layout/AppSidebar.vue` 的 `<style scoped>` 整段替换为：

```vue
<style scoped>
.sidebar { width: 220px; border-right: 1px solid var(--line); background: var(--card);
  display: flex; flex-direction: column; transition: width .15s; overflow: hidden; }
.sidebar.collapsed { width: 0; border-right: none; }
.sidebar-nav { flex: 1; overflow-y: auto; padding: 12px 0; }
.section { margin-bottom: 14px; }
.section-label { font-size: 11px; color: var(--mut); padding: 4px 18px; font-weight: 600; }
.group-label { font-size: 12px; color: var(--sub); padding: 6px 18px 2px; }
.nav-item, .nav-sub { display: flex; align-items: center; gap: 8px; padding: 7px 18px;
  font-size: 13px; color: var(--txt); text-decoration: none; }
.nav-sub { padding-left: 30px; font-size: 12px; }
.nav-item:hover, .nav-sub:hover { background: var(--card2); }
.nav-item.active, .nav-sub.active { background: var(--bg); color: var(--accent); font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.sidebar-toggle { width: 16px; border: none; border-right: 1px solid var(--line);
  background: var(--card2); color: var(--sub); cursor: pointer; font-size: 11px; padding: 0; }
.sidebar-toggle:hover { background: var(--bg); color: var(--accent); }
</style>
```

（`<script setup>` 与 `<template>` 不变。）

- [ ] **Step 4: 跑相关测试 + 全量 + 构建**

Run: `cd frontend && npx vitest run src/layout/AppHeader.test.ts && npm run test:run && npm run typecheck && npm run build`
Expected: AppHeader 2 用例 PASS（标题、停止按钮调用 `/api/stop`）；全量 vitest 全绿；typecheck 与 build 通过。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/layout/AppHeader.vue frontend/src/layout/AppLayout.vue frontend/src/layout/AppSidebar.vue
git commit -m "feat(D1): AppHeader 接入显示设置 + 外壳颜色改吃主题变量

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6：验证全绿 + 更新 PROGRESS

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 跑整仓验证**

Run（仓库根）: `bash verify.sh`
Expected: 四步全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。

- [ ] **Step 2: 手动确认（启动一次）**

启动 `python server.py`(:8080) + `cd frontend && npm run dev`，在浏览器：切换浅/深主题（外壳与图表配色随之变化、刷新后保持）、切换字号小/中/大（`<html>` 的 `--fs-base` 改变、刷新后保持）、页面无 `window.onerror` 红条。确认后停掉两个进程。

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md` 顶部"最近更新"改为 D1 完成；在"会话交接备注（Handoff）"区顶部新增一条 `### ✅ Plan D1 完成（2026-06-04）`，记录：分支、各任务提交、产物（theme.css 变量体系 / settings store / DisplaySettings / ECharts 双主题 / 外壳变量化）、范围（仅地基；既有 px 文本随各页 D3-D10 逐步转 rem）、整体进度（Phase D 起步，D1 完成，下一步 D2 全局项目详情面板）。

- [ ] **Step 4: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(D1): PROGRESS 记录 Plan D1 完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 自审（Self-Review）

**1. Spec 覆盖（对照决策 9 与 §4.1）：**
- ① 响应式自适应 → theme.css 的 reset（box-sizing/margin）+ 断点约定注释为基线；外壳已为 flex 流式。**注**：D1 只立地基，各页面具体响应式布局在其各自 plan（D3-D10）落地——已在 spec §5 注明"D1 必须最先，其余吃变量"。
- ② 明/暗双主题 → theme.css 双变量 + html.dark（Task 2）+ settings store 切换（Task 1）+ EP 暗色 css-vars（Task 2）+ ECharts 双主题（Task 3）+ 外壳变量化使可见（Task 5）。✓
- ③ 字号三档 → FONT_PX/`--fs-base`（Task 1）+ html font-size 吃变量（Task 2）+ DisplaySettings 三档（Task 4）。✓ 说明：现有 px 文本不随之缩放，新组件用 rem——已在 Task 6 PROGRESS 与本节注明，属地基的预期边界，非缺口。
- 设置入口 → DisplaySettings 挂 AppHeader（Task 4/5）。✓
- echarts 双主题随主题切换 → Task 3。✓

**2. 占位扫描：** 无 TBD / "适当处理" / 省略代码；每个改动步骤均给出完整文件或完整 style 段与确切命令、预期。✓

**3. 类型/命名一致性：** `Theme`/`FontScale`/`FONT_PX`/`useSettingsStore`/`setTheme`/`toggleTheme`/`setFontScale`/`init`（Task 1）在 Task 3/4/5 引用一致；`ENT_THEME`/`ENT_THEME_DARK`（Task 3）与 ChartBox、测试一致；data-test 名 `display-theme-{light,dark}`/`display-font-{sm,md,lg}`（Task 4）与其测试一致；CSS 变量名（`--bg/--card/--card2/--line/--line2/--txt/--sub/--mut/--accent/--cyan/--danger/--warn/--ok/--fs-base`）在 theme.css 定义、各组件引用一致。✓
