# Phase E 前端优化设计（P0 一致性 + P1 信号行/风险看板）

> 设计文档（harness: Design）。基于 2026-06-08 对全前端视图/组件/样式/数据结构的整体探查与优化分析。
> Phase D（前端重构）已全部完成并合入 master。Phase E 是在其基础上的针对性优化。

## 背景与目标

整体分析发现三类可优化点，本期取性价比最高的 P0+P1：

- **P0 一致性**：字号三档对 FilterBar 无效（硬编码 px）、原生 select 暗色不适配、"待回款"语义色自相矛盾（首页青色 vs 业务分析红色）。
- **P1 价值增量**：首页只有现状快照、缺"该做什么"的行动信号；风险页偏排名列表，未用满数据里已有的卡点/责任方/下一步字段。

目标：消除残留的明暗/字号一致性瑕疵；让首页一眼可见"本月该催什么"；让风险页从"看排名"变成"看行动"。

## 范围拆分（3 个独立可交付 Plan）

| Plan | 内容 | 依赖 |
|---|---|---|
| E1 | P0 一致性修复（纯样式/token） | 无 |
| E2 | 首页"待办速览"信号行 | 无 |
| E3 | 风险项目页 → 卡点行动看板 | 无 |

三者互不依赖，可各自独立 merge。每个 Plan 完成后 `bash verify.sh` 必须全绿。

---

## Plan E1 — 一致性修复（P0）

纯样式/token 调整，不新增业务逻辑。

### 改动点

1. **`frontend/src/layout/FilterBar.vue`**
   - `.filter-bar { font-size: 13px }` → `var(--fs-1)`
   - `.fb-item select { font-size: 13px }` → `var(--fs-1)`
   - `.fb-item select` 增加 `background: var(--card2); color: var(--txt);`，暗色下不再渲染浏览器默认白底控件。
   - 复选框/标签颜色沿用 `var(--sub)`（已 token 化，无需改）。

2. **`frontend/src/components/DashMetrics.vue`**
   - 待回款卡 `cls: 'remain'` 对应的 `.dm-v.remain { color: var(--cyan) }` → `var(--c-remaining)`（theme.css 已定义，语义=待回款缺口=danger 色）。

3. **`frontend/src/views/AnalysisView.vue`**
   - summary-bar 待回款 `.sb-val.danger`（值已是 danger）中，待回款一项改用语义类 `.sb-val.remaining { color: var(--c-remaining) }`，使"待回款"语义集中到一个 token（颜色值不变，仅语义化）。延期仍用 `--danger`。

4. **全局核验**：grep `--cyan` 与"待回款"出现处，确认无第三处不一致。若发现遗漏一并改为 `--c-remaining`。

### 测试

无新增逻辑。执行现有 `frontend/src` 全套 vitest + `npm run typecheck`，确认无回归。手动启动确认 FilterBar 在大/小字号与暗色下表现正确。

### 完成定义

- FilterBar 字号随三档设置变化；暗色下 select 控件背景为深色。
- 首页与业务分析"待回款"颜色一致（均 `--c-remaining`）。
- `bash verify.sh` 全绿。

---

## Plan E2 — 首页"待办速览"信号行

### 架构

新增一个纯函数模块 + 一个展示组件，挂在首页 KPI 卡之上：

- **`frontend/src/lib/dashboardSignals.ts`**（纯函数，可单测）：输入 `nodes: RawNode[]` 与 `today: string`（'YYYY-MM-DD'，由调用方注入，便于测试），输出 4 个信号值。
- **`frontend/src/components/DashSignals.vue`**：消费 store + lib，渲染信号行；每张卡用 `v-activate` + `RouterLink` 导流。
- **`frontend/src/views/DashboardView.vue`**：在 `<DashMetrics />` **之上**插入 `<DashSignals />`（仅 `data.data` 就绪分支内）。

### 信号定义

全部基于 `filter.filteredNodes`（与 DashMetrics 同口径，已应用视角/纳管/年份）。`today` 取当前自然日。

| 信号 | key | 计算 | 单位 | 导流 |
|---|---|---|---|---|
| 本月需回款 | `monthDueWan` | planMonth == today 的当月（'YYYY-MM'）、且 nodeStatus != '已全额回款' 且 != '已提前回款' 的节点，Σ(expectedPayment − actualPayment)，再 /10000 | 万 | `/calendar` |
| 7天内临期 | `due7Count` | planDate 在 [today, today+7天] 闭区间内、未回款（getNodeRemaining > 0）的节点数 | 个 | `/calendar` |
| 延期额 | `delayedWan` | nodeStatus == '延期' 的节点，Σ(expectedPayment − actualPayment)，再 /10000 | 万 | `/analysis/risk` |
| 待跟进 | `toFollowupCount` | planDate 在 [today, today+30天] 内、未回款、且该 projectId 无"跟进中"状态记录的节点数 | 个 | `/followup` |

辅助：
- 复用 `frontend/src/lib/calendar.ts` 的 `getNodeRemaining(node)` 判断"未回款（剩余>0）"。
- "无跟进中记录"：节点的 `followupRecords` 数组中不存在 `跟进状态 === '跟进中'` 的记录（沿用后端已做的状态重置口径，前端只读判断）。
- 日期比较用字符串 'YYYY-MM-DD' 直接比较（ISO 可字典序比较）；today+N 天用 Date 计算后格式化为 'YYYY-MM-DD'。

### 展示

- 信号行：`.u-grid-auto`（或 4 列自适应），4 张卡。
- 配色（全 token，明暗自适应）：本月需回款 `--c-remaining`；7天临期 `--c-urgent`（橙）；延期额 `--c-remaining`；待跟进 `--accent`。
- 每卡：小标签（`--fs-1`，`--mut`）+ 大数值（`--fs-5`，对应语义色）+ 整卡 `RouterLink` 包裹、`v-activate` 键盘可达。
- 数值格式化复用 `lib/format.ts` 的 `fmtWan`。

### 边界

- 筛选后无匹配节点 → 各信号显 0 / 0万，不报错。
- 年份筛选排除当前年时，"本月需回款"可能为 0，属预期（信号尊重全局筛选）。

### 测试

- `frontend/src/lib/dashboardSignals.test.ts`：
  - 4 个信号各一条 happy-path（构造已知节点集断言数值）。
  - 空数组 → 全 0。
  - 跨月边界：planMonth 为上月/下月的节点不计入"本月需回款"。
  - 7天/30天边界：恰好第 7 天计入、第 8 天不计入。
  - 已全额回款节点不计入需回款/延期额。
- `frontend/src/components/DashSignals.test.ts`：seed data store + filter，挂载断言 4 张卡文本与 4 个 `RouterLink` 的 `to` 正确。

### 完成定义

- 首页顶部出现 4 信号行，数值正确，点击跳转对应页。
- 明暗/字号自适应。
- `bash verify.sh` 全绿。

---

## Plan E3 — 风险项目页 → 卡点行动看板

### 架构

重写 `frontend/src/components/RiskTab.vue`，从"排名表"改为"按紧迫度分组的行动看板"。分组逻辑复用并按需扩展 `frontend/src/lib/riskGroups.ts`。

### 分组

按紧迫度三组（顺序固定，颜色固定）：

| 组 | 判定 | 色条 |
|---|---|---|
| 已延期 | nodeStatus == '延期' | `--c-remaining`（红） |
| 7天内临期 | planDate 在 [today, today+7天]、未回款、且非延期 | `--c-urgent`（橙） |
| 加资源可提前 | nodeStatus == '加资源可提前'（canAdvance） | `--accent`（蓝） |

- 现有 `riskGroups.ts` 已有 nearDue/highRisk/canAdvance 雏形；若其语义与上表不完全一致，则在该模块新增/调整一个 `riskActionGroups(nodes, today)` 纯函数，返回 `{ delayed, due7, canAdvance }` 三组数组，并补单测。优先复用现有 `getNodeRemaining`。
- 三组按 `:tier` prop 先行过滤（与其他 tab 一致：tier==='' 不过滤）。

### 每行展示列

延期组与临期组：项目名 · 延期天数/剩余天数 · 待回款额 · 卡点(blocker) · 责任方(blockerOwner) · 下一步(nextAction) · 截止(nextActionDate)
可提前组：项目名 · 卡点(blocker) · 资源需求(advanceDetail) · 责任方 · 下一步 · 截止

- 空字段一律显 "—"。
- 项目名可点击 → `useProjectDetailStore().open(projectId)` 唤起全局 `ProjectDetailDrawer`（已有单例，无需新建）。
- 分组标题含组内计数 `(n)`，可折叠（沿用项目内既有折叠交互；若无统一模式，用 `ref<boolean>` + `v-activate` 标题切换）。
- 全 token 化配色，明暗自适应。

### 边界

- 某组为空 → 标题显 (0) 且组内显"暂无"，不渲染空表。
- 字段缺失统一 "—"。

### 测试

- 若新增 `riskActionGroups`：`riskGroups.test.ts` 补三组分类断言（延期、7天临期、可提前各命中；跨界不误入）。
- `frontend/src/components/RiskTab.test.ts`：
  - 三组标题与计数渲染。
  - 字段回退：blocker/nextAction 为空时显 "—"。
  - 项目名点击调用 projectDetail.open（mock store 断言）。
  - `:tier` 过滤生效。

### 完成定义

- 风险页呈现三组折叠行动看板，含卡点/责任方/下一步/截止字段。
- 项目名点击唤起详情抽屉。
- `bash verify.sh` 全绿。

---

## 约定遵守

- 不使用 emoji 装饰；符号用 `→ ↓ ❌ ✕ ▾`。
- 跟进术语用"邮件推动"。
- 样式以补 CSS / token 完善表现，不引框架。
- 改动只在 `frontend/`，不触后端 schema/数据流。
- 每个 Plan 独立分支 + subagent 执行 + 两段式审查 + 本地 merge（沿用 Phase D 流程）。

## 验证

每个 Plan 完成前执行 `bash verify.sh`（py_compile + ruff + pytest + 前端 typecheck/vitest/build），全绿才算 done，并更新 `PROGRESS.md`。
