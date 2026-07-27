# 1a 导航重组 实施计划（V4.4.7，Z 级）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 侧栏按业务对象重组（组内恒为「总览 → 明细 → 分析」），10 个分析页收进页内 tab，侧栏 31 → 24 项，权限粒度一格不降。

**Architecture:** `nav.ts` 成为导航与授权的唯一数据源：一级项 `NavLink` 与 tab 容器入口 `NavTabEntry` 分离，tab 页归入 `TAB_GROUPS`，四个下游消费方（`PAGE_OPTIONS` / `firstAllowedPath` / AdminView 两处）统一改用展开函数 `sectionPageLinks` 派生。tab 条由路由 `meta.tabGroup` 驱动、在 `AppLayout` 统一渲染，业务页面零改动。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + vue-router 4 + Pinia + Vitest + @vue/test-utils

## Global Constraints

- **绝不使用 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`
- 所有代码注释、测试名、UI 文案一律**简体中文**
- 版本 **V4.4.7（Z 级）**，单一来源 `frontend/src/version.ts`，只改此处
- **不动 34 个业务页面组件**；唯一要改的 view 是 `AdminView.vue`，且只换派生源、不改 UI 结构
- **不动** `styles/theme.css` 与任何设计令牌（属第二期）
- **不动** 筛选逻辑、`hideFilter` meta、`AppLayout.showFilter`、全局单例 `filterStore`（属第三期）
- **30 个 `pageKey` 一个不增不减**，`pageScopes` / `domainScopes` / `allowedPages` 存储格式完全不变
- `AdminView.OVERRIDE_TARGETS` **必须保持排除工具组**的既有语义（`governance` 虽在 `PAGE_DOMAINS` 中但当前不出现在覆盖目标下拉里，本期不改变该行为）
- typecheck 用 `npm --prefix frontend run typecheck`（**本仓无 `tsconfig.app.json`**，勿用 `vue-tsc -p tsconfig.app.json`）
- 测试用 `npm --prefix frontend run test:run`
- 每个 Task 结束时 **typecheck + vitest 必须全绿**，不允许留红测试给下一个 Task

**实施策略：新旧并存、最后切换。** Task 1-4 只新增、不删除旧的 6 个 LINKS 常量，因此侧栏行为始终不变、测试始终绿；Task 5 才一次性切换 `AppSidebar` 并删除旧常量。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/lib/pageAccess.ts` | 改 | `PAGE_KEYS` 运行时常量化（`PageKey` 由其派生）；`PAGE_OPTIONS` 换派生源 |
| `frontend/src/nav.ts` | 改 | 导航与授权唯一数据源：`NavTabEntry` / `TAB_GROUPS` / `NAV_SECTIONS` / `sectionPageLinks` / `ALL_PAGE_LINKS` |
| `frontend/src/nav.test.ts` | 建 | nav 契约测试（key 集合严格相等、无重复、tab 路径与路由一致） |
| `frontend/src/stores/auth.ts` | 改 | `firstAllowedPath()` 换派生源 |
| `frontend/src/views/AdminView.vue` | 改 | `NAV_GROUPS` / `OVERRIDE_TARGETS` 换派生源（唯一要改的 view） |
| `frontend/src/router/index.ts` | 改 | 2 条路径迁移 + redirect + 10 处 `meta.tabGroup` + meta 类型扩展 |
| `frontend/src/lib/navContext.ts` | 改 | `goBoard` 目标路径 |
| `frontend/src/components/PageTabs.vue` | 建 | tab 条：按权限过滤、单 tab 不渲染、切换保留 query |
| `frontend/src/components/PageTabs.test.ts` | 建 | PageTabs 单测 |
| `frontend/src/layout/AppLayout.vue` | 改 | 接入 `PageTabs`（插在 `FilterBar` 之上） |
| `frontend/src/layout/AppSidebar.vue` | 改 | `v-for` 遍历 `NAV_SECTIONS` 取代 7 段复制模板；容器入口动态 `to`；反查取代 8 行特判 |
| `frontend/src/version.ts` | 改 | V4.4.7 |

受影响的既有测试：`layout/AppSidebar.test.ts`、`router/index.test.ts`、`lib/navContext.test.ts`、`components/OrgRanking.test.ts`、`lib/pageAccess.test.ts`、`stores/auth.test.ts`。

---

### Task 1: nav 数据结构与契约测试（只新增，不改任何消费方）

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts:1-8`（`PAGE_KEYS` 运行时化）
- Modify: `frontend/src/nav.ts`（新增结构，保留旧常量）
- Test: `frontend/src/nav.test.ts`（新建）

**Interfaces:**
- Produces: `PAGE_KEYS: readonly PageKey[]`、`NavTabEntry`、`NavItem`、`TabGroupId`、`isTabEntry(i): i is NavTabEntry`、`TAB_GROUPS: Record<TabGroupId, NavLink[]>`、`NavSection`、`NAV_SECTIONS: NavSection[]`、`sectionPageLinks(s: NavSection): NavLink[]`、`ALL_PAGE_LINKS: NavLink[]`
- Consumes: 无（本 Task 是地基）

- [ ] **Step 1: 把 `PageKey` 改为由运行时常量派生**

`frontend/src/lib/pageAccess.ts` 开头 1-8 行整体替换。类型成员与顺序**完全不变**，只是从 type-only 联合改为 `as const` 数组派生，使契约测试能在运行时枚举全部 key。

```ts
/** 全部可授权页面 key —— 运行时单一来源。PageKey 由其派生,契约测试据此校验 nav 覆盖完整。 */
export const PAGE_KEYS = [
  'overview', 'projects', 'projects-closed', 'activity',
  'insight', 'insight-milestone', 'insight-costdetail', 'insight-risk', 'insight-board', 'insight-calendar', 'opportunities-board',
  'payment', 'payment-projects', 'payment-nodes',
  'projects-key', 'opportunities-progress', 'temp-followup', 'opportunity-followup', 'risk-followup', 'payment-key',
  'yitian', 'yitian-detail', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer',
  'data', 'governance', 'budget', 'about',
] as const

export type PageKey = typeof PAGE_KEYS[number]
```

- [ ] **Step 2: 写 nav 契约测试（此时必失败）**

新建 `frontend/src/nav.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { PAGE_KEYS } from '@/lib/pageAccess'
import { ALL_PAGE_LINKS, NAV_SECTIONS, TAB_GROUPS, sectionPageLinks, isTabEntry } from './nav'

describe('nav 契约', () => {
  it('ALL_PAGE_LINKS 恰好覆盖全部 30 个 PageKey,不多不少', () => {
    // 承重点 ①:PAGE_OPTIONS/firstAllowedPath/AdminView 两处全部从它派生。
    // 少一个 → 该页无法授权、无法设数据范围,且不报错。
    expect([...ALL_PAGE_LINKS.map((l) => l.key)].sort()).toEqual([...PAGE_KEYS].sort())
  })

  it('ALL_PAGE_LINKS 无重复 key', () => {
    const keys = ALL_PAGE_LINKS.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('NAV_SECTIONS 一级项 23 个(含 3 个 tab 容器入口);+ 模板内硬编码的账号管理 = 侧栏 24 项', () => {
    // 项目5 + 回款4 + 商机2 + 工时3 + 重点跟进5 + 工具4 = 23;
    // 「系统管理 → 账号管理」不在 NAV_SECTIONS 里(它按 isSuper 而非 pageKey 控制,模板内单列)。
    expect(NAV_SECTIONS.reduce((n, s) => n + s.items.length, 0)).toBe(23)
    expect(NAV_SECTIONS.map((s) => s.id)).toEqual(['project', 'payment', 'opportunity', 'yitian', 'keyfollowup', 'tools'])
  })

  it('三个 tab 组共 10 页,且每组至少 2 项(单项无 tab 意义)', () => {
    const groups = Object.values(TAB_GROUPS)
    expect(groups.flat().length).toBe(10)
    for (const g of groups) expect(g.length).toBeGreaterThanOrEqual(2)
  })

  it('容器入口不带 pageKey —— 保证 ALL_PAGE_LINKS 天然无重复,无需去重逻辑', () => {
    const entries = NAV_SECTIONS.flatMap((s) => s.items).filter(isTabEntry)
    expect(entries.length).toBe(3)
    for (const e of entries) expect('key' in e).toBe(false)
  })

  it('sectionPageLinks 展开容器入口:项目组 = 4 个一级页 + 4 个分析 tab 页', () => {
    const proj = NAV_SECTIONS.find((s) => s.id === 'project')!
    expect(sectionPageLinks(proj).map((l) => l.key)).toEqual([
      'overview', 'projects', 'projects-closed', 'activity',
      'insight', 'insight-milestone', 'insight-costdetail', 'insight-risk',
    ])
  })

  it('回款分析两 tab 指向回款域新路径(不再是 /insight/*)', () => {
    expect(TAB_GROUPS['payment-analysis'].map((t) => t.to)).toEqual(['/payment/board', '/payment/calendar'])
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm --prefix frontend run test:run -- nav.test.ts`
Expected: FAIL，报 `ALL_PAGE_LINKS`、`NAV_SECTIONS`、`TAB_GROUPS`、`sectionPageLinks`、`isTabEntry` 未从 `./nav` 导出

- [ ] **Step 4: 在 `nav.ts` 新增结构（旧的 6 个 LINKS 常量原样保留，一行不改）**

在 `frontend/src/nav.ts` 现有内容之后追加。**注意：此时旧常量仍在、仍被 AppSidebar/pageAccess/auth/AdminView 消费，故本 Task 不改变任何运行时行为。**

```ts
// ============================================================
// V4.4.7 导航重组:按业务对象分组,组内恒为「总览 → 明细 → 分析」。
// 旧的 6 个 LINKS 常量在 Task 5 切换 AppSidebar 后统一删除。
// ============================================================

export type TabGroupId = 'project-analysis' | 'payment-analysis' | 'yitian-analysis'

/** tab 容器入口:既无自己的 pageKey 也无固定 to —— 两者都按权限动态求值(见 AppSidebar.resolveItem)。
 *  单列一个类型是为了让「不与 tab 首项撞 key」成为结构保证,而非派生时的去重补丁。 */
export interface NavTabEntry { label: string; group: TabGroupId }
export type NavItem = NavLink | NavTabEntry

export function isTabEntry(i: NavItem): i is NavTabEntry {
  return 'group' in i
}

/** tab 组:不进侧栏,但必须可授权、可设数据范围。tab 显示文案与 router meta.title 相互独立。 */
export const TAB_GROUPS: Record<TabGroupId, NavLink[]> = {
  'project-analysis': [
    { label: '多维分析', to: '/insight', key: 'insight' },
    { label: '里程碑管理', to: '/insight/milestone', key: 'insight-milestone' },
    { label: '成本分析', to: '/insight/costdetail', key: 'insight-costdetail' },
    { label: '风险看板', to: '/insight/risk', key: 'insight-risk' },
  ],
  'payment-analysis': [
    { label: '回款多维分析', to: '/payment/board', key: 'insight-board' },
    { label: '回款日历', to: '/payment/calendar', key: 'insight-calendar' },
  ],
  'yitian-analysis': [
    { label: '合规检查', to: '/yitian/compliance', key: 'yitian-compliance' },
    { label: '统计分析', to: '/yitian/analytics', key: 'yitian-analytics' },
    { label: '趋势分析', to: '/yitian/trend', key: 'yitian-trend' },
    { label: '客户支持分析', to: '/yitian/customer', key: 'yitian-customer' },
  ],
}

export interface NavSection { id: string; label: string; items: NavItem[] }

/** 侧栏分组注册表。AppSidebar 用 v-for 遍历它渲染,取代原先 7 段复制粘贴的模板。
 *  新增分组/页面只需登记进此表,无需再改模板、也无需加 activeSectionKey 特判。 */
export const NAV_SECTIONS: NavSection[] = [
  { id: 'project', label: '项目', items: [
    { label: '项目总览', to: '/', key: 'overview' },
    { label: '在建项目', to: '/projects', key: 'projects' },
    { label: '已关闭项目', to: '/projects/closed', key: 'projects-closed' },
    { label: '项目动态', to: '/activity', key: 'activity' },
    { label: '项目分析', group: 'project-analysis' },
  ] },
  { id: 'payment', label: '回款', items: [
    { label: '回款总览', to: '/payment', key: 'payment' },
    { label: '回款项目', to: '/payment/projects', key: 'payment-projects' },
    { label: '回款节点', to: '/payment/nodes', key: 'payment-nodes' },
    { label: '回款分析', group: 'payment-analysis' },
  ] },
  { id: 'opportunity', label: '商机', items: [
    { label: '商机清单', to: '/opportunities', key: 'opportunities-progress' },
    { label: '商机看板', to: '/opportunities/board', key: 'opportunities-board' },
  ] },
  { id: 'yitian', label: '倚天工时', items: [
    { label: '工时总览', to: '/yitian', key: 'yitian' },
    { label: '工时明细', to: '/yitian/detail', key: 'yitian-detail' },
    { label: '工时分析', group: 'yitian-analysis' },
  ] },
  { id: 'keyfollowup', label: '重点跟进', items: [
    { label: '重点项目进展', to: '/projects/key', key: 'projects-key' },
    { label: '重点商机跟进', to: '/opportunities/key', key: 'opportunity-followup' },
    { label: '临时重点跟进', to: '/projects/temp', key: 'temp-followup' },
    { label: '风险跟进', to: '/risk', key: 'risk-followup' },
    { label: '回款重点跟进', to: '/payment/key', key: 'payment-key' },
  ] },
  { id: 'tools', label: '工具', items: [
    { label: '数据管理', to: '/data', key: 'data' },
    { label: '数据治理', to: '/governance', key: 'governance' },
    { label: '概算工具', to: '/budget', key: 'budget' },
    { label: '关于产品', to: '/about', key: 'about' },
  ] },
]

/** section 内全部可授权页面:一级 NavLink + 容器入口展开后的 tab 页。
 *  承重点 ①:PAGE_OPTIONS / auth.firstAllowedPath / AdminView.NAV_GROUPS / AdminView.OVERRIDE_TARGETS
 *  四处必须用它派生,漏一处该页就静默失去授权或数据范围配置能力。 */
export function sectionPageLinks(s: NavSection): NavLink[] {
  return s.items.flatMap((i) => (isTabEntry(i) ? TAB_GROUPS[i.group] : [i]))
}

/** 全部可授权页面(30 个),上述四处消费方的唯一来源。 */
export const ALL_PAGE_LINKS: NavLink[] = NAV_SECTIONS.flatMap(sectionPageLinks)
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm --prefix frontend run test:run -- nav.test.ts`
Expected: PASS（7 项）

- [ ] **Step 6: 全量验证（确认只新增未破坏任何既有行为）**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run test:run`
Expected: 全绿。本 Task 未改任何消费方，侧栏与授权行为与改造前**逐字节一致**。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/nav.ts frontend/src/nav.test.ts frontend/src/lib/pageAccess.ts
git commit -m "feat(nav): V4.4.7 Task1 新增按对象分组的 nav 数据结构 + 契约测试

PageKey 改由运行时常量 PAGE_KEYS 派生,使契约测试能真正枚举全部 30 个 key。
新增 NavTabEntry/TAB_GROUPS/NAV_SECTIONS/sectionPageLinks/ALL_PAGE_LINKS。
旧 6 个 LINKS 常量原样保留,本次不改任何消费方,运行时行为不变。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 四个消费方切换派生源

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts:14-23`（`PAGE_OPTIONS`）
- Modify: `frontend/src/stores/auth.ts:5,78-80`（`firstAllowedPath`）
- Modify: `frontend/src/views/AdminView.vue:6,21-36`（`NAV_GROUPS` / `OVERRIDE_TARGETS`）
- Test: `frontend/src/lib/pageAccess.test.ts`（补充）、`frontend/src/stores/auth.test.ts`（补充）

**Interfaces:**
- Consumes: Task 1 的 `ALL_PAGE_LINKS`、`NAV_SECTIONS`、`sectionPageLinks`
- Produces: 无新导出；四个消费方的派生源统一

- [ ] **Step 1: 写失败测试 —— 只有 tab 页权限的账号必须能正确落地**

追加到 `frontend/src/stores/auth.test.ts` 的 `describe('stores/auth')` 内部。该文件已有 `beforeEach(() => setActivePinia(createPinia()))` 与 `useAuthStore` import，无需重复；user 直接赋值即可（Pinia setup store 的 ref 已解包，文件内既有用法同此）：

```ts
  it('firstAllowedPath:仅授予 tab 页(成本分析)的账号,落地到该 tab 页而非 /login', () => {
    // 承重点 ①:旧实现只遍历侧栏 LINKS,分析页收进 tab 后会遍历不到 → 返回 /login。
    const s = useAuthStore()
    s.user = { account: 'u1', displayName: 'u1', isSuper: false, allowedPages: ['insight-costdetail'], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/insight/costdetail')
  })

  it('firstAllowedPath:仅授予工时趋势的账号,落地到 /yitian/trend', () => {
    const s = useAuthStore()
    s.user = { account: 'u2', displayName: 'u2', isSuper: false, allowedPages: ['yitian-trend'], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/yitian/trend')
  })

追加到 `frontend/src/lib/pageAccess.test.ts`：

```ts
it('PAGE_OPTIONS 覆盖全部 30 个 PageKey(含 10 个 tab 页),否则超管无法为其授权', () => {
  const keys = PAGE_OPTIONS.filter((o) => o.key !== '*').map((o) => o.key).sort()
  expect(keys).toEqual([...PAGE_KEYS].sort())
})

it('PAGE_OPTIONS 含 tab 页(里程碑管理/回款日历/工时趋势)', () => {
  const keys = PAGE_OPTIONS.map((o) => o.key)
  expect(keys).toContain('insight-milestone')
  expect(keys).toContain('insight-calendar')
  expect(keys).toContain('yitian-trend')
})
```

在该文件顶部补充 import：`import { PAGE_KEYS, PAGE_OPTIONS } from './pageAccess'`（若已 import 部分则合并）。

- [ ] **Step 2: 运行确认失败**

Run: `npm --prefix frontend run test:run -- pageAccess.test.ts auth.test.ts`
Expected: FAIL —— `firstAllowedPath()` 返回 `/login`（旧实现遍历不到 tab 页）

- [ ] **Step 3: `PAGE_OPTIONS` 换派生源**

`frontend/src/lib/pageAccess.ts` 第 14 行起整体替换（注释里「27 个」是陈旧值，一并订正为 30）：

```ts
import { ALL_PAGE_LINKS } from '@/nav'

/** 建/编辑账号表单的「可访问页面」选项单一来源:'*' 全部 + 30 个 PageKey(取 nav 标签)。
 *  ALL_PAGE_LINKS 已含 tab 页,勿改回按侧栏 LINKS 派生 —— 那会让 10 个分析页无法授权。 */
export const PAGE_OPTIONS: { key: string; label: string }[] = [
  { key: '*', label: '全部页面' },
  ...ALL_PAGE_LINKS.map((l) => ({ key: l.key, label: l.label })),
]
```

- [ ] **Step 4: `firstAllowedPath` 换派生源**

`frontend/src/stores/auth.ts`：第 5 行的 import 改为 `import { ALL_PAGE_LINKS } from '@/nav'`；第 78-80 行改为：

```ts
    const hit = ALL_PAGE_LINKS.find((l) => canAccess(l.key))
    return hit ? hit.to : '/login'
```

（删掉原先手工拼接 6 个 LINKS 的 `const all = [...]` 一行。）

- [ ] **Step 5: `AdminView` 两处换派生源**

`frontend/src/views/AdminView.vue`：第 6 行 import 改为

```ts
import { NAV_SECTIONS, ALL_PAGE_LINKS, sectionPageLinks } from '@/nav'
```

第 21-36 行替换为：

```ts
// 组级选页:分组与侧栏同源;sectionPageLinks 会把 tab 容器入口展开成其下 tab 页,
// 否则 10 个分析页在本配置界面里整个消失、无法勾选。
const NAV_GROUPS = NAV_SECTIONS.map((s) => ({ key: s.id, label: s.label, links: sectionPageLinks(s) }))

// 覆盖目标下拉:域 + 有数据域的页。
// 保持既有语义 —— 排除工具组(governance 虽在 PAGE_DOMAINS 中,但历来不出现在此下拉,本期不改变)。
const OVERRIDE_TARGETS = [
  { value: 'domain:project', label: '域·项目&回款' },
  { value: 'domain:yitian', label: '域·工时' },
  { value: 'domain:opportunity', label: '域·商机' },
  ...NAV_SECTIONS.filter((s) => s.id !== 'tools').flatMap(sectionPageLinks)
    .filter((l) => PAGE_DOMAINS[l.key]).map((l) => ({ value: `page:${l.key}`, label: `页·${l.label}` })),
]
```

**注意**：`NAV_GROUPS` 原有 `as const` 断言必须去掉（`NAV_SECTIONS.map` 返回可变数组）。若模板中有依赖 readonly 的用法，改为普通数组即可，不影响渲染。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm --prefix frontend run test:run -- pageAccess.test.ts auth.test.ts`
Expected: PASS

- [ ] **Step 7: 全量验证**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run test:run`
Expected: 全绿。侧栏此时**仍在用旧常量渲染**，外观行为不变；变的只是授权选项与落地页的派生源（结果等价且更全）。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/lib/pageAccess.ts frontend/src/lib/pageAccess.test.ts frontend/src/stores/auth.ts frontend/src/stores/auth.test.ts frontend/src/views/AdminView.vue
git commit -m "feat(nav): V4.4.7 Task2 四个消费方统一改用 ALL_PAGE_LINKS 派生

承重点①:PAGE_OPTIONS/firstAllowedPath/AdminView.NAV_GROUPS/OVERRIDE_TARGETS
四处原本从 6 个侧栏 LINKS 派生,分析页收进 tab 后会各自静默失效
(无法授权/落地 /login/配置界面缺页/pageScopes 对 10 页失效)。
OVERRIDE_TARGETS 保持排除工具组的既有语义。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 路由改造（2 条路径迁移 + redirect + meta.tabGroup）

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/lib/navContext.ts`
- Test: `frontend/src/router/index.test.ts`、`frontend/src/lib/navContext.test.ts`、`frontend/src/components/OrgRanking.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `TabGroupId`
- Produces: `RouteMeta.tabGroup?: TabGroupId`；新路径 `/payment/board`、`/payment/calendar`

- [ ] **Step 1: 写失败测试**

改 `frontend/src/router/index.test.ts`：
- 第 16 行路径列表中 `'/insight/board'` → `'/payment/board'`，`'/insight/calendar'` → `'/payment/calendar'`
- 第 21-23、33-34 行的 `/insight/board` 全部改为 `/payment/board`
- 第 55-60 行「旧 /panalysis 缺省 redirect 到 /insight/board」的期望改为 `/payment/board`

并追加：

```ts
it('旧 /insight/board 导航 redirect 到 /payment/board,保留 query', async () => {
  await router.push('/insight/board?dim=orgL4')
  const cur = router.currentRoute.value
  expect(cur.path).toBe('/payment/board')
  expect(cur.query).toEqual({ dim: 'orgL4' })
  expect(cur.redirectedFrom?.path).toBe('/insight/board')
})

it('旧 /insight/calendar 导航 redirect 到 /payment/calendar', async () => {
  await router.push('/insight/calendar')
  expect(router.currentRoute.value.path).toBe('/payment/calendar')
})

it('旧 /calendar 导航 redirect 到 /payment/calendar', async () => {
  await router.push('/calendar')
  expect(router.currentRoute.value.path).toBe('/payment/calendar')
})

it('10 个 tab 页各自带正确的 meta.tabGroup', () => {
  const cases: [string, string][] = [
    ['/insight', 'project-analysis'], ['/insight/milestone', 'project-analysis'],
    ['/insight/costdetail', 'project-analysis'], ['/insight/risk', 'project-analysis'],
    ['/payment/board', 'payment-analysis'], ['/payment/calendar', 'payment-analysis'],
    ['/yitian/compliance', 'yitian-analysis'], ['/yitian/analytics', 'yitian-analysis'],
    ['/yitian/trend', 'yitian-analysis'], ['/yitian/customer', 'yitian-analysis'],
  ]
  for (const [path, group] of cases) {
    expect(router.resolve(path).meta.tabGroup).toBe(group)
  }
})

it('非 tab 页不带 tabGroup(不误渲染 tab 条)', () => {
  for (const p of ['/', '/projects', '/payment', '/yitian', '/data', '/risk']) {
    expect(router.resolve(p).meta.tabGroup).toBeUndefined()
  }
})
```

改 `frontend/src/lib/navContext.test.ts`：期望路径 `/insight/board` → `/payment/board`。

改 `frontend/src/components/OrgRanking.test.ts` 第 88、93 行：`/insight/board` → `/payment/board`（测试名里的路径一并改）。

- [ ] **Step 2: 运行确认失败**

Run: `npm --prefix frontend run test:run -- router/index.test.ts lib/navContext.test.ts components/OrgRanking.test.ts`
Expected: FAIL

- [ ] **Step 3: 改路由表**

`frontend/src/router/index.ts`：

1. meta 类型扩展（第 40-46 行附近）加一行，并在文件顶部 import 类型：

```ts
import type { TabGroupId } from '@/nav'
```

```ts
    /** 属于哪个 tab 组;有值则 AppLayout 渲染 PageTabs。无值的页面不渲染 tab 条。 */
    tabGroup?: TabGroupId
```

2. 两条真实路由改路径（`name` 保持不变，避免影响 keep-alive 与既有 name 断言）：

```ts
    { path: '/payment/board', name: 'pay-board', component: BoardView,
      meta: { title: '回款多维分析', pageKey: 'insight-board', tabGroup: 'payment-analysis' } },
    { path: '/payment/calendar', name: 'calendar', component: CalendarView,
      meta: { title: '回款日历', pageKey: 'insight-calendar', tabGroup: 'payment-analysis' } },
```

3. 删除原先的 `{ path: '/payment/board', redirect: ... }` 一行（它指向已不存在的 `/insight/board`，不删会与上面的真实路由冲突）。

4. 新增两条反向 redirect：

```ts
    { path: '/insight/board', redirect: (to) => ({ path: '/payment/board', query: to.query }) },
    { path: '/insight/calendar', redirect: (to) => ({ path: '/payment/calendar', query: to.query }) },
```

5. 改 `/calendar` 的 redirect 目标为 `/payment/calendar`；改 `/board` 的 redirect 目标为 `/payment/board`。

6. `/panalysis/:tab?` 与 `/analysis/:tab` 两处函数式 redirect 中，`if (t === 'board') return { path: '/insight/board', ... }` 与缺省分支的 `/insight/board` 全部改为 `/payment/board`。

7. 给其余 8 个 tab 页的 meta 各加一行 `tabGroup`：

```
/insight            → tabGroup: 'project-analysis'
/insight/milestone  → tabGroup: 'project-analysis'
/insight/costdetail → tabGroup: 'project-analysis'
/insight/risk       → tabGroup: 'project-analysis'
/yitian/compliance  → tabGroup: 'yitian-analysis'
/yitian/analytics   → tabGroup: 'yitian-analysis'
/yitian/trend       → tabGroup: 'yitian-analysis'
/yitian/customer    → tabGroup: 'yitian-analysis'
```

- [ ] **Step 4: 改 `navContext.ts`**

```ts
import type { Router } from 'vue-router'

/** 带维度跳转回款多维分析(board)。年/视角等全局筛选由 filter store 跨页保留,此处只传维度。
 *  V1.16.0:board 迁至 /insight/board(项目分析中心)。
 *  V4.4.7:项目分析中心解散,board 迁回回款域 /payment/board。 */
export function goBoard(router: Router, dim: string): void {
  router.push({ path: '/payment/board', query: { dim } })
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm --prefix frontend run test:run -- router/index.test.ts lib/navContext.test.ts components/OrgRanking.test.ts`
Expected: PASS

- [ ] **Step 6: 全量验证**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run test:run`
Expected: 全绿。侧栏此时仍用旧常量、其中两个链接指向旧路径 `/insight/board`、`/insight/calendar` —— 会被新增的 redirect 接住，功能正常（Task 5 切换侧栏后即直连新路径）。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/router/index.ts frontend/src/router/index.test.ts frontend/src/lib/navContext.ts frontend/src/lib/navContext.test.ts frontend/src/components/OrgRanking.test.ts
git commit -m "feat(nav): V4.4.7 Task3 回款两页迁回回款域 + 10 页挂 meta.tabGroup

/insight/board → /payment/board、/insight/calendar → /payment/calendar,
旧路径反向 redirect 且保留 query;/calendar 与 /panalysis|/analysis 的
board 分支目标同步更新。lib/navContext.goBoard 是生产代码里的孤儿消费方,
一并改;否则下钻会先跳旧路径再被 redirect 弹一次。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `PageTabs` 组件 + `AppLayout` 接入

**Files:**
- Create: `frontend/src/components/PageTabs.vue`
- Create: `frontend/src/components/PageTabs.test.ts`
- Modify: `frontend/src/layout/AppLayout.vue:6,26`

**Interfaces:**
- Consumes: Task 1 的 `TAB_GROUPS` / `TabGroupId`；Task 3 的 `meta.tabGroup`；`useAuthStore().canAccess`
- Produces: `<PageTabs :group="TabGroupId" />`，`defineExpose({ tabs, visible })`

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/components/PageTabs.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import PageTabs from './PageTabs.vue'
import { useAuthStore } from '@/stores/auth'

const Stub = { template: '<div />' }
let router: Router

function newRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/insight', component: Stub }, { path: '/insight/milestone', component: Stub },
      { path: '/insight/costdetail', component: Stub }, { path: '/insight/risk', component: Stub },
      { path: '/payment/board', component: Stub }, { path: '/payment/calendar', component: Stub },
    ],
  })
}

function mountAt(group: string, path: string) {
  return mount(PageTabs, { props: { group }, global: { plugins: [router] } })
}

describe('PageTabs', () => {
  beforeEach(() => { setActivePinia(createPinia()); router = newRouter() })

  it('超管:渲染该组全部 tab', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'a', isSuper: true, allowedPages: ['*'] } as any
    await router.push('/insight')
    const w = mountAt('project-analysis', '/insight')
    expect(w.findAll('.pt-tab').map((b) => b.text())).toEqual(['多维分析', '里程碑管理', '成本分析', '风险看板'])
  })

  it('按 pageKey 过滤:只授予两页则只渲染两个 tab', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'b', isSuper: false, allowedPages: ['insight', 'insight-risk'] } as any
    await router.push('/insight')
    const w = mountAt('project-analysis', '/insight')
    expect(w.findAll('.pt-tab').map((b) => b.text())).toEqual(['多维分析', '风险看板'])
  })

  it('过滤后仅剩 1 个 tab → 整条不渲染(单 tab 无切换意义)', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'c', isSuper: false, allowedPages: ['insight-milestone'] } as any
    await router.push('/insight/milestone')
    const w = mountAt('project-analysis', '/insight/milestone')
    expect(w.find('.pt-bar').exists()).toBe(false)
  })

  it('当前路由对应的 tab 高亮', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'd', isSuper: true, allowedPages: ['*'] } as any
    await router.push('/insight/costdetail')
    const w = mountAt('project-analysis', '/insight/costdetail')
    const on = w.findAll('.pt-tab').filter((b) => b.classes().includes('on'))
    expect(on).toHaveLength(1)
    expect(on[0].text()).toBe('成本分析')
  })

  it('切 tab 保留当前 query(下钻参数不丢)', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'e', isSuper: true, allowedPages: ['*'] } as any
    await router.push('/payment/board?dim=orgL4')
    const w = mountAt('payment-analysis', '/payment/board')
    await w.findAll('.pt-tab')[1].trigger('click')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/payment/calendar')
    expect(router.currentRoute.value.query).toEqual({ dim: 'orgL4' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm --prefix frontend run test:run -- components/PageTabs.test.ts`
Expected: FAIL —— 找不到 `./PageTabs.vue`

- [ ] **Step 3: 新建 `PageTabs.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { TAB_GROUPS, type TabGroupId } from '@/nav'

const props = defineProps<{ group: TabGroupId }>()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const tabs = computed(() => (TAB_GROUPS[props.group] ?? []).filter((t) => auth.canAccess(t.key)))
/** 仅剩 1 个可见 tab 时整条不渲染 —— 单 tab 无切换意义,只是视觉噪音。 */
const visible = computed(() => tabs.value.length > 1)

/** 切 tab 保留当前 query:下钻参数(dim/dL4/dScroll 等)不能因换 tab 丢失。 */
function go(to: string) {
  if (to === route.path) return
  router.push({ path: to, query: route.query })
}

defineExpose({ tabs, visible })
</script>

<template>
  <div v-if="visible" class="pt-bar" role="tablist">
    <button v-for="t in tabs" :key="t.to" type="button" role="tab" class="pt-tab u-press"
      :class="{ on: t.to === route.path }" :aria-selected="t.to === route.path"
      :data-test="`pagetab-${t.key}`" @click="go(t.to)">{{ t.label }}</button>
  </div>
</template>

<style scoped>
/* 形态与 SegToggle 同源:选中=抬起 chip(淡底深字),不引入新令牌(新令牌属第二期)。 */
.pt-bar { display: flex; gap: var(--sp-1); padding: var(--sp-3) var(--sp-4) 0; }
.pt-tab {
  border: none; background: transparent; color: var(--sub); cursor: pointer;
  font-size: var(--fs-2); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm);
  line-height: var(--lh-dense);
  transition: color var(--dur-1) var(--ease), background-color var(--dur-1) var(--ease);
}
.pt-tab:hover:not(.on) { color: var(--txt); background: var(--hover-tint); }
.pt-tab.on { background: var(--card); color: var(--accent); font-weight: 700; box-shadow: var(--shadow-1); }
</style>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix frontend run test:run -- components/PageTabs.test.ts`
Expected: PASS（5 项）

- [ ] **Step 5: `AppLayout` 接入**

`frontend/src/layout/AppLayout.vue`：第 6 行后加 import

```ts
import PageTabs from '@/components/PageTabs.vue'
```

模板第 26 行 `<FilterBar v-if="showFilter" />` **之前**插入（tab 是页面级导航，层级高于页内筛选，故在上）：

```vue
        <PageTabs v-if="route.meta?.tabGroup" :group="route.meta.tabGroup" />
```

- [ ] **Step 6: 全量验证**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run test:run`
Expected: 全绿

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/PageTabs.vue frontend/src/components/PageTabs.test.ts frontend/src/layout/AppLayout.vue
git commit -m "feat(nav): V4.4.7 Task4 PageTabs 组件 + AppLayout 接入

由 route.meta.tabGroup 驱动、AppLayout 统一渲染,34 个业务页面零改动。
按 pageKey 过滤保权限粒度;仅剩 1 个可见 tab 时整条不渲染;
切 tab 保留 query,下钻参数不丢。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `AppSidebar` 重构（切换到新结构 + 删除旧常量）

**Files:**
- Modify: `frontend/src/layout/AppSidebar.vue`
- Modify: `frontend/src/nav.ts`（删除 6 个旧 LINKS 常量）
- Test: `frontend/src/layout/AppSidebar.test.ts`（大量断言更新）、`frontend/src/lib/pageAccess.test.ts`（引用旧常量处）

**Interfaces:**
- Consumes: Task 1 的 `NAV_SECTIONS` / `TAB_GROUPS` / `isTabEntry` / `NavItem` / `NavLink`
- Produces: 无新导出

- [ ] **Step 1: 更新 `AppSidebar.test.ts` 的既有断言（此时必失败）**

逐条改动，**每条都必须改，漏一条即红**：

| 行 | 现状 | 改为 | 原因 |
|---|---|---|---|
| 52 | 测试名「renders 项目/项目分析/回款/工具 四段分组」 | 「renders 项目/回款/商机/工时/重点跟进/工具 六段分组」 | 分组变了 |
| 65 | `toContain('项目多维分析')` | **删除** | 该 label 已改名「多维分析」且移入 tab |
| 66-70 | `toContain('里程碑管理'/'成本分析'/'风险看板'/'回款多维分析'/'回款日历')` | **全部删除** | 5 项移入 tab，侧栏不再有 |
| 84-87 | `toContain('工时合规检查'/'工时统计分析'/'工时趋势分析'/'客户支持分析')` | **全部删除** | 4 项移入 tab |
| 83 | `toContain('倚天工时总览')` | `toContain('工时总览')` | label 改名 |
| 89 | `not.toContain('回款分析')` | **删除该行** | **新设计恰好新增了叫「回款分析」的容器入口,此负向断言必红** |
| 95 | `toBe(31)` | `toBe(24)` | 侧栏项数 |
| 177-178 | `sec(w, '项目多维分析')` | `sec(w, '项目分析')` | 用容器入口 label 定位 |
| 183-184 | 同上两处 | 同上 | |
| 191/194 | 同上 | 同上 | |

并在 64 行后补充新分组的正向断言：

```ts
    expect(text).toContain('项目分析')        // 项目组:tab 容器入口
    expect(text).toContain('回款分析')        // 回款组:tab 容器入口
    expect(text).toContain('工时分析')        // 工时组:tab 容器入口
    expect(text).toContain('商机')            // 商机独立成组
    expect(text).toContain('商机看板')        // 商机组(原在项目分析中心)
```

**同时修 `makeRouter()`（第 27-28 行）**：路由表里的 `/insight/board`、`/insight/calendar` 改为 `/payment/board`、`/payment/calendar`。不改的话侧栏渲染的 `RouterLink` 指向表中不存在的路径，vue-router 会在测试输出里刷 `No match found` 警告。

**新增两个共享辅助函数**（放在文件顶部 `beforeEach` 之后）。该文件原本没有共享辅助，每个 `it` 内联重复 6 行挂载代码；本 Task 新增的 5 个测试需要按权限/按路由挂载两种变体，故抽出：

```ts
/** 按指定权限挂载(isSuper=false,只给 allowedPages)。 */
async function mountWith(pages: string[]) {
  const router = makeRouter()
  router.push('/')
  await router.isReady()
  const a = useAuthStore()
  a.user = { account: 'n', displayName: 'n', isSuper: false, allowedPages: pages, allowedL4: [] }
  return mount(AppSidebar, { global: { plugins: [router] } })
}

/** 以超管身份挂载在指定路由(用于 section 归属反查断言)。 */
async function mountAtRoute(path: string) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const a = useAuthStore()
  a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: [], allowedL4: [] }
  return mount(AppSidebar, { global: { plugins: [router] } })
}

const secOf = (w: Awaited<ReturnType<typeof mountAtRoute>>, anchor: string) =>
  w.findAll('.section').find((s) => s.text().includes(anchor))!
```

（文件下方 `describe('AppSidebar 分区可折叠')` 内部已有同名的局部 `mountAt` 与 `sec`，保持不动，只把其中 `sec(w, '项目多维分析')` 的锚点按上表改为 `'项目分析'`。）

追加新测试：

```ts
  it('tab 容器入口 to 指向该组第一个可见 tab(不硬编码首项)', async () => {
    // 只授予「成本分析」的账号,点「项目分析」必须落到 /insight/costdetail;
    // 若硬编码指向 /insight(多维分析),该账号会被路由守卫弹回 —— 入口可见却点不动。
    const w = await mountWith(['insight-costdetail'])
    const link = w.findAll('a').find((a) => a.text() === '项目分析')!
    expect(link.attributes('href')).toBe('/insight/costdetail')
  })

  it('整组 tab 都不可访问时,容器入口不渲染', async () => {
    const w = await mountWith(['projects'])
    expect(w.text()).not.toContain('项目分析')
  })

  it('section 归属反查:/projects/key 归重点跟进,不被 /projects 前缀抢走', async () => {
    const w = await mountAtRoute('/projects/key')
    expect(secOf(w, '重点项目进展').classes()).not.toContain('collapsed')
    expect(secOf(w, '在建项目').classes()).toContain('collapsed')
  })

  it('section 归属反查:tab 页 /insight/milestone 归项目组', async () => {
    const w = await mountAtRoute('/insight/milestone')
    expect(secOf(w, '项目分析').classes()).not.toContain('collapsed')
  })

  it('section 归属反查:/payment/board 归回款组', async () => {
    const w = await mountAtRoute('/payment/board')
    expect(secOf(w, '回款分析').classes()).not.toContain('collapsed')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npm --prefix frontend run test:run -- layout/AppSidebar.test.ts`
Expected: FAIL

- [ ] **Step 3: 重写 `AppSidebar.vue` 的 script 段**

第 1-37 行整体替换：

```ts
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { NAV_SECTIONS, TAB_GROUPS, isTabEntry, type NavItem, type NavLink } from '@/nav'

const ui = useUiStore()
const auth = useAuthStore()
const route = useRoute()

/** 一级项 → 可渲染的链接;不可访问则 null(整项不渲染)。
 *  tab 容器入口的 to 按权限动态求值 —— 指向该组第一个可见 tab,而非硬编码首项。 */
function resolveItem(item: NavItem): NavLink | null {
  if (!isTabEntry(item)) return auth.canAccess(item.key) ? item : null
  const hit = TAB_GROUPS[item.group].find((t) => auth.canAccess(t.key))
  return hit ? { label: item.label, to: hit.to, key: hit.key } : null
}

/** 按权限过滤后的分组;组内无任何可见项则整组不渲染。 */
const sections = computed(() =>
  NAV_SECTIONS
    .map((s) => ({ id: s.id, label: s.label, links: s.items.map(resolveItem).filter((l): l is NavLink => l !== null) }))
    .filter((s) => s.links.length > 0))

/** 当前路径所属 section —— 从 nav 常量反查,取代 V4.4.7 前的 8 行 if-else 特判。
 *  精确匹配优先:/projects/key 必须归重点跟进,不能被 /projects 的前缀规则抢走。
 *  前缀匹配按 to 长度降序,长路径优先。都不中则归 project(项目详情等 /project/:id 走此兜底)。 */
const activeSectionKey = computed(() => {
  const p = route.path
  if (p.startsWith('/admin')) return 'admin'
  const entries = NAV_SECTIONS.flatMap((s) =>
    s.items.flatMap((i) => (isTabEntry(i) ? TAB_GROUPS[i.group].map((t) => t.to) : [i.to]))
      .map((to) => ({ section: s.id, to })))
  const exact = entries.find((e) => e.to === p)
  if (exact) return exact.section
  const pref = [...entries].sort((a, b) => b.to.length - a.to.length)
    .find((e) => e.to !== '/' && p.startsWith(e.to + '/'))
  return pref ? pref.section : 'project'
})

function expanded(key: string): boolean {
  const v = ui.sectionExpanded[key]
  return v === undefined ? key === activeSectionKey.value : v
}
function onToggle(key: string) {
  ui.setSection(key, !expanded(key))
}
</script>
```

- [ ] **Step 4: 重写 `AppSidebar.vue` 的模板段（7 段复制 → 一个 v-for）**

第 39-114 行的 `<template>` 整体替换（`<style>` 段**保持不变**，仅在 Step 5 删一条已无用的样式）：

```vue
<template>
  <aside class="sidebar u-hairline-r" :class="{ collapsed: ui.sidebarCollapsed }">
    <nav class="sidebar-nav">
      <div v-for="s in sections" :key="s.id" class="section" :class="{ collapsed: !expanded(s.id) }">
        <button type="button" class="section-label" @click="onToggle(s.id)">
          <span class="section-caret">{{ expanded(s.id) ? '▾' : '▸' }}</span>{{ s.label }}
        </button>
        <div v-show="expanded(s.id)" class="section-links">
          <RouterLink v-for="link in s.links" :key="link.to" :to="link.to"
            class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="auth.isSuper" class="section" :class="{ collapsed: !expanded('admin') }">
        <button type="button" class="section-label" @click="onToggle('admin')">
          <span class="section-caret">{{ expanded('admin') ? '▾' : '▸' }}</span>系统管理
        </button>
        <div v-show="expanded('admin')" class="section-links">
          <RouterLink to="/admin" class="nav-sub" active-class="active">账号管理</RouterLink>
        </div>
      </div>
    </nav>
  </aside>
  <button data-test="sidebar-toggle" class="sidebar-toggle" title="折叠/展开菜单"
    @click="ui.toggleSidebar()">{{ ui.sidebarCollapsed ? '››' : '‹‹' }}</button>
</template>
```

**注意**：原「回款」分组标题后的 `<span class="section-tag">重点子域</span>` 随之消失 —— 重组后回款与项目/商机/工时并列，不再是「重点子域」，该标签已无意义。

- [ ] **Step 5: 删除已无用的 `.section-tag` 样式**

在 `<style scoped>` 中删除 `.section-tag { ... }` 一条（第 139 行附近，形如 `.section-tag { background: var(--card2); color: var(--sub); ... }`）。若该类在文件内已无引用，删除即可；`grep -n "section-tag" frontend/src/layout/AppSidebar.vue` 应返回空。

- [ ] **Step 6: 删除 `nav.ts` 中的 6 个旧 LINKS 常量**

删除 `PROJECT_LINKS`、`ANALYSIS_LINKS`、`KEY_FOLLOWUP_LINKS`、`PAYMENT_LINKS`、`YITIAN_LINKS`、`TOOL_LINKS` 六个导出（连同其上方注释）。`TIERS` / `TierOpt` / `TIER_BY_SLUG` / `NavLink` **保留不动**。

删除后执行零残留核对：

```bash
grep -rn "PROJECT_LINKS\|ANALYSIS_LINKS\|KEY_FOLLOWUP_LINKS\|PAYMENT_LINKS\|YITIAN_LINKS\|TOOL_LINKS" frontend/src
```
Expected: 无输出。若 `lib/pageAccess.test.ts` 仍有引用（第 3、18-35 行），改为从 `NAV_SECTIONS` 取对应分组：

```ts
import { NAV_SECTIONS, sectionPageLinks } from '@/nav'

const keyFollowup = sectionPageLinks(NAV_SECTIONS.find((s) => s.id === 'keyfollowup')!)
const projectSec = sectionPageLinks(NAV_SECTIONS.find((s) => s.id === 'project')!)
```

并把原「商机清单移入 PROJECT_LINKS,在已关闭项目后、项目动态前」一测改为：

```ts
  it('商机清单已独立成「商机」分组(V4.4.7 从项目组迁出)', () => {
    const opp = sectionPageLinks(NAV_SECTIONS.find((s) => s.id === 'opportunity')!)
    expect(opp.map((l) => l.key)).toEqual(['opportunities-progress', 'opportunities-board'])
    expect(projectSec.map((l) => l.key)).not.toContain('opportunities-progress')
  })
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm --prefix frontend run test:run -- layout/AppSidebar.test.ts lib/pageAccess.test.ts`
Expected: PASS

- [ ] **Step 8: 全量验证**

Run: `npm --prefix frontend run typecheck && npm --prefix frontend run test:run`
Expected: 全绿

- [ ] **Step 9: 提交**

```bash
git add frontend/src/layout/AppSidebar.vue frontend/src/layout/AppSidebar.test.ts frontend/src/nav.ts frontend/src/lib/pageAccess.test.ts
git commit -m "feat(nav): V4.4.7 Task5 侧栏切换到按对象分组,删除旧 LINKS 常量

7 段复制粘贴模板 → 一个 v-for 遍历 NAV_SECTIONS;
activeSectionKey 的 8 行 if-else 特判 → 从 nav 常量反查(精确优先,
再按 to 长度降序前缀匹配),/projects/key 不再被 /projects 抢走;
tab 容器入口 to 按权限动态求值,整组不可见则不渲染。侧栏 31 → 24 项。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 版本号 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：

```ts
export const APP_VERSION = 'V4.4.7'
export const RELEASE_DATE = '2026-07-26'
```

- [ ] **Step 2: 更新 `PROGRESS.md`**

在版本史顶部追加一条，写明：按业务对象重组侧栏（组内恒为总览→明细→分析）、解散「项目分析中心」、10 个分析页收进 tab、侧栏 31→24；承重点 ① 四个派生消费方统一改用 `ALL_PAGE_LINKS`（漏改则该页静默失去授权/数据范围配置能力）；`/insight/board`→`/payment/board`、`/insight/calendar`→`/payment/calendar` 且旧路径 redirect 保留 query；34 个业务页面零改动，唯一改动的 view 是 `AdminView`；纯前端、仅换 dist、无需重启后端、无需点「更新数据」、`pageKey` 30 个不增不减。

- [ ] **Step 3: 跑完整 verify**

Run: `bash verify.sh`
Expected: 全绿（后端零改动，前端 typecheck / vitest / build 三项）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.4.7 导航重组(1a)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## 完成后的人工冒烟清单（自动化测试盖不到的）

1. 超管登录 → 侧栏应为 7 组 24 项，「项目分析」「回款分析」「工时分析」三个入口点进去有 tab 条
2. 在 `/payment/board` 用某维度下钻 → 切到「回款日历」tab，**query 中的 dim 仍在**
3. 建一个只勾「成本分析」的测试账号 → 登录后应直接落在 `/insight/costdetail`，侧栏「项目分析」入口 href 指向该页，且**无 tab 条**（单 tab 不渲染）
4. 同一账号在「账号管理」页 → 「可访问页面」下拉能搜到全部 10 个 tab 页；「覆盖列表」下拉能搜到 tab 页（工具组的数据治理仍不在其中，与改造前一致）
5. 浏览器直接访问旧地址 `/insight/board?dim=orgL4` → 跳到 `/payment/board?dim=orgL4`
6. 折叠/展开各分组后刷新 → 展开态保持（`localStorage` 里旧的 `analysis` 残留键无害，不必清理）
