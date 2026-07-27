# 页面顶部区统一 + 视图状态持久化设计（V4.4.8，Z 级）

> 「整体前端优化」四期计划的第二个交付单元，由两条独立起因的工作合并而成：
> **Part A** = 1a-fix 视图状态持久化（V4.4.7 冒烟反馈）
> **Part B** = 1b 页头与顶部区分层（四期计划原定的第二期）
>
> 本文取代并合并 `2026-07-26-view-state-persistence-design.md`（该文件已删除，内容并入 Part A）。

## 0. 为什么合并

两者动的是**同一块地方**：页面顶部区与页面级状态。分两个版本做，`ProjectsView` 这类文件要连续改两遍，第二遍还得 revisit 第一遍的决定。合并后一次改到位。

版本 Z 级（用户钦定，判据：功能不变、仅作优化）。

---

# Part A：视图状态持久化

## A1. 背景：tab 化暴露了一个一直存在的缺陷

用户冒烟 V4.4.7 后反馈：「在 `/payment/board` 用某维度下钻 → 切到「回款日历」tab → 再切回来，回到默认页面，无点击下钻的持久化。」

查证结论 —— **不是 1a 引入的**：

`BoardView.vue:43-51` 中 `mode` / `dimKey` / `secondDim` / `metricKey` / `rowDims` / `colDims` / `sortKey` / `chartTypes` 八个用户选择全是组件内 `ref`，其中只有 `dimKey` 会在 setup 时从 `route.query.dim` 读一次初始值，此后用户的任何切换都不写回任何地方。而 `BoardView` 不在 `KEEPALIVE_ROUTES` 名单（那 7 个全是表格页）。离开页面即销毁、选择全丢 —— 1a 之前从侧栏点走再点回来同样如此。

`PageTabs` 传递 `route.query` 的实现是对的，但 query 里本来就没有东西可传。

**但这不构成免责**：tab 把两个页面呈现为「同一页的两个视图」，用户对状态保持的预期随之改变。是 tab 化把一个一直没人计较的缺陷变成了真问题。

**用户决策**：不等各页出现痛点再逐个修，一次全面铺开。

## A2. 方案选型：为什么不写回 URL

初次讨论时选定「写回 URL」，清点状态数量后由用户改选本方案。更正过程记录在此，因为它决定了设计走向：

| | 方案 | 得 | 失 |
|---|---|---|---|
| 甲 | 写回 URL query | 可分享链接、浏览器前进后退可用 | **8 个状态、其中 3 个是数组**，URL 长成 `?mode=single&dim=dept&secondDim=&metric=contractSum&rowDims=dept&colDims=&sort=projectCount&chartTypes=bar`；数组序列化易错；5 个页面各写一套 |
| **丙（采用）** | **localStorage 持久化**，复用倚天已验证的范式 | URL 干净；跨页 + 刷新都保持；按登录账号隔离；消除「两套状态模式并存」 | 不可分享链接 |

选丙的核心理由：本平台是**内网单机离线**系统，分享链接的场景几乎不存在，而「我上次看的视角还在」天天发生。`goBoard` 的 `?dim=` 予以保留（见 A4.3），两者不冲突。

**倚天域早已把这题做对**：`useYitianViewStore` + `localStorage` + `userScopedKey`，已在生产跑了一年。本期是把这套范式推广到其余页面 —— 与 1a 发现 `YitianToolbar` 是「已验证原型」是同一回事。

## A3. 范围：8 个页面，不是 10 个

| 页面 | 需持久化的用户选择 |
|---|---|
| `BoardView` | `mode` `dimKey` `secondDim` `metricKey` `rowDims` `colDims` `sortKey` `chartTypes`（8） |
| `InsightView` | `selectedTags` `mode` `dimKey` `secondDim` `metricKey` `rowDims` `colDims` `chartTypes`（8） |
| `RiskBoardView` | `dimKey` `metricKey` `chartTypes` `levelFilter` `rowDims` `colDims` `ovMetric`（7） |
| `MilestoneView` | `selectedTags` `faGran` `faYear` `nodeYear` `detailTab`（5） |
| `CostDetailView` | `fKw` `selectedTags` `kpiFilter`（3） |
| `CalendarView` | `view`（1） |
| `YitianAnalyticsView` | `pageSize`（`currentPage` 不持久化） |
| `YitianComplianceView` | `pageSize`（同上） |

**不在范围内**：`YitianTrendView` / `YitianCustomerView` 组件内 `ref` 为 **0**，主状态全在 `useYitianViewStore`，没有会丢的东西；倚天四页的 `start`/`end`/`weekMode`/`l4s` 已由该 store 持久化，不动。

**为什么 `CostDetailView` 已 keep-alive 仍要改**：`AppLayout.vue:30` 是 `<keep-alive :max="2">`，而 `project-analysis` 组有 **4 个 tab**。4 个 tab 轮换时 `max=2` 必然淘汰缓存。keep-alive 保住组件实例（连滚动位置），持久化在实例被淘汰后兜底 —— 两者互补而非重复。

## A4. 技术设计

### A4.1 用 composable 而非 store

倚天用 store 是因为 **6 个页面共享同一份** `start`/`end`/`l4s`，必须靠 store 跨组件同步。本期 8 个页面的状态**各自独立**（board 的 `dimKey` 与 insight 的 `dimKey` 无关），用 store 要凭空多出 8 个 store 文件。

新建 `frontend/src/composables/usePersistedRefs.ts`。

**关键设计：接收现有的一组 `ref`，不要求页面把状态改写成单个对象。** 各页保持 `const mode = ref('single')` 原样，只在下方加一行调用 —— 改动量最小，不触碰任何计算逻辑。

```ts
import { watch, type Ref } from 'vue'
import { userScopedKey } from '@/lib/userScopedKey'

/** 把一组页面视图 ref 按登录账号持久化到 localStorage(V2.8.3 范式,与 useYitianViewStore 同源)。
 *  须在组件 setup 内调用(userScopedKey 需要 pinia active)。
 *  只收「用户选择」类状态 —— modal 开关/DOM 引用/分页页码绝不传进来,理由见 A4.2。 */
export function usePersistedRefs(baseKey: string, refs: Record<string, Ref<any>>): void {
  let hydrated = false
  try {
    const raw = localStorage.getItem(userScopedKey(baseKey))
    if (raw) {
      const p = JSON.parse(raw) as Record<string, unknown>
      for (const [k, r] of Object.entries(refs)) {
        const v = p[k]
        if (v === undefined) continue
        // 类型护栏:存档结构与当前代码不符时跳过该键,不污染运行时
        if (Array.isArray(r.value) !== Array.isArray(v)) continue
        if (!Array.isArray(v) && r.value !== null && typeof r.value !== typeof v) continue
        r.value = v
      }
    }
  } catch {
    /* 坏 JSON / 隐私模式:忽略,用默认值 */
  }
  hydrated = true

  watch(Object.values(refs), () => {
    if (!hydrated) return
    try {
      const out: Record<string, unknown> = {}
      for (const [k, r] of Object.entries(refs)) out[k] = r.value
      localStorage.setItem(userScopedKey(baseKey), JSON.stringify(out))
    } catch {
      /* 配额满:静默降级为不持久化 */
    }
  }, { deep: true })
}
```

沿用 `useYitianViewStore` 的三条既有做法：`hydrated` 标志防止未水合时把默认值糊掉存档、`try/catch` 静默降级、`deep: true` 监听数组变更。

**新增一条它没有的类型护栏**：本期 8 个页面各存一份结构不同的档，今后任何一次「改默认值 / 换类型 / 删状态」都会让旧存档与新代码错位；没有护栏就会把字符串灌进本该是数组的 `ref`，页面直接崩。注意 `r.value !== null` 的位置 —— `MilestoneView` 的 `faYear` / `nodeYear` 是 `ref<number | null>(null)`，`typeof null === 'object'` 会与存档里的 `number` 误判为不符，必须先放行 null。

### A4.2 三类状态绝不持久化

**① modal 开关与其载荷**（`drillOpen` / `drillTitle` / `drillGroup` / `drillRows` / `statusOpen` / `statusTitle` / `statusRows`）—— 存了 `drillOpen: true` 会导致**下次进页面直接弹出一个空 modal**；载荷是运行时算出的对象，反序列化后与当前数据对不上。

**② DOM 引用**（`CostDetailView` 的 `detailCardRef`）—— `HTMLElement` 无法序列化。

**③ 分页页码 `currentPage`** —— `pageSize` 是用户偏好该记；`currentPage` 是浏览位置不该记，「回来还停在第 5 页」不符预期，且数据量变化后可能越界。

### A4.3 优先级：默认值 → localStorage → URL

`goBoard(router, dim)` 带 `?dim=xxx` 跳转，这是**显式的跳转意图**，必须压过「上次的选择」。`BoardView` 改造后：

```ts
const dimKey = ref('dept')                                  // ① 默认值
usePersistedRefs('view_board', { mode, dimKey, secondDim, metricKey, rowDims, colDims, sortKey, chartTypes })
                                                            // ② localStorage 覆盖默认值
const rawDim = typeof route.query.dim === 'string' ? route.query.dim : ''
const aliasDim = rawDim === 'orgL4' ? 'dept' : rawDim        // 既有别名映射,保留
if (aliasDim && DIMENSIONS.some((d) => d.key === aliasDim)) dimKey.value = aliasDim   // ③ URL 最高
```

三层顺序在代码里就是自上而下三行，无需额外机制。其余 7 页没有 URL 入参，只有 ① ② 两层。

### A4.4 localStorage key 与 reset

`view_<页面标识>`，经 `userScopedKey` 加账号前缀：`view_board` · `view_insight` · `view_risk` · `view_milestone` · `view_costdetail` · `view_calendar` · `view_yitian_analytics` · `view_yitian_compliance`。与倚天既有的 `yitian_view` 不冲突。

**不提供 `reset()`，登出时也不清存档。** `useYitianViewStore` 有 `reset()` 是因为它是常驻 store，换账号时内存里的旧值会残留；composable 随组件卸载即销毁，不存在内存残留。存档已由 `userScopedKey` 按账号隔离。

---

# Part B：页头与顶部区分层

## B1. 背景：同一段 CSS 被复制了 6 遍

1a 的 grill 中查明「堆砌」的准确定义是**页面之间没有共享骨架，每页从零拼装**。写本 spec 时进一步查实，它在顶部区的具体形态是**逐字复制**：

`.toolbar` 的样式定义在 6 个页面里一字不差地重复了 6 遍：

```css
/* ProjectsView / ClosedProjectsView / KeyProjectsView / RiskFollowupView
   / OpportunityFollowupView / PaymentKeyFollowupView 各写一遍 */
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
```

页标题样式重复了 5 遍，仅 margin 略有差异：

```css
.pv-title / .cv-title / .kp-title / .av-title / .bd-title / .dv-title
  { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
```

**这个发现下调了 Part B 的风险评级**：各页本来就长一样，抽成组件是**视觉零变化**的纯去重，不是重新设计。真正会被用户感知的变化只有一处 —— 操作按钮从 `.toolbar` 挪到页头右侧（B4.2）。

## B2. 现状的三种形态

| 形态 | 页面 | 说明 |
|---|---|---|
| 标题 + `.toolbar` | `/projects` `/projects/closed` `/projects/key` `/risk` `/opportunities/key` `/payment/key` | 主流，6 页 |
| 标题 + 自定义 toolbar | `/activity`（`av-toolbar`）、`/budget`、`/data` | 3 页 |
| **无页标题** | 倚天 6 页、`/payment` 回款总览 | 7 页 |

## B3. 决策：全员必有页头，且页头承载页级操作

grill 中确认的取舍：**如果页头只写一遍页名，它与侧栏高亮冗余，加了就是每页净损失 40~60px** —— 而用户的原始诉求里恰恰有「信息庞大冗杂」一条。

让页头值得存在的唯一办法，是让它承载现在**没有固定位置**的东西：页级操作按钮。位置统一了才有肌肉记忆，这才是「整体感」的实质，而不是四个 `h2` 长得一样。

**页头不显示数据时效** —— 全局 `AppHeader:41` 已有「数据已同步」指示，页头再放一次是第二次冗余。（YAGNI）

## B4. 技术设计

### B4.1 三段式结构

```
┌ PageHeader ──────────────────────────────┐
│  标题                      [页级操作按钮] │   ← 新组件,全员必有
├──────────────────────────────────────────┤
│  筛选行(.toolbar):搜索 / 筛选 / 选列      │   ← 位置归拢,实现一行不改
├──────────────────────────────────────────┤
│  主体:表格 / 图表 / 表单                  │   ← 不动
└──────────────────────────────────────────┘
```

新建 `frontend/src/components/PageHeader.vue`：

```vue
<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="ph">
    <h2 class="ph-title">{{ title }}</h2>
    <div class="ph-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
/* 取值与被替换的 6 份 .XX-title 一致(--fs-4 / 700 / --txt),故视觉零变化。 */
.ph { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.ph-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.ph-actions { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; }
</style>
```

标题**由各页显式传入**而非从 `route.meta.title` 自动取。理由：`/insight` 的 `meta.title` 是「项目分析」而 tab 条里显示「多维分析」（V4.4.7 §4.2 已确立二者独立），自动取会让页面标题与 tab 标签打架；且 `/project/:id` 这类详情页的标题是动态的（项目名），本就取不到。

### B4.2 哪些操作进页头：作用于整页数据的辅助操作

**判据**：作用于**整页数据**的辅助操作进页头；**页面主流程**操作与**行内**操作留原地。

| 进页头 | 页面 |
|---|---|
| 导出 | `/projects` `/activity` `/projects/key` `/risk` `/opportunities/key` `/payment/key` `/yitian/detail` `/yitian/compliance` |
| 新增商机 | `/opportunities` |
| 导入 / 删除（超管） | `/opportunities` |
| 范围设置 / 归档（超管） | 四张跟进表 |

| 留原地 | 理由 |
|---|---|
| `/budget` 的 存档 / 新建报价 / 保存 / 导出 Excel | 工具页的**主流程**，不是辅助操作。强行搬进页头会把一个表单工具套成表格页的模板 —— grill 时判定「丙档过度」的正是这类情况 |

**「新增商机」进页头、「新建报价」留原地，看似矛盾，判据是页面类型而非按钮文案**：`/opportunities` 是**表格页**，「新增商机」是往当前表格里加一行、作用于整页数据；`/budget` 是**表单工具页**，「新建报价」是重置整个表单开启新一轮流程，属于该页的主流程本身。凡遇到类似分歧，按「这个页面是在展示一个数据集合，还是在完成一件事」来判。
| 各表格的行内「编辑」「跟进」按钮 | 行内操作，不作用于整页 |
| 「清除所有筛选」 | 属于筛选行的一部分，随筛选留在 `.toolbar` |

**权限差异必须原样保留**：`/projects/key` 与 `/risk` 的导出是 `v-if="auth.isSuper"` 超管专属，而 `/projects` 的导出是全员可用。搬进页头后 `v-if` 一并搬，不得简化。

### B4.3 七个无页标题的页面

倚天 6 页与 `/payment` 回款总览要**新增**页头。这是本期唯一新增 UI 元素的地方，也是唯一会占用垂直空间的改动。

倚天 6 页的标题取侧栏 `TAB_GROUPS` / `YITIAN_LINKS` 的同名文案（工时总览 / 工时明细 / 合规检查 / 统计分析 / 趋势分析 / 客户支持分析），保证与导航一致。

`/payment` 用「回款总览」。

### B4.4 与第三期的分界线

Part B 只动**布局位置**，第三期动**实现**：

- **本期**：把筛选控件从与操作按钮混装的状态归拢进 `.toolbar` 容器；控件本身、状态、逻辑**一行不改**
- **第三期**：把 30 页各自的筛选实现收敛成一套声明式组件，换掉全局单例 `filterStore` 状态模型，删 26 处 `hideFilter`

同一块地方分两次改，但改的是不同层。**本期绝不碰** `useFilterStore` / `hideFilter` / `AppLayout.showFilter`。

### B4.5 去重收尾

替换完成后删除各页 scoped 样式里已无引用的 `.XX-title`（6 份）。`.toolbar` 的 6 份重复定义**本期保留不动** —— 它仍在被筛选行使用，抽取它属于第三期的工作，本期提前动会与第三期的容器设计冲突。

---

## 5. 测试

### Part A

**`usePersistedRefs` 单测**（新建 `composables/usePersistedRefs.test.ts`）：

1. 写入后读回：改 ref → localStorage 有值 → 新实例 hydrate 后 ref 恢复
2. **按账号隔离**：账号 A 写入的存档，账号 B hydrate 拿不到
3. 坏 JSON 不崩，回落默认值
4. **类型护栏**：存档里 `dimKey` 是数组而当前 ref 是字符串 → 跳过该键、其余键正常恢复
5. **null 初值不被护栏误杀**：`ref<number|null>(null)` 能被存档里的 `number` 正常恢复（防 `typeof null === 'object'` 误判）
6. `localStorage.setItem` 抛错（配额满）时不冒泡
7. 数组类状态（`rowDims`）变更能触发持久化（验证 `deep: true` 生效）

**页面级**：8 页各一条，模拟「设置状态 → 卸载 → 重新挂载」断言恢复。

**`BoardView` 专项**：URL `?dim=` 压过 localStorage 存档（A4.3 的三层顺序）。

**回归安全网**：加一条扫描测试遍历 8 个 view 源码，若 `usePersistedRefs` 的参数对象里出现含 `drill` / `Open` / `Ref` 字样的键即失败。防的是今后有人图省事把整组 ref 一股脑传进去。

### Part B

1. `PageHeader` 单测：渲染标题；`actions` 插槽内容出现在 `.ph-actions` 内
2. **权限差异回归**：`/projects/key` 与 `/risk` 的导出按钮在非超管账号下**不渲染**；`/projects` 的导出在普通账号下**渲染**
3. 七个新增页头的页面：断言标题文案与侧栏导航文案一致
4. **视觉零变化的证据**：`PageHeader` 的 `.ph-title` 取值与被替换的 `.XX-title` 逐条相同（字号 `--fs-4`、字重 700、色 `--txt`），写成契约测试比对
5. **分界线守卫**：加一条扫描测试，本期改动的 view 里不得新增对 `useFilterStore` / `hideFilter` 的引用（防 Part B 侵入第三期范围）

### 反向验证（两部分都必做）

临时注释掉某页的 `usePersistedRefs` 调用 / 某页的 `PageHeader` 引用，对应测试必须变红。本仓已有多次「测试全绿但功能从未接线」的先例（V4.0.5 的 `record_sent`、V4.4.4 的恒真断言、V4.4.6 的 `toContain` 碰瓷同页文案）。

## 6. 验收

- `bash verify.sh` 全绿
- **人工冒烟**（本期核心验收，自动化盖不到）：
  1. `/payment/board` 选维度「客户」+ 图表「饼图」→ 切「回款日历」→ 切回 → 维度与图表类型仍在
  2. 同上按 F5 → 状态仍在
  3. 从 `/payment` 点某维度下钻进 board → **URL 的 dim 生效**，而非上次存档的维度
  4. 换账号登录 → 看到自己的存档
  5. `/insight` 四个 tab 来回切 → 各自状态互不干扰（验证 8 个 key 未串档）
  6. **逐页目验页头**：标题位置、操作按钮右对齐、与下方筛选行的间距
  7. 用非超管账号看 `/projects/key` 与 `/risk` → 页头右侧**无导出按钮**

## 7. 升级

纯前端，仅换 `dist`；无需重启后端、无需点「更新数据」、无新增 `pageKey`。

Part A 首次升级后各页仍是默认状态（无存档），使用一次后开始生效；旧版本无 `view_*` 键，不存在迁移问题。

**升级手册须写明**：页级操作按钮（主要是「导出」）位置变更 —— 由筛选行内移至页面标题右侧。这是使用者唯一会感知到的变化，不写明会有人以为导出功能被删了。
