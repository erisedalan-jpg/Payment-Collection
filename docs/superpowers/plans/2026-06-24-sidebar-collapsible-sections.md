# 侧边栏分区可折叠 Implementation Plan (SP-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让左侧边栏每个导航分区标题可点击展开/收起子链接，默认只展开当前页所在分区，折叠态持久化，缩短过长侧栏。

**Architecture:** `stores/ui.ts` 新增"显式覆盖" map `sectionExpanded` + `setSection`（localStorage 持久化）；`AppSidebar.vue` 分区标题改可点击 button + `▾/▸`，子链接包 `v-show="expanded(key)"`，`expanded(key)=覆盖值 ?? (key===当前路由所属分区)`。与既有"整条侧栏折叠"正交。

**Tech Stack:** Vue3 + TS + Pinia + vue-router + vitest；样式用 theme.css 令牌。

## Global Constraints

> 每个任务隐含包含本节，值逐字照抄。

- **分区 key**（稳定）：`project` / `analysis` / `payment` / `tools` / `admin`。
- **localStorage 键**：`sidebar_sections`（值为 `Record<string, boolean>` 的 JSON）。现有整条折叠键 `sidebar_collapsed` 不动。
- **默认展开规则**：`expanded(key) = ui.sectionExpanded[key] === undefined ? key === activeSectionKey : ui.sectionExpanded[key]`。即未手动设置过 → 仅当前路由所属分区展开；设置过 → 以显式布尔为准。
- **活动分区判定**（`route.path` 前缀）：`/insight*`→`analysis`；`/payment*` 或 `/ledger`→`payment`；`/data` 或 `/governance` 或 `/about`→`tools`；`/admin`→`admin`；其余（`/`、`/projects*`、`/activity`、`/project/*`）→`project`。
- **折叠用 `v-show`**（非 v-if）：折叠态 `display:none`，移出布局/Tab 焦点，但 DOM 保留（不破坏现有 `.nav-sub` 计数与 `text()` 断言）。
- **不改**：导航分区内容/顺序/权限；整条侧栏折叠；不加批量展开/收起按钮（YAGNI）；不实现 `keyfollowup`（SP-2）。
- **版本**：`frontend/src/version.ts` → `APP_VERSION='V1.19.2'`、`RELEASE_DATE='2026-06-24'`。
- 禁止 emoji（`▾/▸` 为几何符号，非 emoji，允许）；简体中文。
- commit message 末尾必须是：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- spec/plan 文档写盘不 commit（项目约定）。

---

### Task 1: ui store 分区折叠态 + 持久化

**Files:**
- Modify: `frontend/src/stores/ui.ts`
- Test: `frontend/src/stores/ui.test.ts`

**Interfaces:**
- Produces: `useUiStore()` 暴露 `sectionExpanded: Ref<Record<string, boolean>>`（初值读 `localStorage['sidebar_sections']`，缺失/损坏→`{}`）与 `setSection(key: string, value: boolean): void`（写入并持久化）。现有 `sidebarCollapsed`/`toggleSidebar` 不变。

- [ ] **Step 1: 写失败测试**

`frontend/src/stores/ui.test.ts`，在 `describe('ui store', ...)` 之后追加新 describe（文件已有 `beforeEach` 清 localStorage + setActivePinia）：

```typescript
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/ui.test.ts`
Expected: FAIL（`ui.sectionExpanded` / `ui.setSection` undefined）

- [ ] **Step 3: 实现 store 改动**

`frontend/src/stores/ui.ts` 完整替换为：

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

const KEY = 'sidebar_collapsed'
const SECTIONS_KEY = 'sidebar_sections'

function loadSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY)
    if (raw) {
      const o = JSON.parse(raw)
      if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, boolean>
    }
  } catch {
    /* localStorage 不可用/损坏 → 空 */
  }
  return {}
}

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(localStorage.getItem(KEY) === 'true')

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    localStorage.setItem(KEY, String(sidebarCollapsed.value))
  }

  // 分区折叠:仅存用户手动覆盖(显式布尔);未设置的分区由组件按"是否当前路由所属分区"算默认
  const sectionExpanded = ref<Record<string, boolean>>(loadSections())

  function setSection(key: string, value: boolean) {
    sectionExpanded.value = { ...sectionExpanded.value, [key]: value }
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(sectionExpanded.value))
    } catch {
      /* 忽略写入失败(隐私模式/配额) */
    }
  }

  return { sidebarCollapsed, toggleSidebar, sectionExpanded, setSection }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/stores/ui.test.ts`
Expected: PASS（原 3 用例 + 新 5 用例全过）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/ui.ts frontend/src/stores/ui.test.ts
git commit -m "feat(fe): ui store 加 sectionExpanded/setSection(侧边栏分区折叠态持久化)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: AppSidebar 分区可折叠渲染 + 版本 V1.19.2 + 验证

**Files:**
- Modify: `frontend/src/layout/AppSidebar.vue`
- Modify: `frontend/src/version.ts`
- Test: `frontend/src/layout/AppSidebar.test.ts`

**Interfaces:**
- Consumes: `useUiStore().sectionExpanded`、`useUiStore().setSection`（Task 1）。

- [ ] **Step 1: 写失败测试**

`frontend/src/layout/AppSidebar.test.ts`，在文件末尾追加新 describe（文件已有 `makeRouter()`、`beforeEach` 清 localStorage + setActivePinia；需 `import { useUiStore } from '@/stores/ui'` 已存在）：

```typescript
describe('AppSidebar 分区可折叠', () => {
  async function mountAt(path: string) {
    const router = makeRouter()
    router.push(path)
    await router.isReady()
    const a = useAuthStore()
    a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: [], allowedL4: [] }
    return mount(AppSidebar, { global: { plugins: [router] } })
  }
  const sec = (w: ReturnType<typeof mount>, anchor: string) =>
    w.findAll('.section').find((s) => s.text().includes(anchor))!

  it('默认仅展开当前页所在分区(route / → project 展开, analysis 收起)', async () => {
    const w = await mountAt('/')
    expect(sec(w, '在建项目').classes()).not.toContain('collapsed')      // project 展开
    expect(sec(w, '项目多维分析').classes()).toContain('collapsed')       // analysis 收起
  })

  it('route /insight → analysis 展开, project 收起', async () => {
    const w = await mountAt('/insight')
    expect(sec(w, '项目多维分析').classes()).not.toContain('collapsed')
    expect(sec(w, '在建项目').classes()).toContain('collapsed')
  })

  it('点击分区标题切换展开态并写 ui.sectionExpanded', async () => {
    const ui = useUiStore()
    const w = await mountAt('/')
    const analysis = sec(w, '项目多维分析')
    expect(analysis.classes()).toContain('collapsed')                    // 默认收起
    await analysis.find('.section-label').trigger('click')
    expect(ui.sectionExpanded['analysis']).toBe(true)
    expect(sec(w, '项目多维分析').classes()).not.toContain('collapsed')   // 点开
  })

  it('已手动展开的分区在非活动页仍保持展开(覆盖默认)', async () => {
    localStorage.setItem('sidebar_sections', JSON.stringify({ payment: true }))
    const w = await mountAt('/')   // 活动分区是 project,但 payment 被手动置 true
    expect(sec(w, '回款台账').classes()).not.toContain('collapsed')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/layout/AppSidebar.test.ts`
Expected: FAIL（`.section` 无 `collapsed` 类、无 `.section-label` 按钮可点击）

- [ ] **Step 3: 实现 AppSidebar 折叠**

`frontend/src/layout/AppSidebar.vue` 完整替换为：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { PROJECT_LINKS, ANALYSIS_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'

const ui = useUiStore()
const auth = useAuthStore()
const route = useRoute()
const projectLinks = computed(() => PROJECT_LINKS.filter((l) => auth.canAccess(l.key)))
const analysisLinks = computed(() => ANALYSIS_LINKS.filter((l) => auth.canAccess(l.key)))
const paymentLinks = computed(() => PAYMENT_LINKS.filter((l) => auth.canAccess(l.key)))
const toolLinks = computed(() => TOOL_LINKS.filter((l) => auth.canAccess(l.key)))

const activeSectionKey = computed(() => {
  const p = route.path
  if (p.startsWith('/insight')) return 'analysis'
  if (p.startsWith('/payment') || p.startsWith('/ledger')) return 'payment'
  if (p.startsWith('/data') || p.startsWith('/governance') || p.startsWith('/about')) return 'tools'
  if (p.startsWith('/admin')) return 'admin'
  return 'project'
})
function expanded(key: string): boolean {
  const v = ui.sectionExpanded[key]
  return v === undefined ? key === activeSectionKey.value : v
}
function onToggle(key: string) {
  ui.setSection(key, !expanded(key))
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <nav class="sidebar-nav">
      <div v-if="projectLinks.length" class="section" :class="{ collapsed: !expanded('project') }">
        <button type="button" class="section-label" @click="onToggle('project')">
          <span class="section-caret">{{ expanded('project') ? '▾' : '▸' }}</span>项目
        </button>
        <div v-show="expanded('project')" class="section-links">
          <RouterLink v-for="link in projectLinks" :key="link.to" :to="link.to"
            class="nav-item" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="analysisLinks.length" class="section" :class="{ collapsed: !expanded('analysis') }">
        <button type="button" class="section-label" @click="onToggle('analysis')">
          <span class="section-caret">{{ expanded('analysis') ? '▾' : '▸' }}</span>项目分析
        </button>
        <div v-show="expanded('analysis')" class="section-links">
          <RouterLink v-for="link in analysisLinks" :key="link.to" :to="link.to"
            class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="paymentLinks.length" class="section" :class="{ collapsed: !expanded('payment') }">
        <button type="button" class="section-label" @click="onToggle('payment')">
          <span class="section-caret">{{ expanded('payment') ? '▾' : '▸' }}</span>回款<span class="section-tag">重点子域</span>
        </button>
        <div v-show="expanded('payment')" class="section-links">
          <RouterLink v-for="link in paymentLinks" :key="link.to" :to="link.to"
            class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="toolLinks.length" class="section" :class="{ collapsed: !expanded('tools') }">
        <button type="button" class="section-label" @click="onToggle('tools')">
          <span class="section-caret">{{ expanded('tools') ? '▾' : '▸' }}</span>工具
        </button>
        <div v-show="expanded('tools')" class="section-links">
          <RouterLink v-for="link in toolLinks" :key="link.to" :to="link.to"
            class="nav-item" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="auth.isSuper" class="section" :class="{ collapsed: !expanded('admin') }">
        <button type="button" class="section-label" @click="onToggle('admin')">
          <span class="section-caret">{{ expanded('admin') ? '▾' : '▸' }}</span>系统管理
        </button>
        <div v-show="expanded('admin')" class="section-links">
          <RouterLink to="/admin" class="nav-item" active-class="active">账号管理</RouterLink>
        </div>
      </div>
    </nav>
  </aside>
  <button data-test="sidebar-toggle" class="sidebar-toggle" title="折叠/展开菜单"
    @click="ui.toggleSidebar()">{{ ui.sidebarCollapsed ? '››' : '‹‹' }}</button>
</template>

<style scoped>
.sidebar { width: 220px; border-right: 1px solid var(--line); background: var(--card);
  display: flex; flex-direction: column; transition: width .15s; overflow: hidden; }
.sidebar.collapsed { width: 0; border-right: none; }
.sidebar-nav { flex: 1; overflow-y: auto; padding: var(--sp-3) 0; }
.section { margin-bottom: var(--sp-4); }
.section-label { display: flex; align-items: center; width: 100%; background: none; border: 0;
  font-family: inherit; font-size: var(--fs-1); color: var(--mut); padding: var(--sp-1) var(--sp-4);
  font-weight: 600; text-align: left; cursor: pointer; }
.section-label:hover { background: var(--hover-tint); }
.section-caret { display: inline-block; width: 12px; margin-right: var(--sp-2); color: var(--mut); font-size: var(--fs-1); }
.group-label { font-size: var(--fs-1); color: var(--sub); padding: var(--sp-2) var(--sp-4) 2px; }
.nav-item, .nav-sub { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-2); color: var(--txt); text-decoration: none; }
.nav-sub { padding-left: 30px; font-size: var(--fs-1); }
.nav-item:hover, .nav-sub:hover { background: var(--card2); }
.nav-item.active, .nav-sub.active { background: var(--bg); color: var(--accent); font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.sidebar-toggle { width: 16px; border: none; border-right: 1px solid var(--line);
  background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: 0; }
.sidebar-toggle:hover { background: var(--bg); color: var(--accent); }
.section-tag { margin-left: var(--sp-2); font-weight: 400; font-size: var(--fs-1); color: var(--mut); }
.nav-sub2 { padding-left: 42px; }
</style>
```

- [ ] **Step 4: 跑 AppSidebar 测试（新 + 旧回归）确认通过**

Run: `cd frontend && npx vitest run src/layout/AppSidebar.test.ts`
Expected: PASS（新增 4 用例 + 原有渲染/整条折叠/权限过滤/系统管理用例全过；v-show 保 DOM 故 `.nav-sub` 计数=12 与 `text()` 断言不受影响）

- [ ] **Step 5: 版本号 V1.19.2**

`frontend/src/version.ts`：

```typescript
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.19.2'
export const RELEASE_DATE = '2026-06-24'
```

- [ ] **Step 6: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/layout/AppSidebar.vue frontend/src/layout/AppSidebar.test.ts frontend/src/version.ts
git commit -m "feat(fe): 侧边栏分区可折叠(默认仅展开当前页分区) + V1.19.2" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（对 spec §3）：**
- §3.1 ui store sectionExpanded/setSection + 持久化 → Task 1 ✅
- §3.2 组件 activeSectionKey/expanded/onToggle/button 标题/v-show/collapsed 类 → Task 2 ✅
- §3.3 样式 button 重置 + section-caret → Task 2 Step 3 样式块 ✅
- §4 边界（localStorage 损坏降级、权限空分区 v-if、整条折叠正交、活动分区可收起）→ Task1 损坏降级测试 + Task2 expanded 逻辑 ✅
- §5 测试（回归 + 默认/活动/切换/持久化）→ Task1 5 用例 + Task2 4 用例 ✅
- §6 版本 V1.19.2 → Task 2 Step 5 ✅

**2. Placeholder scan：** 无 TBD/TODO；每步含完整代码。✅

**3. Type consistency：**
- `sectionExpanded: Record<string,boolean>`、`setSection(key,value)` 在 Task 1 定义、Task 2 消费，签名一致。✅
- 分区 key 字符串 `project/analysis/payment/tools/admin` 在 activeSectionKey、模板 `expanded('x')`/`onToggle('x')`、测试锚点一致。✅
- localStorage 键 `sidebar_sections` 在 store、Task1 测试、Task2 测试一致。✅
- `v-show` 保 DOM → 现有 `.nav-sub`=12 断言不破（已在 Task2 Step4 注明）。✅
