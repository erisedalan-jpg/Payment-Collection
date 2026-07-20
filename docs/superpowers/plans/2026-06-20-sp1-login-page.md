# SP-1 登录页 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全屏 `/login` 登录页：忠实移植 animated-characters 的 4 角色 + 全部动效（品牌色改色），纯前端壳、不接鉴权、不加守卫。

**Architecture:** `AppLayout.vue` 按 `route.meta.fullscreen` 分支裸渲染登录页；`LoginView.vue` 两栏（左 `LoginCharacters` / 右表单）；`LoginCharacters.vue` 4 个纯 CSS 角色由单 `mood` prop 驱动 + 自管鼠标眼随/随机眨眼；表单提交调用 `lib/auth.ts` 桩（SP-2 替换为真请求）。

**Tech Stack:** Vue3 `<script setup>` + TS + Vue Router + Vitest + @vue/test-utils。纯 CSS 图形，无新依赖、无图片/SVG/lottie。

## Global Constraints

- 不使用任何 emoji；需要符号用 `→ ↓ ❌ ✕ ▾`。
- 样式只引用 `frontend/src/styles/theme.css` 令牌，不手写散值；**不引入设计系统外的新色号**——4 角色用本系统分类色 `--chart-1`..`--chart-4`（图表分类色，装饰安全）；状态/品牌色按语义用。
- 字体走 `--font-sans`，前端禁止外链字体；尊重 `prefers-reduced-motion`。
- **SP-1 纯加法**：只新增 `/login`、`LoginView`、`LoginCharacters`、`lib/auth.ts` 与 `AppLayout` 全屏分支；**不加路由守卫**、不接后端、不存登录态、不跳转；现有页面零改动。
- 不改 `frontend/src/version.ts`。
- 逐文件 `git add`，禁止 `git add -A/.`；commit message 结尾恒含一行
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 测试：组件断言走 `findComponent(...).props(...)` / class 断言；router 测试用 `createMemoryHistory`。
- 视觉精修（角色比例/配色微调）是构建后与用户迭代的已知后续项，不在本计划评判范围。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/router/index.ts` | 改 | `RouteMeta` 加 `fullscreen?: boolean`（Task 1）；注册 `/login` 路由（Task 4） |
| `frontend/src/layout/AppLayout.vue` | 改 | `meta.fullscreen` 为真 → 裸 `<router-view/>`（Task 1） |
| `frontend/src/lib/auth.ts` | 建 | 桩 `authenticate(account,password)`（Task 2） |
| `frontend/src/components/LoginCharacters.vue` | 建 | 4 角色 + 动效，单 `mood` prop 驱动（Task 3） |
| `frontend/src/views/LoginView.vue` | 建 | 两栏 + 表单 + 编排（Task 4） |
| `frontend/src/layout/AppLayout.test.ts` | 改 | 加 fullscreen 分支用例（Task 1） |
| `frontend/src/lib/auth.test.ts` | 建 | 桩返回（Task 2） |
| `frontend/src/components/LoginCharacters.test.ts` | 建 | 4 角色 + mood→class（Task 3） |
| `frontend/src/views/LoginView.test.ts` | 建 | 表单编排（Task 4） |

---

### Task 1: AppLayout 全屏分支 + RouteMeta.fullscreen 类型

**Files:**
- Modify: `frontend/src/layout/AppLayout.vue`
- Modify: `frontend/src/router/index.ts`（仅 `RouteMeta` 接口加 `fullscreen?: boolean`，不加路由）
- Test: `frontend/src/layout/AppLayout.test.ts`

**Interfaces:**
- Produces: `RouteMeta.fullscreen?: boolean`；`AppLayout` 在 `meta.fullscreen` 为真时只渲染 `<router-view/>`（无 AppHeader/AppSidebar/FilterBar）。

- [ ] **Step 1: 写失败测试**（append 到 `AppLayout.test.ts`）

```ts
describe('AppLayout fullscreen 分支', () => {
  it('fullscreen 路由只渲染裸 router-view(无 header/sidebar)', async () => {
    const router = makeRouter([
      { path: '/', component: Blank, meta: {} },
      { path: '/login', component: { template: '<div class="routed-login">LOGIN</div>' }, meta: { fullscreen: true } },
    ])
    router.push('/login'); await router.isReady()
    const w = mount(AppLayout, {
      global: { plugins: [createPinia(), router], stubs: { AppHeader: true, AppSidebar: true, ProjectDetailDrawer: true } },
    })
    expect(w.find('.routed-login').exists()).toBe(true)
    expect(w.find('.app-layout').exists()).toBe(false)   // 全屏分支不渲染外壳(Header/Sidebar 均在 .app-layout 内)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/layout/AppLayout.test.ts`
Expected: FAIL（当前 fullscreen 路由仍渲染 .app-layout/header/sidebar）

- [ ] **Step 3: 实现** —— 改 `AppLayout.vue`

`<script setup>` 加 `fullscreen` 计算：

```ts
const route = useRoute()
const fullscreen = computed(() => !!route.meta?.fullscreen)
const showFilter = computed(() => !route.meta?.hideFilter)
```

模板改为分支（fullscreen 裸渲染；否则原结构不变）：

```vue
<template>
  <router-view v-if="fullscreen" />
  <div v-else class="app-layout">
    <AppHeader />
    <div class="app-body">
      <AppSidebar />
      <main class="app-main">
        <FilterBar v-if="showFilter" />
        <router-view />
      </main>
    </div>
    <ProjectDetailDrawer />
  </div>
</template>
```

- [ ] **Step 4: 加 RouteMeta 类型** —— 改 `router/index.ts` 的 `declare module 'vue-router'` 块：

```ts
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    hideFilter?: boolean
    fullscreen?: boolean
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/layout/AppLayout.test.ts`
Expected: PASS（含原有 header/sidebar/filterbar 用例回归）

- [ ] **Step 6: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/layout/AppLayout.vue frontend/src/router/index.ts frontend/src/layout/AppLayout.test.ts
git commit -m "$(printf 'feat(login): AppLayout 全屏分支 + RouteMeta.fullscreen(登录页裸渲染无导航)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: lib/auth.ts 桩

**Files:**
- Create: `frontend/src/lib/auth.ts`
- Test: `frontend/src/lib/auth.test.ts`

**Interfaces:**
- Produces:
  - `export interface AuthResult { ok: boolean; message?: string }`
  - `export async function authenticate(account: string, password: string): Promise<AuthResult>`（SP-1 桩，恒 `{ ok: false, message }`）

- [ ] **Step 1: 写失败测试** —— Create `frontend/src/lib/auth.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { authenticate } from './auth'

describe('authenticate(SP-1 桩)', () => {
  it('恒返回失败 + 提示文案(占位,SP-2 替换)', async () => {
    const r = await authenticate('admin', 'wxtnb')
    expect(r.ok).toBe(false)
    expect(typeof r.message).toBe('string')
    expect(r.message).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/auth.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** —— Create `frontend/src/lib/auth.ts`

```ts
export interface AuthResult {
  ok: boolean
  message?: string
}

// SP-1 桩:恒返回失败,占位触发登录页摇头动效。
// SP-2 替换为真实 POST /api/login(校验账号密码、成功后存登录态/权限集)。
export async function authenticate(account: string, password: string): Promise<AuthResult> {
  void account; void password
  return { ok: false, message: '登录功能开发中（SP-2 接入后端校验）' }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/auth.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/auth.ts frontend/src/lib/auth.test.ts
git commit -m "$(printf 'feat(login): lib/auth authenticate 桩(SP-1 恒失败,SP-2 替换为真校验)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: LoginCharacters.vue（4 角色 + 动效）

**Files:**
- Create: `frontend/src/components/LoginCharacters.vue`
- Test: `frontend/src/components/LoginCharacters.test.ts`

**Interfaces:**
- Produces: 组件 `LoginCharacters`，props `{ mood?: 'idle' | 'account' | 'password' | 'reveal' | 'fail' }`（默认 `'idle'`）。根元素带 `lc` + `lc--<mood>` 类；渲染 4 个 `.lc-char`。自管 `mousemove`（眼随）+ 随机眨眼定时器（挂载加、卸载清理）。

- [ ] **Step 1: 写失败测试** —— Create `frontend/src/components/LoginCharacters.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginCharacters from './LoginCharacters.vue'

describe('LoginCharacters', () => {
  it('渲染 4 个角色,默认 idle', () => {
    const w = mount(LoginCharacters)
    expect(w.findAll('.lc-char')).toHaveLength(4)
    expect(w.find('.lc').classes()).toContain('lc--idle')
  })
  it('mood prop 驱动根类', async () => {
    const w = mount(LoginCharacters, { props: { mood: 'account' } })
    expect(w.find('.lc').classes()).toContain('lc--account')
    await w.setProps({ mood: 'password' })
    expect(w.find('.lc').classes()).toContain('lc--password')
    await w.setProps({ mood: 'reveal' })
    expect(w.find('.lc').classes()).toContain('lc--reveal')
    await w.setProps({ mood: 'fail' })
    expect(w.find('.lc').classes()).toContain('lc--fail')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/LoginCharacters.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现** —— Create `frontend/src/components/LoginCharacters.vue`

```vue
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'

type Mood = 'idle' | 'account' | 'password' | 'reveal' | 'fail'
const props = withDefaults(defineProps<{ mood?: Mood }>(), { mood: 'idle' })

// 眼随鼠标:瞳孔相对视口中心偏移,归一化后缩放到 ±3px
const eye = reactive({ x: 0, y: 0 })
function onMove(e: MouseEvent) {
  const cx = window.innerWidth / 2 || 1
  const cy = window.innerHeight / 2 || 1
  eye.x = Math.max(-1, Math.min(1, (e.clientX - cx) / cx)) * 3
  eye.y = Math.max(-1, Math.min(1, (e.clientY - cy) / cy)) * 3
}

// 随机眨眼
const blinking = ref(false)
let blinkTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
function scheduleBlink() {
  blinkTimer = setTimeout(() => {
    blinking.value = true
    closeTimer = setTimeout(() => { blinking.value = false; scheduleBlink() }, 160)
  }, 2000 + Math.random() * 3000)
}

onMounted(() => { window.addEventListener('mousemove', onMove); scheduleBlink() })
onUnmounted(() => {
  window.removeEventListener('mousemove', onMove)
  if (blinkTimer) clearTimeout(blinkTimer)
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <div class="lc" :class="[`lc--${props.mood}`, { 'lc--blink': blinking }]"
       :style="{ '--eye-x': eye.x + 'px', '--eye-y': eye.y + 'px' }">
    <div v-for="i in 4" :key="i" class="lc-char" :class="`lc-char--${i}`">
      <div class="lc-face">
        <span class="lc-eye"><i class="lc-pupil" /></span>
        <span class="lc-eye"><i class="lc-pupil" /></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lc { display: flex; gap: var(--sp-3); align-items: flex-end; justify-content: center; }
.lc-char { position: relative; width: 84px; height: 116px; transition: transform var(--dur-2) var(--ease); }
.lc-char--1 { background: var(--chart-1); border-radius: var(--r-lg); }
.lc-char--2 { background: var(--chart-2); border-radius: var(--r-md); height: 134px; }
.lc-char--3 { background: var(--chart-3); border-radius: 999px 999px var(--r-sm) var(--r-sm); height: 84px; } /* 半圆顶 */
.lc-char--4 { background: var(--chart-4); border-radius: var(--r-lg); height: 104px; }
.lc-face { position: absolute; top: 20px; left: 0; right: 0; display: flex; gap: 12px; justify-content: center; }
.lc-eye { width: 16px; height: 16px; border-radius: var(--r-full); background: var(--card); display: grid; place-items: center; overflow: hidden; transition: transform var(--dur-1) var(--ease); }
.lc-pupil { width: 7px; height: 7px; border-radius: var(--r-full); background: var(--txt); transform: translate(var(--eye-x, 0), var(--eye-y, 0)); transition: transform var(--dur-1) var(--ease); }

/* 眨眼 */
.lc--blink .lc-eye { transform: scaleY(.12); }

/* 账号聚焦:两两内倾"互相对视" */
.lc--account .lc-char--1, .lc--account .lc-char--2 { transform: rotate(6deg); }
.lc--account .lc-char--3, .lc--account .lc-char--4 { transform: rotate(-6deg); }
.lc--account .lc-char--1 .lc-pupil, .lc--account .lc-char--2 .lc-pupil { transform: translateX(3px); }
.lc--account .lc-char--3 .lc-pupil, .lc--account .lc-char--4 .lc-pupil { transform: translateX(-3px); }

/* 密码聚焦:扭头 + 眯眼遮挡(不看密码) */
.lc--password .lc-char { transform: rotate(-4deg); }
.lc--password .lc-eye { transform: scaleY(.18); }

/* 显示密码:望向远方 + 1 号偶尔偷瞄 */
.lc--reveal .lc-pupil { transform: translateY(-3px); }
.lc--reveal .lc-char--1 .lc-pupil { animation: lc-peek 2.4s steps(1) infinite; }
@keyframes lc-peek { 0%, 80% { transform: translateY(-3px); } 85%, 95% { transform: translateY(2px); } 100% { transform: translateY(-3px); } }

/* 登录失败:摇头 */
.lc--fail .lc-char { animation: lc-shake .5s var(--ease); }
@keyframes lc-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px) rotate(-3deg); } 40% { transform: translateX(6px) rotate(3deg); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }

@media (prefers-reduced-motion: reduce) {
  .lc-char, .lc-eye, .lc-pupil { transition: none !important; animation: none !important; }
}
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/LoginCharacters.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/components/LoginCharacters.vue frontend/src/components/LoginCharacters.test.ts
git commit -m "$(printf 'feat(login): LoginCharacters 4 角色+动效(眼随/眨眼/对视/遮眼/偷瞄/摇头,品牌色)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: LoginView.vue + 注册 /login 路由

**Files:**
- Create: `frontend/src/views/LoginView.vue`
- Modify: `frontend/src/router/index.ts`（import LoginView + 加 `/login` 路由）
- Test: `frontend/src/views/LoginView.test.ts`

**Interfaces:**
- Consumes: `LoginCharacters`（Task 3，prop `mood`）、`authenticate`/`AuthResult`（Task 2）、`RouteMeta.fullscreen`（Task 1）。
- Produces: 路由 `{ path: '/login', name: 'login', component: LoginView, meta: { title: '登录', fullscreen: true } }`。

- [ ] **Step 1: 写失败测试** —— Create `frontend/src/views/LoginView.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginView from './LoginView.vue'
import LoginCharacters from '@/components/LoginCharacters.vue'

const authMock = vi.fn(async () => ({ ok: false, message: '后端校验未接入' }))
vi.mock('@/lib/auth', () => ({ authenticate: (...a: any[]) => authMock(...a) }))

beforeEach(() => { authMock.mockClear() })

function mountLV() {
  return mount(LoginView, { global: { stubs: { LoginCharacters: false } } })
}

describe('LoginView', () => {
  it('渲染角色 + 账号/密码输入 + 登录按钮', () => {
    const w = mountLV()
    expect(w.findComponent(LoginCharacters).exists()).toBe(true)
    expect(w.find('input[autocomplete="username"]').exists()).toBe(true)
    expect(w.find('input[autocomplete="current-password"]').exists()).toBe(true)
    expect(w.find('.lv-submit').exists()).toBe(true)
  })
  it('账号聚焦→mood=account;密码聚焦→mood=password', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="username"]').trigger('focus')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('account')
    await w.find('input[autocomplete="current-password"]').trigger('focus')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('password')
  })
  it('显示密码切换:type 变 text + mood=reveal(聚焦密码语境)', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="current-password"]').trigger('focus')
    await w.find('.lv-eye-btn').trigger('click')
    expect(w.find('input[autocomplete="current-password"]').attributes('type')).toBe('text')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('reveal')
  })
  it('空表单提交:不调用 authenticate,显示校验提示', async () => {
    const w = mountLV()
    await w.find('form').trigger('submit')
    expect(authMock).not.toHaveBeenCalled()
    expect(w.find('[data-test="lv-error"]').text()).toContain('请输入账号和密码')
  })
  it('非空提交:调用 authenticate,失败→mood=fail+显示返回 message', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="username"]').setValue('admin')
    await w.find('input[autocomplete="current-password"]').setValue('wxtnb')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick()
    expect(authMock).toHaveBeenCalledWith('admin', 'wxtnb')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('fail')
    expect(w.find('[data-test="lv-error"]').text()).toContain('后端校验未接入')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/LoginView.test.ts`
Expected: FAIL（LoginView 不存在）

- [ ] **Step 3: 实现** —— Create `frontend/src/views/LoginView.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import LoginCharacters from '@/components/LoginCharacters.vue'
import { authenticate } from '@/lib/auth'

type Mood = 'idle' | 'account' | 'password' | 'reveal' | 'fail'
const account = ref('')
const password = ref('')
const showPassword = ref(false)
const mood = ref<Mood>('idle')
const error = ref('')

function onAccountFocus() { mood.value = 'account' }
function onPasswordFocus() { mood.value = showPassword.value ? 'reveal' : 'password' }
function onBlur() { if (mood.value !== 'fail') mood.value = 'idle' }
function toggleShow() {
  showPassword.value = !showPassword.value
  if (mood.value === 'password' || mood.value === 'reveal') {
    mood.value = showPassword.value ? 'reveal' : 'password'
  }
}
async function onSubmit() {
  error.value = ''
  if (!account.value || !password.value) { error.value = '请输入账号和密码'; return }
  const res = await authenticate(account.value, password.value)
  if (!res.ok) { mood.value = 'fail'; error.value = res.message || '登录失败' }
  // SP-1 不跳转/不存登录态;成功分支留 SP-2。
}
</script>

<template>
  <div class="lv">
    <section class="lv-left">
      <LoginCharacters :mood="mood" />
    </section>
    <section class="lv-right">
      <form class="lv-form" @submit.prevent="onSubmit">
        <h1 class="lv-title">项目管理平台</h1>
        <p class="lv-sub">登录以继续</p>
        <label class="lv-field">
          <span class="lv-label">账号</span>
          <input class="lv-input" v-model="account" type="text" autocomplete="username"
                 placeholder="请输入账号" @focus="onAccountFocus" @blur="onBlur" />
        </label>
        <label class="lv-field">
          <span class="lv-label">密码</span>
          <span class="lv-pw">
            <input class="lv-input" v-model="password" :type="showPassword ? 'text' : 'password'"
                   autocomplete="current-password" placeholder="请输入密码" @focus="onPasswordFocus" @blur="onBlur" />
            <button class="lv-eye-btn" type="button" @click="toggleShow">{{ showPassword ? '隐藏' : '显示' }}</button>
          </span>
        </label>
        <p v-if="error" class="lv-error" data-test="lv-error">{{ error }}</p>
        <button class="lv-submit" type="submit">
          <span class="lv-submit-text">登 录</span>
          <span class="lv-submit-arrow">→</span>
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.lv { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; background: var(--bg); }
.lv-left { display: flex; align-items: center; justify-content: center; background: var(--card2); padding: var(--sp-6); }
.lv-right { display: flex; align-items: center; justify-content: center; padding: var(--sp-6); }
.lv-form { width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-1); padding: var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-3); }
.lv-title { font-size: var(--fs-5); font-weight: 700; color: var(--txt); margin: 0; }
.lv-sub { font-size: var(--fs-1); color: var(--mut); margin: 0 0 var(--sp-2); }
.lv-field { display: flex; flex-direction: column; gap: var(--sp-1); }
.lv-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.lv-input { width: 100%; box-sizing: border-box; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--txt); font-size: var(--fs-2); font-family: var(--font-sans); transition: border-color var(--dur-1) var(--ease); }
.lv-input:focus { outline: none; border-color: var(--accent); }
.lv-pw { display: flex; align-items: center; gap: var(--sp-2); }
.lv-eye-btn { flex: none; padding: var(--sp-1) var(--sp-2); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.lv-eye-btn:hover { color: var(--accent); }
.lv-error { margin: 0; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-sm); background: var(--danger-bg); color: var(--danger-text); font-size: var(--fs-1); }
.lv-submit { position: relative; overflow: hidden; height: 40px; border: none; border-radius: var(--r-sm); background: var(--accent); color: var(--on-accent); cursor: pointer; font-size: var(--fs-2); font-weight: 600; }
.lv-submit-text { display: inline-block; transition: transform var(--dur-2) var(--ease), opacity var(--dur-2) var(--ease); }
.lv-submit-arrow { position: absolute; inset: 0; display: grid; place-items: center; transform: translateX(120%); transition: transform var(--dur-2) var(--ease); }
.lv-submit:hover .lv-submit-text { transform: translateX(-120%); opacity: 0; }
.lv-submit:hover .lv-submit-arrow { transform: translateX(0); }
@media (max-width: 768px) {
  .lv { grid-template-columns: 1fr; }
  .lv-left { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .lv-submit-text, .lv-submit-arrow, .lv-input { transition: none !important; }
}
</style>
```

- [ ] **Step 4: 注册 /login 路由** —— 改 `router/index.ts`

顶部 import 区加：

```ts
import LoginView from '@/views/LoginView.vue'
```

在 `routes: [` 内（建议放在第一条，登录页独立）加：

```ts
    { path: '/login', name: 'login', component: LoginView, meta: { title: '登录', fullscreen: true } },
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/LoginView.test.ts src/router/index.test.ts`
Expected: PASS（LoginView 5 用例 + 既有路由用例不破）

- [ ] **Step 6: typecheck + build + 提交**

```bash
cd frontend && npm run typecheck && npm run build
```
Expected: 均成功

```bash
git add frontend/src/views/LoginView.vue frontend/src/router/index.ts frontend/src/views/LoginView.test.ts
git commit -m "$(printf 'feat(login): LoginView 两栏登录页(表单/显隐/校验/桩提交)+ 注册 /login 全屏路由\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## 收尾验证（全部任务后）

```bash
bash verify.sh
```
Expected: 全绿（typecheck + vitest + build）。

手动冒烟（`python server.py` + `cd frontend && npm run dev`）：
- 访问 `/login`：全屏、无 Header/Sidebar/FilterBar；角色随鼠标转眼、随机眨眼。
- 账号框聚焦角色对视、密码框聚焦扭头遮眼、点“显示”角色望远偶尔偷瞄。
- 空提交拦截提示；非空提交（任意账号）触发摇头 + “开发中”提示（桩，SP-1 不真登录）。
- 其余页面（`/`、`/data` 等）行为不变、无需登录即可访问（守卫是 SP-3）。
- 视觉精修（角色比例/配色）按用户反馈迭代——属预期后续，非缺陷。
