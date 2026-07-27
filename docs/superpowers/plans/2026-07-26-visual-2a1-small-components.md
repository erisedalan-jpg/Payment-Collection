# 2a-1 约束修订 + 三个小组件 实施计划（V4.4.9，Z 级）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修订 6 条设计约束，并抽出 `AppEmpty` / `AppPager` / `AppButton` 三个小组件替换全站 39 处自写实现。

**Architecture:** 先在 `theme.css` 与 `CLAUDE.md` 补齐缺失的令牌与条目（约束层），再抽三个同构度最高的小组件，最后按**文件集**分四组并行替换。三类在文件上严重重叠（`CostDetailView` 三类都有），故 Task 必须按文件切、不能按组件类型切。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Element Plus + Vitest

## Global Constraints

- **绝不使用 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`
- 注释、测试名、UI 文案一律**简体中文**
- 版本 **V4.4.9（Z 级）**，单一来源 `frontend/src/version.ts`
- **视觉零变化是本期的硬承诺**：三个组件的取值必须与被替换的现状逐条相同，写成契约测试锁死
- **绝不碰** `useFilterStore` / `hideFilter` / `.toolbar` 的样式定义（第三期）
- **绝不碰** 卡片容器（59 处，属 2a-2）、卡内小标题、`StatusBadge` 推广、chip（属 2a-3）
- **登录页豁免**：`LoginView` 的 `lv-eye-btn`、`lv-form`、`lv-input` 与 `ChangePasswordView` 的同类件**不纳入**（全屏页专属设计，同 V4.4.8 豁免全屏页）
- typecheck 用 `npm --prefix frontend run typecheck`（**本仓无 `tsconfig.app.json`**）
- 每个 Task 结束时 typecheck + 该 Task 的 scoped 测试必须绿

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/styles/theme.css` | 改 | 加 `--sp-0` 与两个图标字号令牌 |
| `CLAUDE.md`「设计底层规范」 | 改 | 6 条修订（B/C/D/E 类，见 Task 1） |
| `frontend/src/components/AppEmpty.vue` + `.test.ts` | 建 | 空态 / 404 |
| `frontend/src/components/AppPager.vue` + `.test.ts` | 建 | 分页条（含「共 N 条」） |
| `frontend/src/components/AppButton.vue` + `.test.ts` | 建 | 自写原生按钮 |
| 6 个项目域 view | 改 | Task 3 |
| 7 个其余 view | 改 | Task 4 |
| 3 个倚天 view | 改 | Task 5 |
| 9 个 component | 改 | Task 6 |
| `views/__pageHeader.test.ts` | 改 | 追加零残留守卫 |
| `frontend/src/version.ts` · `PROGRESS.md` | 改 | 发版 |

---

### Task 1: 约束层修订（`theme.css` + `CLAUDE.md`）

**Files:**
- Modify: `frontend/src/styles/theme.css`
- Modify: `CLAUDE.md`（「设计底层规范」一节）

**Interfaces:**
- Produces: `--sp-0: 2px`、`--fs-icon-sm`、`--fs-icon-lg` 三个新令牌

- [ ] **Step 1: `theme.css` 加三个令牌**

在 `:root` 的间距阶梯段（`--sp-1: 4px;` 之前）插入：

```css
  /* 亚栅格微调:仅限 chip/badge 内边距、描边偏移等 8pt 阶梯覆盖不到的场景。
     现状有 31 处硬写 2px 无令牌可用,是间距违例的一半。不得用于常规布局间距。 */
  --sp-0: 2px;
```

在字号令牌段（`--fs-6` 之后）插入：

```css
  /* 图标字号:【不属于】六级文字层级,仅用于图标与 emoji。
     六级最小档 --fs-1 是 12px,而信息图标需 10px、门户 emoji 需 24px。 */
  --fs-icon-sm: 0.625rem;   /* 10 @16基准 —— 表头信息图标 */
  --fs-icon-lg: 1.5rem;     /* 24 @16基准 —— 门户 emoji */
```

- [ ] **Step 2: `CLAUDE.md` 六条修订**

在「设计底层规范」一节按下表逐条改写。**只改这 6 条，其余 13 条一字不动。**

| 原文 | 改为 |
|---|---|
| 「全站不引入第 16 个色号」 | 「色号**按角色分类计数**，不设总数上限：结构中性色 4 + 品牌色 3（`--accent`/`--accent2`/`--highlight`）+ 状态语义色 5 + 状态文字色 5 + 图表分类色 8（其中 5 支复用前述）。新增任何一支须先归入某一类并说明理由。」 |
| 「间距只取 `--sp-1..7`(4/8/12/16/24/32/48)，4px 仅内联半步」 | 「间距只取 `--sp-0..7`(2/4/8/12/16/24/32/48)。**`--sp-0` 2px 仅限 chip/badge 内边距与描边偏移**，不得用于常规布局间距；4px 仍限内联半步。」 |
| 「排版严格层级：六级 `--fs-1..6`」 | 追加一句：「**图标字号 `--fs-icon-sm`(10)/`--fs-icon-lg`(24) 不属于六级层级**，仅用于图标与 emoji，不得承载正文。」 |
| 「阴影最多两层」 | 追加一句：「该条约束的是**投影**。`box-shadow: 0 0 0 2px var(--accent) inset` 作为选中描边不计入两层限制，但**只准用 `--accent`、宽度只准 2px**。」 |
| 「排版严格层级…每级字号·字重·色锁定」 | 追加一句：「**卡内小标题固定 `--fs-3` / 600 / `--txt`**（现状 `.gov-h` 用 700、`.yt-h` 用 600，以多数派 600 为准）。」 |
| （新增一条，放在「统一卡片」之后） | 「**页头与 tab 条**：页头 = 标题（`--fs-4`/700/`--txt`）+ 右对齐 actions，下边距 `--sp-3`；tab 条位于页头之下、筛选行之上，选中态用抬起 chip（`--card` 底 + `--accent` 字 + `--shadow-1`）。二者由 `PageHeader.vue` / `PageTabs.vue` 唯一实现，页面不得自绘。」 |

- [ ] **Step 3: 验证令牌可用**

Run: `npm --prefix frontend run build`
Expected: 构建成功。（新令牌暂无消费方，此步只验证 CSS 语法未破坏。）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/styles/theme.css CLAUDE.md
git commit -m "feat(design): V4.4.9 约束层修订 —— 补 --sp-0 与图标字号档,订正色号计数口径

六条修订:色号改按角色分类计数(总数封顶的写法作废,实际 21 支);
间距补 --sp-0 2px(现状 31 处硬写无令牌可用);补图标字号两档(明确不属
六级文字层级);阴影条补 inset 描边的说法;卡内小标题字重定为 600;
新增页头与 tab 条条目(V4.4.7/4.4.8 的成果此前无规范依据)。
其余 13 条一字未动。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 三个小组件

**Files:**
- Create: `frontend/src/components/AppEmpty.vue` + `AppEmpty.test.ts`
- Create: `frontend/src/components/AppPager.vue` + `AppPager.test.ts`
- Create: `frontend/src/components/AppButton.vue` + `AppButton.test.ts`

**Interfaces:**
- Produces:
  - `<AppEmpty>文案</AppEmpty>`，可选 `variant?: 'default' | 'plain'`
  - `<AppPager v-model:page="p" v-model:size="s" :total="n" />`，可选 `sizes?: number[]`
  - `<AppButton @click="fn">文案</AppButton>`，透传 `disabled` / `data-test` 等原生属性

- [ ] **Step 1: 写三个组件的失败测试**

`AppEmpty.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AppEmpty from './AppEmpty.vue'

describe('AppEmpty', () => {
  it('渲染插槽文案', () => {
    const w = mount(AppEmpty, { slots: { default: '暂无数据' } })
    expect(w.text()).toBe('暂无数据')
  })

  it('default 变体取值与被替换的现状一致(视觉零变化契约)', () => {
    // 被替换的 cv-empty/cd-empty/iv-empty/mv-empty/pv-empty 统一是:
    // color --mut / text-align center / background --card / border 1px --line / radius --r-md
    const css = readFileSync(resolve(__dirname, 'AppEmpty.vue'), 'utf-8')
    expect(css).toMatch(/\.ae\b[^}]*color:\s*var\(--mut\)/)
    expect(css).toMatch(/\.ae\b[^}]*text-align:\s*center/)
    expect(css).toMatch(/\.ae\b[^}]*background:\s*var\(--card\)/)
    expect(css).toMatch(/\.ae\b[^}]*border-radius:\s*var\(--r-md\)/)
  })

  it('plain 变体无边框无背景(供 bv-empty 那种简单场景)', () => {
    const w = mount(AppEmpty, { props: { variant: 'plain' }, slots: { default: 'x' } })
    expect(w.classes()).toContain('ae--plain')
  })
})
```

`AppPager.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AppPager from './AppPager.vue'

const mountPager = (props: Record<string, unknown>) =>
  mount(AppPager, { props, global: { plugins: [ElementPlus] } })

describe('AppPager', () => {
  it('渲染「共 N 条」与分页器', () => {
    const w = mountPager({ page: 1, size: 20, total: 137 })
    expect(w.text()).toContain('共 137 条')
    expect(w.find('.el-pagination').exists()).toBe(true)
  })

  it('「共 N 条」挂 .u-num(等宽数字,刷新不跳动)', () => {
    const w = mountPager({ page: 1, size: 20, total: 5 })
    expect(w.find('.ap-total').classes()).toContain('u-num')
  })

  it('默认 sizes 为主流的 [20,50,80,100]', () => {
    const w = mountPager({ page: 1, size: 20, total: 5 })
    expect((w.vm as any).effectiveSizes).toEqual([20, 50, 80, 100])
  })

  it('sizes 可覆盖(少数页用 [50,100])', () => {
    const w = mountPager({ page: 1, size: 50, total: 5, sizes: [50, 100] })
    expect((w.vm as any).effectiveSizes).toEqual([50, 100])
  })

  it('切页 emit update:page', async () => {
    const w = mountPager({ page: 1, size: 20, total: 200 })
    ;(w.vm as any).onPage(3)
    expect(w.emitted('update:page')![0]).toEqual([3])
  })

  it('切每页条数 emit update:size', async () => {
    const w = mountPager({ page: 3, size: 20, total: 200 })
    ;(w.vm as any).onSize(50)
    expect(w.emitted('update:size')![0]).toEqual([50])
  })
})
```

`AppButton.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AppButton from './AppButton.vue'

describe('AppButton', () => {
  it('渲染插槽文案并透传 click', async () => {
    const w = mount(AppButton, { slots: { default: '导出Excel' } })
    expect(w.text()).toBe('导出Excel')
    await w.trigger('click')
    expect(w.emitted('click')).toBeTruthy()
  })

  it('透传原生属性(data-test / disabled)', () => {
    const w = mount(AppButton, { attrs: { 'data-test': 'x-export', disabled: true }, slots: { default: 'x' } })
    expect(w.attributes('data-test')).toBe('x-export')
    expect(w.attributes('disabled')).toBeDefined()
  })

  it('取值与被替换的 13 处自写按钮一致(视觉零变化契约)', () => {
    // 现状清一色:border-radius --r-sm / padding var(--sp-1) var(--sp-3)
    // / background --card / border 1px --line
    const css = readFileSync(resolve(__dirname, 'AppButton.vue'), 'utf-8')
    expect(css).toMatch(/\.ab\b[^}]*border-radius:\s*var\(--r-sm\)/)
    expect(css).toMatch(/\.ab\b[^}]*padding:\s*var\(--sp-1\)\s+var\(--sp-3\)/)
    expect(css).toMatch(/\.ab\b[^}]*background:\s*var\(--card\)/)
  })

  it('挂 .u-press(按下回弹,与全站自绘按钮一致)', () => {
    const w = mount(AppButton, { slots: { default: 'x' } })
    expect(w.classes()).toContain('u-press')
  })
})
```

- [ ] **Step 2: 运行确认全部失败**

Run: `npm --prefix frontend run test:run -- src/components/AppEmpty.test.ts src/components/AppPager.test.ts src/components/AppButton.test.ts`
Expected: FAIL —— 三个组件文件都不存在

- [ ] **Step 3: 实现 `AppEmpty.vue`**

```vue
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'default' | 'plain' }>(), { variant: 'default' })
</script>

<template>
  <div class="ae" :class="`ae--${variant}`"><slot /></div>
</template>

<style scoped>
/* 取值与被替换的 cv-empty/cd-empty/gov-empty/iv-empty/mv-empty/pv-empty 一致 → 视觉零变化。
   padding 取多数派 var(--sp-7) 0;个别原为 --sp-4/--sp-6 的按本规格归位(预期内的轻微变化)。 */
.ae { color: var(--mut); text-align: center; }
.ae--default {
  padding: var(--sp-7) 0;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
/* plain:无边框无背景,供原 bv-empty 那种嵌在卡内的简单空态 */
.ae--plain { padding: var(--sp-4); }
</style>
```

- [ ] **Step 4: 实现 `AppPager.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  page: number
  size: number
  total: number
  sizes?: number[]
}>(), { sizes: undefined })

const emit = defineEmits<{ 'update:page': [number]; 'update:size': [number] }>()

/** 默认取全站主流配置(13/17 处用的就是这两组),少数页可传 sizes 覆盖。 */
const effectiveSizes = computed(() => props.sizes ?? [20, 50, 80, 100])

function onPage(v: number) { emit('update:page', v) }
function onSize(v: number) { emit('update:size', v) }

defineExpose({ effectiveSizes, onPage, onSize })
</script>

<template>
  <div class="ap">
    <span class="ap-total u-num">共 {{ total }} 条</span>
    <el-pagination
      :current-page="page" :page-size="size" :page-sizes="effectiveSizes" :total="total"
      layout="sizes, prev, pager, next" size="small" background
      @update:current-page="onPage" @update:page-size="onSize" />
  </div>
</template>

<style scoped>
/* 与被替换的 cv-pager/pn-pager/pov-pager 逐字相同(三者原本一字不差) */
.ap { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.ap-total { font-size: var(--fs-2); color: var(--mut); }
</style>
```

- [ ] **Step 5: 实现 `AppButton.vue`**

```vue
<script setup lang="ts">
// 不声明 props:全部原生属性(disabled/data-test/title 等)经 fallthrough 透传到 <button>。
</script>

<template>
  <button type="button" class="ab u-press"><slot /></button>
</template>

<style scoped>
/* 取值与被替换的 13 处自写按钮一致(它们原本清一色如此) → 视觉零变化 */
.ab {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-2);
  color: var(--txt);
  cursor: pointer;
  line-height: var(--lh-base);
  transition: background-color var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease);
}
.ab:hover:not(:disabled) { background: var(--hover-tint); }
.ab:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
</style>
```

- [ ] **Step 6: 运行确认通过**

Run: `npm --prefix frontend run test:run -- src/components/AppEmpty.test.ts src/components/AppPager.test.ts src/components/AppButton.test.ts`
Expected: PASS（3 + 6 + 4 = 13 项）

- [ ] **Step 7: 反向验证（必做）**

三个组件各改坏一项取值（如把 `AppButton` 的 `--r-sm` 改成 `--r-md`），确认对应契约用例变红，随后还原并复跑。本仓已有多次假绿先例（V4.0.5 `record_sent`、V4.4.4 恒真断言、V4.4.6 `toContain` 碰瓷同页文案）。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/components/AppEmpty.vue frontend/src/components/AppEmpty.test.ts frontend/src/components/AppPager.vue frontend/src/components/AppPager.test.ts frontend/src/components/AppButton.vue frontend/src/components/AppButton.test.ts
git commit -m "feat(components): V4.4.9 新增 AppEmpty / AppPager / AppButton

三者取值均与被替换的现状逐条相同,写成契约测试锁死「视觉零变化」。
AppPager 默认取全站主流配置([20,50,80,100] + sizes/prev/pager/next,
分别是 13/17 处的用法),少数页可传 sizes 覆盖。
AppButton 不声明 props,原生属性经 fallthrough 透传。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3-6 通用替换模式

以下四个 Task 是同一模式在不同文件集上的应用。**每个 Task 只碰自己那组文件。**

**模式甲 —— 空态**

```vue
<!-- 改前 -->
<div v-if="!rows.length" class="pv-empty">暂无项目主域数据——请在「数据管理」…</div>
<!-- 改后 -->
<AppEmpty v-if="!rows.length">暂无项目主域数据——请在「数据管理」…</AppEmpty>
```

**模式乙 —— 分页**

```vue
<!-- 改前 -->
<div v-if="rows.length" class="pv-pager">
  <span class="pv-total u-num">共 {{ filtered.length }} 条</span>
  <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
    :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
    layout="sizes, prev, pager, next" size="small" background />
</div>
<!-- 改后 -->
<AppPager v-if="rows.length" v-model:page="currentPage" v-model:size="pageSize" :total="filtered.length" />
```

**若该页原 `page-sizes` 不是 `[20,50,80,100]`，传 `:sizes="[...]"` 保持原值** —— 本期不统一分页档位（那是行为变化，不属「视觉零变化」范围）。

**模式丙 —— 按钮**

```vue
<!-- 改前 -->
<button class="cd-btn" data-test="cost-export" @click="onExport">导出Excel</button>
<!-- 改后 -->
<AppButton data-test="cost-export" @click="onExport">导出Excel</AppButton>
```

**三条铁律**：

1. **`data-test` 属性一律原样保留** —— 大量既有测试靠它定位，丢一个就红一片。
2. **替换后删除该文件里已无引用的 `.xx-empty` / `.xx-pager` / `.xx-total` / `.xx-btn` 样式规则**；删前 `grep` 确认本文件内确无其他引用。
3. **`v-if` 条件原样搬到组件上**，不要改成 `v-show` 或挪到外层包裹 div。

**每类各补一条断言的样板**（各 Task 照抄改选择器与页面）：

```ts
  it('空态改用 AppEmpty 渲染', async () => {
    const w = mountView()              // 沿用该测试文件既有的挂载辅助
    await flushPromises()
    // 用空数据触发空态的方式各页不同:有的清 store、有的设筛选条件,照该文件既有空态用例的做法
    expect(w.find('.ae').exists()).toBe(true)
    expect(w.find('.ae').text()).toContain('暂无')
  })

  it('分页改用 AppPager,且 data-test 与档位不变', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.ap').exists()).toBe(true)
    expect(w.find('.ap-total').text()).toContain('共')
  })

  it('按钮改用 AppButton,data-test 原样保留(既有测试靠它定位)', async () => {
    const w = mountView()
    await flushPromises()
    const btn = w.find('[data-test="cost-export"]')   // 各页换成自己的 data-test 值
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).toContain('ab')
  })
```

**每个 Task 的验证**：`npm --prefix frontend run test:run -- <本组涉及的 *.test.ts>`，全绿后提交。

---

### Task 3: 项目域 views（6 文件）

**Files:**

| 文件 | 空态 | 分页 | 按钮 |
|---|---|---|---|
| `views/ProjectsView.vue` | `.pv-empty:260` | `.pv-pager:264` | — |
| `views/ClosedProjectsView.vue` | `.cv-empty:108` | `.cv-pager:111` | — |
| `views/InsightView.vue` | `.iv-empty:231` | — | — |
| `views/MilestoneView.vue` | `.mv-empty:318` | — | — |
| `views/RiskBoardView.vue` | `.rv-empty:199` | — | — |
| `views/CostDetailView.vue` | `.cd-empty:263` | `.cd-pager:270` | `.cd-btn:266`（2 处用法：重置、导出Excel） |

- [ ] **Step 1-3**：按三种模式逐文件替换，删除已无引用的样式规则，各页补一条断言（空态页断言 `.ae` 存在、分页页断言 `.ap` 存在、按钮页断言 `AppButton` 渲染且 `data-test` 保留）。

- [ ] **Step 4: 验证并提交**

Run: `npm --prefix frontend run test:run -- src/views/ProjectsView.test.ts src/views/ClosedProjectsView.test.ts src/views/InsightView.test.ts src/views/MilestoneView.test.ts src/views/RiskBoardView.test.ts src/views/CostDetailView.test.ts`

```bash
git commit -m "refactor(views): V4.4.9 项目域 6 页接入 AppEmpty/AppPager/AppButton

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 其余 views（7 文件）

**Files:**

| 文件 | 空态/404 | 分页 | 按钮 |
|---|---|---|---|
| `views/OverviewView.vue` | `.ov-anomaly-empty:305`（**用 `plain` 变体** —— 它原本 padding 是 `--sp-4`、嵌在卡内） | — | — |
| `views/ProjectDetailView.vue` | `.pd-404:442` | — | — |
| `views/ClosedProjectDetailView.vue` | `.cd-404:82` | — | — |
| `views/DataQualityView.vue` | `.gov-empty:81` | — | — |
| `views/OpportunitiesView.vue` | — | `.opp-pager:336` | — |
| `views/PayNodesView.vue` | — | `.pn-pager:144`（含 `.pn-pager` 与其相邻规则两条） | `.pv-btn:137` |
| `views/PayProjectsView.vue` | — | `.pov-pager:153`（同上两条） | `.pov-btn:150` |

**注意**：`PayNodesView` / `PayProjectsView` 的导出按钮已在 V4.4.8 移入 `PageHeader` 的 `#actions` 插槽，替换时保持它在插槽内、只换标签。

- [ ] **Step 1-3**：同 Task 3 的三种模式。`OverviewView` 那处**必须用 `variant="plain"`**，否则会给一个嵌在卡内的空态套上第二层边框。

- [ ] **Step 4: 验证并提交**

Run: `npm --prefix frontend run test:run -- src/views/OverviewView.test.ts src/views/ProjectDetailView.test.ts src/views/ClosedProjectDetailView.test.ts src/views/DataQualityView.test.ts src/views/OpportunitiesView.test.ts src/views/PayNodesView.test.ts src/views/PayProjectsView.test.ts`

```bash
git commit -m "refactor(views): V4.4.9 其余 7 页接入三组件(OverviewView 用 plain 变体)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 倚天 views（3 文件）

**Files:**

| 文件 | 分页 |
|---|---|
| `views/YitianAnalyticsView.vue` | `.yt-pager:321` |
| `views/YitianComplianceView.vue` | `.yt-pager:301` |
| `views/YitianDetailView.vue` | `.yd-pager:167` |

**注意**：这三页的 `pageSize` 在 V4.4.8 已接入 `usePersistedRefs` 持久化。替换分页组件时 **`v-model:size="pageSize"` 必须仍绑到同一个 ref**，否则持久化会失效且无测试会红（V4.4.8 的页面级往返测试只断言 ref 值，不关心谁在改它）。

- [ ] **Step 1-3**：三处均为模式乙。替换后**手动确认** `pageSize` 仍是 `usePersistedRefs` 参数里的那个 ref。

- [ ] **Step 4: 验证并提交**

Run: `npm --prefix frontend run test:run -- src/views/YitianAnalyticsView.test.ts src/views/YitianComplianceView.test.ts src/views/YitianDetailView.test.ts`

```bash
git commit -m "refactor(views): V4.4.9 倚天 3 页接入 AppPager(pageSize 仍绑持久化 ref)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: components（9 文件）

**Files:**

| 文件 | 分页 | 按钮 |
|---|---|---|
| `components/AuditLogTab.vue` | `.audit-pager:133` | — |
| `components/MilestoneDelayedTab.vue` | `.mdt-pager:90` | `.mdt-btn:87`（重置、导出Excel） |
| `components/MilestonePlanTab.vue` | `.mpt-pager:69` | `.mpt-btn:65` |
| `components/MilestoneReminderTab.vue` | `.mrt-pager:145` | `.mrt-btn:139` |
| `components/NoStageProjectsTable.vue` | `.nsp-pager:61` | `.nsp-btn:58` |
| `components/FollowupRecordForm.vue` | — | `.frf-btn:103`（**padding 原为 `--sp-1) var(--sp-4)`，与标准的 `--sp-3` 不同** → 按标准归位，列入目验） |
| `components/FollowupRecords.vue` | — | `.fr-hist-btn:171`（**padding 原为 `--sp-1) var(--sp-2)`** → 同上） |
| `components/PortalConfigCard.vue` | — | `.pc-btn:131` |
| `components/RichTextCell.vue` | — | `.rtc-cancel:168`（**padding 原为 `2px var(--sp-3)`** → 归位为 `--sp-1`，即 2px→4px） |

- [ ] **Step 1-3**：同前三个 Task。上表标注的三处 padding 与标准不符，**按标准归位**（这正是本期要消除的不一致），并全部列入人工目验清单。

- [ ] **Step 4: 验证并提交**

Run: `npm --prefix frontend run test:run -- src/components/AuditLogTab.test.ts src/components/MilestoneDelayedTab.test.ts src/components/MilestonePlanTab.test.ts src/components/MilestoneReminderTab.test.ts src/components/NoStageProjectsTable.test.ts src/components/FollowupRecordForm.test.ts src/components/FollowupRecords.test.ts src/components/PortalConfigCard.test.ts src/components/RichTextCell.test.ts`

```bash
git commit -m "refactor(components): V4.4.9 9 个组件接入 AppPager/AppButton(3 处 padding 按标准归位)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 零残留守卫 + 发版

**Files:**
- Modify: `frontend/src/views/__pageHeader.test.ts`
- Modify: `frontend/src/version.ts` · `PROGRESS.md`

- [ ] **Step 1: 追加零残留守卫**

在 `views/__pageHeader.test.ts` 的 describe 内追加：

```ts
  it('views 与 components 里不得再有自写的空态/分页/按钮样式', () => {
    // 迁移完成的反向证明。今后新页面要用 AppEmpty/AppPager/AppButton,不许再各写一份。
    const dirs = [viewsDir, resolve(viewsDir, '../components')]
    const BAN = /^\.[a-z][\w-]*-(empty|pager|total|btn)\s*[,{]/m
    const offenders: string[] = []
    for (const d of dirs) {
      for (const f of readdirSync(d).filter((x) => x.endsWith('.vue'))) {
        // 登录页与改密页豁免(全屏页专属设计);404 态由 AppEmpty 承担但类名不含 empty,单列
        if (['LoginView.vue', 'ChangePasswordView.vue'].includes(f)) continue
        if (BAN.test(readFileSync(resolve(d, f), 'utf-8'))) offenders.push(f)
      }
    }
    expect(offenders).toEqual([])
  })
```

- [ ] **Step 2: 运行确认通过**

Run: `npm --prefix frontend run test:run -- src/views/__pageHeader.test.ts`
Expected: PASS。若有 offender，说明前面某个 Task 漏删了样式规则，回去补删。

- [ ] **Step 3: 版本号与 PROGRESS**

`version.ts` → `V4.4.9` / `2026-07-26`；`PROGRESS.md` 追加条目（要点：6 条约束修订 + 三组件 39 处替换 + 统计三次才准的教训 + 待目验的 4 处 padding 归位）。

- [ ] **Step 4: 全量验证**

Run: `bash verify.sh`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/__pageHeader.test.ts frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.4.9 约束修订 + AppEmpty/AppPager/AppButton

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## 完成后的人工目验清单（自动化盖不到）

1. **四处 padding 归位**：`OverviewView` 的异常空态（用 plain 变体）、`FollowupRecordForm` 的按钮（`--sp-4`→`--sp-3`）、`FollowupRecords` 的历史按钮（`--sp-2`→`--sp-3`）、`RichTextCell` 的取消按钮（`2px`→`--sp-1`）—— 这是本期仅有的预期视觉变化
2. **分页档位**：原 `page-sizes` 非 `[20,50,80,100]` 的页面（3 处 `[20,50,100]`、1 处 `[50,100]`），确认下拉档位与改造前一致
3. **倚天三页的 pageSize 持久化**：切每页条数 → 切走再回来 → 档位仍在（V4.4.8 的能力不能被本期打断）
4. 深色模式下看 `AppEmpty` / `AppButton` 的边框与背景对比度
5. 各页空态：清空筛选条件触发空态，确认文案与边框位置正常
