# SP-1 登录页 UI 设计（权限控制功能 第 1 子项目）

> 权限控制大功能的第 1 个子项目：**纯前端登录页 UI 壳**，忠实移植 animated-characters 登录（huangj17/login-animated-characters）的造型与全部动效，配色改用本系统品牌色板。
> **本子项目不接真鉴权、不加路由守卫**——只新增 `/login` 页与全屏外壳分支，纯加法、现有页面零改动。真校验/守卫/数据隔离在后续 SP-2~SP-5。

## 0. 背景与父功能分解

用户要给系统加一套权限控制 + 登录界面，控制两类：① 可访问页面；② 可查看数据量（L4 隔离）。账号由超管统一配置、后端校验，下级管理员无改密。**威胁模型已定（用户拍板）= 折中：登录/页面门禁走前端守卫 + 后端 token 校验；L4 数据隔离在后端切 `analysis_data.json` 后下发。**

父功能拆 5 子项目，各自 spec→plan→实现：

| SP | 子项目 | 状态 |
|----|--------|------|
| **SP-1** | 登录页 UI（本 spec） | 设计中 |
| SP-2 | 后端鉴权 + 账号/权限模型 | 待 brainstorm |
| SP-3 | 页面访问控制（前端守卫 + 后端 token 校验） | 待 brainstorm |
| SP-4 | 数据量控制（后端按 allowedL4 切数据） | 待 brainstorm |
| SP-5 | 超管管理界面（建号/调权） | 待 brainstorm |

SP-1 先做（用户意愿）：自包含视觉交付，不依赖后端。

## 1. 范围与非目标

**范围**：
- 新增全屏路由 `/login` + `LoginView.vue`（左角色 / 右表单 两栏）。
- 新增 `LoginCharacters.vue`：4 个纯 CSS 角色 + 全部动效。
- `AppLayout.vue` 加 `route.meta.fullscreen` 分支：登录页只渲染裸 `<router-view/>`（无 Header/Sidebar/FilterBar）。
- 表单（账号 + 密码 + 显隐切换 + 登录按钮），提交调用**桩** `authenticate(account, password)`。

**非目标（明确不做，留后续 SP）**：
- 不接后端 `/api/login`、不存 token、不做真校验（SP-2）。
- 不加“未登录重定向 `/login`”路由守卫——`/login` 现在只是一个可访问的新页，App 其余照常无需登录即可用（SP-3 才加守卫）。
- 不做 L4 数据隔离（SP-4）、不做超管界面（SP-2 提供的“Google 登录”一律去掉，本系统无第三方登录）。

## 2. 全局约束（写入 plan 的 Global Constraints，逐字遵循）

- 不使用任何 emoji；需要符号用 `→ ↓ ❌ ✕ ▾`。
- 样式只引用 `frontend/src/styles/theme.css` 令牌，不手写散值；**不引入设计系统外的新色号**（“全站不引入第 16 色”硬约束）——4 个角色取本系统品牌/图表/状态色板内的可区分色。
- 字体走 `--font-sans` 系统栈，前端禁止外链字体。
- 提交逐文件 `git add`，禁止 `git add -A/.`；commit message 结尾恒含一行
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不改 `frontend/src/version.ts`（SP-1 是子页新增，版本号等整套权限功能完成或用户指示时再统一定；本子项目不动版本）。

## 3. 架构与文件

```
/login (meta.fullscreen) ── AppLayout 全屏分支(裸 router-view)
        │
        v
   LoginView.vue ── 左:<LoginCharacters :mood/> ── 纯CSS角色+动效(自管鼠标/眨眼)
                 └─ 右:表单(账号/密码/显隐/登录) ── 提交→ authenticate() 桩
```

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/router/index.ts` | 改 | 加 `/login` 路由（`meta:{ fullscreen:true }`） |
| `frontend/src/layout/AppLayout.vue` | 改 | `route.meta.fullscreen` 为真时只渲染裸 `<router-view/>` |
| `frontend/src/views/LoginView.vue` | 建 | 两栏布局 + 表单 + 状态编排（焦点/显隐/失败→驱动 mood） |
| `frontend/src/components/LoginCharacters.vue` | 建 | 4 角色纯 CSS 造型 + 动效，按 `mood` prop 反应；自管 mousemove 眼随、随机眨眼 |
| `frontend/src/lib/auth.ts` | 建 | 桩 `authenticate(account, password)`（SP-2 替换为真请求） |
| 对应 `*.test.ts` | 建 | 三件套 vitest |

**组件拆分理由**：动画/造型（LoginCharacters）与表单/编排（LoginView）职责分离，各自可独立测试；LoginCharacters 由 `mood` 单 prop 驱动，无业务依赖。

## 4. 交互行为 → 状态模型

`LoginCharacters` 由单 prop `mood` 驱动，类型：

```ts
type Mood = 'idle' | 'account' | 'password' | 'reveal' | 'fail'
```

LoginView 依表单事件设置 mood：

| 触发 | mood | 角色表现（忠实原版） |
|---|---|---|
| 初始/失焦 | `idle` | 眼随鼠标转、身体微倾；紫/黑(改色后对应两角色)随机眨眼 |
| 账号框 focus | `account` | 角色互相对视 |
| 密码框 focus（未显示明文） | `password` | 扭头回避、遮眼，不看密码 |
| 点“显示密码”后 | `reveal` | 望向远方，1 号角色偶尔偷瞄 |
| 登录失败 | `fail` | 失望表情 + 摇头（一次性动画；下次输入/聚焦后回 `idle`/`account`） |
| 登录按钮 hover | （CSS） | 文字滑出、品牌底 + 箭头滑入（纯 CSS hover，不经 mood） |

**实现要点（交给 plan/实现，spec 仅定契约）**：
- 眼随鼠标：`LoginCharacters` 内部挂 `mousemove`，按瞳孔相对角色中心的偏移做 transform；`password`/`reveal` 态下眼被遮/望远，不跟随。组件卸载时移除监听。
- 随机眨眼：内部 `setTimeout` 循环随机间隔切眨眼态；卸载清理。
- `fail` 一次性：mood='fail' 时上 shake 动画类；LoginView 在桩返回失败时设 `fail`，并在下次输入/聚焦时复位。
- 尊重 `prefers-reduced-motion`（设计规范）：减弱动效时眨眼/摇头/眼随退化为静态或极简过渡。

## 5. 表单与桩鉴权

- 字段：`account`（账号，文本）、`password`（密码，type 随显隐切换 text/password）。占位/标签中文：账号 / 密码。
- 显隐切换：按钮切 `showPassword`，同时把 mood 切到 `reveal`（显示明文时）或 `password`（隐藏回密码态且仍聚焦时）。
- 登录按钮：点按/回车提交。
- 校验：账号、密码任一为空 → 不调用桩，按钮区给轻提示（文案“请输入账号和密码”，用 `--danger-text`/`--warn-bg` 三态淡底深字，不实底白字）。
- 桩 `authenticate(account, password)`（`lib/auth.ts`）：

```ts
export interface AuthResult { ok: boolean; message?: string }
// SP-1 桩:恒返回失败,占位触发摇头;SP-2 替换为 POST /api/login。
export async function authenticate(account: string, password: string): Promise<AuthResult> {
  return { ok: false, message: '登录功能开发中（SP-2 接入后端校验）' }
}
```

- 提交流程：非空 → `await authenticate()` → `ok===false` 时 mood='fail' + 显示 `result.message`。SP-1 不跳转、不存登录态（无真鉴权）。

## 6. 外壳全屏分支

`AppLayout.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
// ...既有 import
const route = useRoute()
const fullscreen = computed(() => !!route.meta?.fullscreen)
const showFilter = computed(() => !route.meta?.hideFilter)
</script>

<template>
  <router-view v-if="fullscreen" />
  <div v-else class="app-layout">
    <!-- 既有 Header/Sidebar/FilterBar/router-view 结构不变 -->
  </div>
</template>
```

路由：`{ path: '/login', name: 'login', component: LoginView, meta: { title: '登录', fullscreen: true } }`。`RouteMeta` 接口加 `fullscreen?: boolean`。

## 7. 配色（品牌色改色，合规）

- 左面板底：用稍深的结构色（如 `--card2`/`--bg` 暗向）保证浅色角色对比度；不新增色号。
- 4 角色取本系统色板内 4 个可区分色（实现期定，候选：`--accent` 蓝 / `--c-advance` 青绿 / `--chart-3` / `--chart-5` 或 `--accent2`）；须满足彼此可区分 + 与左面板底对比足够。
- 表单/按钮/输入框/圆角/阴影/字体全部走 theme 令牌（`--accent` 主按钮、`--r-md`、`--shadow-1`、`--fs-*`、`--sp-*`）。
- 状态三态：空校验提示用淡底深字（`--warn-bg`+`--warn-text` 或 `--danger-bg`+`--danger-text`）。

## 8. 测试（vitest，状态可测；纯视觉动画不强测）

`LoginCharacters.test.ts`：
- mood='account' → 根元素带 `lc--account` 类；mood='password' → `lc--password`（遮眼）；mood='reveal' → `lc--reveal`；mood='fail' → `lc--fail`（shake）。
- 渲染 4 个角色元素（如 `.lc-char` 计数 = 4）。

`LoginView.test.ts`：
- 渲染两栏（含 `LoginCharacters` 组件 + 账号/密码输入 + 登录按钮）。
- 账号 input focus → 传给 LoginCharacters 的 `mood` prop = 'account'；密码 focus → 'password'。
- 显隐切换：点显示密码 → password input `type` 变 'text' 且 mood='reveal'。
- 空表单提交：不调用 `authenticate`（spy），显示空校验提示。
- 非空提交：调用 `authenticate`，桩返回失败 → mood='fail' 且显示返回 message（`vi.mock('@/lib/auth')` 控制返回）。

`AppLayout.test.ts`（若无则新建/或并入既有）：
- `fullscreen:true` 的路由 → 不渲染 AppHeader/AppSidebar（裸 router-view）；普通路由 → 渲染 Header/Sidebar（回归）。

## 9. 验证

`bash verify.sh` 全绿（typecheck + vitest + build）。手动：`/login` 全屏无导航、角色随鼠标转眼、账号/密码聚焦各自反应、显隐密码、空提交拦截、非空提交摇头；其余页面不受影响仍可直接访问（SP-1 不拦截）。

## 10. 对后续 SP 的接口预留

- `lib/auth.ts` 的 `authenticate()` 是 SP-2 的替换点（真 `POST /api/login`，成功后存登录态/权限集）。
- `meta.fullscreen` 外壳分支为后续 SP-3 的守卫（未登录重定向 `/login`）预留了干净的全屏页位置。
- 角色 `mood` 模型可扩展（如 SP-2 成功态加 `success` 欢呼），本期不做。
