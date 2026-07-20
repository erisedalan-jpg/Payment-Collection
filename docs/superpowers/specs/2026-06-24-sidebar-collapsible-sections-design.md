# 侧边栏分区可折叠 设计文档（SP-1）

> 日期：2026-06-24　版本：V1.19.2（布局局部增强，Z 位）
> 所属拆分：4 子项目之一（SP-1）。其余 SP-2(重点跟进分区+重点项目进展页) / SP-3(/insight/risk 透视下钻) / SP-4(/insight/milestone 到期提醒表) 各自独立、后续单独走闭环。
> 状态：设计已与用户确认（默认展开策略=仅展开当前页所在分区），待用户复核本 spec 后转 writing-plans。

## 1. 目标

左侧边栏分区过长。让**每个导航分区标题可点击展开/收起**其子链接，缩短侧栏；折叠态持久化。默认只展开当前页所在分区，其余收起。

不改导航分区的内容/顺序/权限，仅加折叠交互。与现有「整条侧栏折叠」(‹‹/›› 按钮，宽度→0) 正交共存。

## 2. 现状

`frontend/src/layout/AppSidebar.vue`：5 个分区硬编码为并列 `<div class="section">`，标题为静态 `<div class="section-label">`，下挂 `RouterLink`（项目/工具用 `.nav-item`，项目分析/回款用 `.nav-sub`，系统管理超管专属）。无分区折叠。`stores/ui.ts` 仅有整条折叠 `sidebarCollapsed`。测试 `AppSidebar.test.ts` 断言各分区文字可见、`.nav-sub` 计数=12、整条折叠按钮、权限过滤。

分区与稳定 key：

| 分区标题 | key | 路由前缀（判活动分区用） |
|---|---|---|
| 项目 | `project` | `/`、`/projects*`、`/activity`、`/project/*`（兜底） |
| 项目分析 | `analysis` | `/insight*` |
| 回款 | `payment` | `/payment*`、`/ledger` |
| 工具 | `tools` | `/data`、`/governance`、`/about` |
| 系统管理 | `admin` | `/admin` |

（SP-2 将新增「重点跟进」分区 key=`keyfollowup`、路由 `/projects/key`，届时在 `project` 兜底前加该前缀判定——本 SP 不涉及。）

## 3. 设计

### 3.1 状态层 `stores/ui.ts`
新增**显式覆盖** map（仅存用户手动点过的分区，未点过的不入 map）：

- `sectionExpanded: Ref<Record<string, boolean>>`，初值从 `localStorage['sidebar_sections']` 读（解析失败/缺失→`{}`）。
- `setSection(key: string, value: boolean)`：`sectionExpanded.value = { ...sectionExpanded.value, [key]: value }` 后 `localStorage.setItem('sidebar_sections', JSON.stringify(...))`。

不在 store 内算"默认"，默认由组件结合活动路由判定（store 只持有显式覆盖，职责单一）。现有 `sidebarCollapsed`/`toggleSidebar` 不动。

### 3.2 组件 `AppSidebar.vue`
- 引入 `useRoute`，计算 `activeSectionKey`（按 §2 表的前缀，`/insight`→analysis、`/payment`|`/ledger`→payment、`/data`|`/governance`|`/about`→tools、`/admin`→admin、其余→project）。
- `expanded(key)`：`const v = ui.sectionExpanded[key]; return v === undefined ? key === activeSectionKey.value : v`。
  - 未手动设置 → 仅活动分区展开（默认收起其余）。
  - 手动设置过 → 以显式值为准（含可收起活动分区）。
- `onToggle(key)`：`ui.setSection(key, !expanded(key))`（按当前生效态翻转）。
- 每个分区 `<div class="section" :class="{ collapsed: !expanded(key) }">`：
  - 标题改为 `<button type="button" class="section-label" @click="onToggle(key)">`，前置折叠指示 `<span class="section-caret">{{ expanded(key) ? '▾' : '▸' }}</span>`，文字与既有一致（回款分区保留 `<span class="section-tag">重点子域</span>`）。
  - 子链接整体包一层 `<div v-show="expanded(key)" class="section-links">`，内含原 `RouterLink`（class/active-class/结构不变）。
  - `v-show` 折叠态 `display:none`：从布局高度与 Tab 焦点移除（缩短侧栏、不可聚焦），DOM 保留（不破坏现有 `.nav-sub` 计数与 `text()` 断言）。

### 3.3 样式（theme.css 令牌，不手写散值）
- `.section-label` 改 button：去默认 button 外观（`background:none; border:0; width:100%; text-align:left; cursor:pointer;`），保留原字号/色/内边距；`:hover` 用 `--hover-tint`；`:focus-visible` 走全局规则。
- `.section-caret`：`--fs-1`、`--mut`，右距 `--sp-2`；折叠/展开仅切字形（`▸`/`▾`），不强制动效（如加旋转用 `--dur-1`/`--ease` 并尊重 `prefers-reduced-motion`）。

## 4. 边界与错误处理
- `localStorage` 不可用/损坏 → `sectionExpanded` 降级 `{}`，全部走"仅活动分区展开"默认，不报错。
- 权限过滤后某分区无可见链接（`v-if="links.length"`）→ 该分区整块不渲染，折叠逻辑不涉及（保持现有 `v-if`）。
- 整条侧栏折叠（宽度 0）时分区折叠态无视觉影响，互不干扰。
- 活动分区被用户显式收起后仍可收起（其链接 `display:none`），不影响路由本身；用户可随时点开。

## 5. 测试
- **回归（现有 `AppSidebar.test.ts` 应仍全绿）**：v-show 保留 DOM，`text()` 含各分区文字、`.nav-sub` 计数=12、整条折叠按钮、权限过滤用例不受影响。
- **新增**：
  - 默认：route `/` 挂载 → `project` 分区无 `collapsed` 类（展开），`analysis`/`payment` 分区有 `collapsed` 类（收起）。
  - route `/insight` 挂载 → `analysis` 分区展开、`project` 收起（活动分区随路由变）。
  - 点击某分区标题按钮 → `ui.sectionExpanded[key]` 出现并取反值，该分区 `collapsed` 类随之变化。
  - 持久化：`setSection` 后 `localStorage['sidebar_sections']` 含该 key 的布尔；store 重建（读 localStorage）后生效。
- **验证**：`bash verify.sh` 全绿（typecheck/vitest/build + 后端不变）。

## 6. 范围与非目标
- 非目标：不改导航分区内容/顺序/权限；不动整条侧栏折叠；不加"全部展开/全部收起"批量按钮（YAGNI）；不实现 `keyfollowup`（SP-2）。
- 版本 V1.19.2（`frontend/src/version.ts`），与 V1.17.1/V1.18.0/V1.19.0/V1.19.1 一并待打包。
