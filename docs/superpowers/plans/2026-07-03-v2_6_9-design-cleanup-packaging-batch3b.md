# V2.6.9 设计违例清理 + 收尾打累积包（批3b）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理一批设计令牌违例（状态色当文字/实底白字/散值/px字号/图表色硬编码/可访问性/.u-num/旧选中态/原生confirm），收尾 bump V2.6.9 + 打累积更新包 V2.6.6→V2.6.9 + 升级手册。

**Architecture:** 纯前端 CSS/模板机械清理，按违例类型分组成任务。每个设计任务改动后以 `npm run build` + `npm run typecheck` + grep（确认无遗留散值）验证；视觉正确性由收尾任务真机冒烟核对。少数有真实测试面（图表状态色契约、a11y、confirm→ElMessageBox）配单测。收尾统一 bump + 打累积包（这是整个 3 批 roadmap 唯一出包的一步）。

**Tech Stack:** Vue3 + TS + Element Plus + ECharts + vitest。

## Global Constraints

- **令牌映射表（本批核心，所有颜色/间距/圆角/字号改动照此）**：
  - 状态色当文字 → 深字 `-text`：`var(--warn)`→`var(--warn-text)`、`var(--ok)`→`var(--ok-text)`、`var(--danger)`→`var(--danger-text)`；别名同理：`var(--c-paid)`→`var(--ok-text)`（c-paid=ok）、`var(--c-pending)`→`var(--warn-text)`（c-pending=warn）、`var(--c-remaining)`→`var(--danger-text)`（c-remaining=danger）。`--mut`/`--sub`/`--txt` 是中性文字色，**保持不动**。
  - 间距散值 → `--sp-*`(4/8/12/16/24/32/48)：4→`--sp-1`、8→`--sp-2`、12→`--sp-3`、16→`--sp-4`、24→`--sp-5`、32→`--sp-6`、48→`--sp-7`；非整数档(6/10/14/18/22)取**视觉最近**的档(6→--sp-2、10→--sp-3、14→--sp-4、18→--sp-4、22→--sp-5)，保持视觉意图。
  - 圆角散值 → `--r-sm`(6)/`--r-md`(10)/`--r-lg`(14)：8→`--r-sm`、12→`--r-md`、3→`--r-sm`。
  - 字号 px → rem 令牌：12px→`--fs-1`；**10/11px 无对应档(--fs-1 是最小 12)→统一用 `--fs-1`**(sub-12 不单列令牌)。
  - 字重：`800`→`700`（六级排版字重锁定，无 800 档）。
  - `#fff`/白字 → `var(--on-accent)`。
  - 图表状态色硬编码 → `charts/echartsTheme` 的 `STATUS_LIGHT`/`STATUS_DARK`（`{ok,warn,danger}`），按 `settings.theme` 取。
- **元素图形尺寸像素例外（勿改）**：`width`/`height`/`min-width`/`max-height`/`max-width` 等**元素尺寸**（如箭头按钮 28px、复选框 16px、面板 min-width 320px）是设计规范明确的"图形尺寸像素例外"，**保持 px 不动**。本批只令牌化 `padding`/`gap`/`margin`/`border-radius`/`font-size`/`color`/`font-weight`。
- **可访问性范式**：可点非按钮元素补键盘可达——用 `directives/activate.ts` 的 `v-activate` 指令，或 `tabindex="0"` + `role="button"` + `@keydown.enter/space`（对照正确范式 `components/MetricGrid.vue:14-20`）。
- 不使用 emoji；符号用 `→ ↓ ❌ ✕ ▾`。
- 版本：**收尾任务** bump `version.ts` → V2.6.9（非每任务）。
- 验收：`bash verify.sh` 全绿（前端 typecheck + vitest + build 是重点）；每个设计任务改完至少 `npm run build && npm run typecheck` 绿。
- 测试：`cd frontend && npx vitest run <文件>`；typecheck `npm run typecheck`；build `npm run build`。
- 提交信息结尾附：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 状态色当文字色 → `-text` 深字（6 文件）

**背景**：多处 `color: var(--warn)`/`var(--ok)`/`var(--c-paid)` 等状态原色作小号文字，对比不足（黄 ≈1.4:1）。改 `-text` 深字令牌。

**Files（均已核实当前行号）：**
- Modify: `components/MetricGrid.vue:35-38`（`.mg-v.ok/.warn/.danger` → `-text`；`.mut` 不动）
- Modify: `views/OverviewView.vue:197-199`（`.ov-acard-count--danger/--warn` → `-text`；`--mut` 不动）
- Modify: `views/CalendarView.vue:197-198`（`.cd-val.paid`→`--ok-text`、`.cd-val.pending`→`--warn-text`）
- Modify: `components/DashMetrics.vue:63-66`（`.dm-v.paid`→`--ok-text`、`.dm-v.remain`→`--danger-text`、`.dm-v.pending`→`--warn-text`、`.dm-v.danger`→`--danger-text`）
- Modify: `views/CostDetailView.vue:239-240`（`.cd-green`→`--ok-text`、`.cd-red`→`--danger-text`）
- Modify: `components/CalGrid.vue:82`（`.wkend`→`--warn-text`，因 --c-pending=warn）

- [ ] **Step 1**: 逐文件把上述 `color: var(--<status>)` 按映射表换成 `-text` 变体（`--mut`/`--sub` 不动）。**先读每处确认当前是原色**再改。
- [ ] **Step 2**: `cd frontend && npm run build && npm run typecheck && npx vitest run src/components/MetricGrid.test.ts src/components/DashMetrics.test.ts`（若这些 test 存在；断言不涉具体颜色故应绿）。
- [ ] **Step 3**: grep 确认这 6 文件的状态文字色不再用原色：`grep -nE "color: var\(--(warn|ok|danger|c-paid|c-pending|c-remaining)\)" src/components/MetricGrid.vue src/views/OverviewView.vue src/views/CalendarView.vue src/components/DashMetrics.vue src/views/CostDetailView.vue src/components/CalGrid.vue`（应无输出，除非该处是背景/边框而非 color）。
- [ ] **Step 4**: Commit：`fix(design): 状态色当文字改-text深字(6文件,修低对比) (V2.6.9 批3b)`（含 Co-Authored-By）。

---

### Task 2: CalendarView 实底白字 + 散值 → 令牌

**背景**：`CalendarView.vue` 有实底状态色+近白小字（B 组违例）+ 整个 `<style>` 块手写散值（C 组）。

**Files:**
- Modify: `views/CalendarView.vue`（`<style>` 190-212 区）

- [ ] **Step 1**: `.cal-up-header`（210-212）实底改淡底深字：`.cal-up-header.pending { background: var(--warn-bg); }` + `.cal-up-header { color: var(--warn-text); }`（去 `--on-accent` 白字）；`.cal-up-header.accent` 若也是实底+白字同改为淡底深字（用 `--accent` 对应的淡底，若无 `--accent-bg` 则保留但改文字为深色——先看 theme.css 有无 accent 淡底令牌，无则用 `--card2` 底 + `--accent` 文字）。
- [ ] **Step 2**: 按令牌映射表把 190-212 区所有 `padding/gap/margin/border-radius` 散值换令牌（`padding:16px`→`--sp-4`、`gap:14px`→`--sp-4`、`border-radius:8px`→`--r-sm`、`margin-top:22px`→`--sp-5`、`margin-bottom:14px`→`--sp-4`、`padding:8px 12px`→`--sp-2 --sp-3`、`gap:10px`→`--sp-3`、`gap:6px`→`--sp-2`、`gap:16px`→`--sp-4`、`margin:0 0 14px`→`0 0 --sp-4` 等）。**元素尺寸 `width:28px`/`height:28px`/`min-width:48px`/`min-width:320px` 保持 px 不动。**
- [ ] **Step 3**: `cd frontend && npm run build && npm run typecheck`（绿）；grep `src/views/CalendarView.vue` 的 `<style>` 确认 padding/gap/margin/border-radius 无遗留散值（元素 width/height 除外）。
- [ ] **Step 4**: Commit：`fix(design): CalendarView 实底白字改淡底深字+散值迁令牌 (V2.6.9 批3b)`。

---

### Task 3: BoardView 散值 → 令牌

**Files:**
- Modify: `views/BoardView.vue`（`<style>` 304-314 区）

- [ ] **Step 1**: 按映射表换：`padding:16px`→`--sp-4`、`gap:18px`→`--sp-4`、`margin-bottom:12px`→`--sp-3`、`gap:8px`→`--sp-2`、`border-radius:14px`→`--r-lg`、`padding:14px`→`--sp-4`(14→16近档，或保 `--sp-3` 12，取视觉近档)、`margin:0 0 10px`→`0 0 --sp-3`、`.bv-empty padding:16px`→`--sp-4`。**元素尺寸 `flex:1 1 400px`/`min-width:300px` 保持 px。**
- [ ] **Step 2**: `cd frontend && npm run build && npm run typecheck`（绿）；grep `src/views/BoardView.vue` `<style>` 确认 padding/gap/margin/radius 无遗留散值。
- [ ] **Step 3**: Commit：`fix(design): BoardView 散值迁令牌 (V2.6.9 批3b)`。

---

### Task 4: ColumnFilter / FollowupRecords / FollowupRecordForm px 字号 → rem 令牌

**背景**：三组件 `<style>` 整块用 `font-size:10/11/12/13px` + `border-radius:3/4/6/8px` 散值，不随三档字号缩放。ColumnFilter 复用于 9 页，影响面大。

**Files:**
- Modify: `components/ColumnFilter.vue`（`<style>` 123-180）
- Modify: `components/FollowupRecords.vue`（`<style>` 150-169）
- Modify: `components/FollowupRecordForm.vue`（`<style>` 93-105）

- [ ] **Step 1**: 字号 `12px/13px`→`--fs-1`（13 取最近的 --fs-1 12 或 --fs-2 14，按视觉；正文小标签用 --fs-1）、`10px/11px`→`--fs-1`；圆角 `3px/6px`→`--r-sm`、`4px`→`--r-sm`、`8px`→`--r-sm`(或--r-md)；`padding/margin` 散值→`--sp-*`。**元素尺寸 `width:16px`/`height:16px`/`max-height:200px`/`max-width:190px` 保持 px。**
- [ ] **Step 2**: `cd frontend && npm run build && npm run typecheck && npx vitest run src/components/ColumnFilter.test.ts`（若存在；断言不涉字号故绿）。grep 三文件 `<style>` 确认无 `font-size: \d+px`。
- [ ] **Step 3**: Commit：`fix(design): ColumnFilter/FollowupRecords/Form px字号改rem令牌 (V2.6.9 批3b)`。

---

### Task 5: PendingBarChart 状态色硬编码 → echartsTheme STATUS_*

**背景**：`PendingBarChart.vue:12` `const COLORS = ['#c8161d','#f9d46c','#6ecc54']` 硬编码，不随主题、绕过双源契约。

**Files:**
- Modify: `components/PendingBarChart.vue`
- Test: `components/PendingBarChart.test.ts`（若无则新建）

**Interfaces:**
- Consumes: `charts/echartsTheme` 的 `STATUS_LIGHT`/`STATUS_DARK`（`{ok,warn,danger}`）；主题来自 `settings` store（对照 `MilestoneView.vue:45` 的取法——先读它怎么按 `settings.theme` 取 STATUS_*）。
- Produces: `COLORS` 由 STATUS 按主题派生（顺序 danger/warn/ok 对应原 `['#c8161d','#f9d46c','#6ecc54']`）。

- [ ] **Step 1**: 写失败测试：mock 亮/暗主题，断言 PendingBarChart 的系列颜色 == `STATUS_LIGHT`/`STATUS_DARK` 对应值（而非硬编码）。**先读 PendingBarChart 现在 COLORS 用在哪(series color/顺序)**，据实写断言。
- [ ] **Step 2**: `cd frontend && npx vitest run src/components/PendingBarChart.test.ts` → FAIL。
- [ ] **Step 3**: 改 `COLORS` 为按 `settings.theme` 取 `STATUS_LIGHT/DARK` 的 `[danger, warn, ok]`（顺序与原一致；暗色 danger 自动变 `#d34947`）。照 `MilestoneView.vue:45` 范式。
- [ ] **Step 4**: `cd frontend && npx vitest run src/components/PendingBarChart.test.ts && npm run typecheck && npm run build` → 绿。
- [ ] **Step 5**: Commit：`fix(design): PendingBarChart 状态色走echartsTheme(随主题) (V2.6.9 批3b)`。

---

### Task 6: 可访问性——可点元素键盘可达

**背景**：`DashMetrics.vue:46-48` 可点卡片、`ColumnFilter.vue:95` 触发 span、`ProjectDetailView.vue:323` 删标签 span 键盘不可达。

**Files:**
- Modify: `components/DashMetrics.vue:46-48`、`components/ColumnFilter.vue:95`、`views/ProjectDetailView.vue:323`
- Test: `components/DashMetrics.test.ts`（加键盘触发用例）

- [ ] **Step 1**: 写失败测试：DashMetrics 可点卡片按 Enter/Space 触发 `onCard`（或断言渲染出 `tabindex`/`role="button"`）。
- [ ] **Step 2**: `cd frontend && npx vitest run src/components/DashMetrics.test.ts` → FAIL。
- [ ] **Step 3**: `DashMetrics.vue:46-48` 可点卡片加 `tabindex="0"` + `role="button"` + `@keydown.enter/space`（或 `v-activate` 指令，对照 MetricGrid:14-20）；`ColumnFilter.vue:95` 触发 span 加 `v-activate`；`ProjectDetailView.vue:323` 删标签 span 加 `v-activate` + `role="button"` + `tabindex="0"`（或 `@keydown.enter`）。**先读 `directives/activate.ts` 确认 v-activate 用法。**
- [ ] **Step 4**: `cd frontend && npx vitest run src/components/DashMetrics.test.ts && npm run typecheck && npm run build` → 绿。
- [ ] **Step 5**: Commit：`fix(a11y): DashMetrics卡片/ColumnFilter/ProjectDetail触发元素键盘可达 (V2.6.9 批3b)`。

---

### Task 7: 漏挂 `.u-num` + 移除不存在的 `--font-mono`

**背景**：多处金额/百分比列未挂 `.u-num`（tabular-nums）；`CalNodeTable.vue:67` 引用不存在的 `--font-mono`（静默降级 monospace）。

**Files:**
- Modify: `components/CalNodeTable.vue`（36/44/45 金额单元格加 `.u-num`；67 行 `font-family: var(--font-mono, monospace)` 去掉——数字列靠 `.u-num` 的 tabular-nums，不需 monospace，改回 `--font-sans` 或直接删该 font-family 行让继承 body）
- Modify: `views/CalendarView.vue:126`（`.cd-val` KPI 金额 div 加 `.u-num`）
- Modify: `components/CalGrid.vue:69`（`.cd-amt` 加 `.u-num`）
- Modify: `components/OrgRanking.vue:65-66`（`.rank-amount`/`.rank-rate` 加 `.u-num`）

- [ ] **Step 1**: 逐处给金额/百分比展示元素的 class 列表加 `u-num`（如 `class="cd-amt u-num"`）；`CalNodeTable.vue:67` 删 `font-family: var(--font-mono, monospace)`（或改 `var(--font-sans)`）。
- [ ] **Step 2**: `cd frontend && npm run build && npm run typecheck`（绿）；grep 确认 `--font-mono` 全仓无引用：`grep -rn "font-mono" src/`（应无输出）。
- [ ] **Step 3**: Commit：`fix(design): 金额列补.u-num+移除不存在的--font-mono (V2.6.9 批3b)`。

---

### Task 8: ChartTypeSelector 旧实底选中态 → 抬起 chip

**背景**：`ChartTypeSelector.vue:66-70` `.cts-b.on { background: var(--accent); color: var(--on-accent); }` 实底+白字，与已改好的 SegToggle 不一致。（DimPicker:53 已合规,不改；其 `.dp-ord` 是序号徽标非选中态，不在本任务。）

**Files:**
- Modify: `components/ChartTypeSelector.vue:66-70`

- [ ] **Step 1**: `.cts-b.on` 改为抬起 chip：`background: var(--card); color: var(--accent); font-weight: 700; box-shadow: var(--shadow-1);`（照 `components/SegToggle.vue:28` / `components/DisplaySettings.vue:38` 范式——**先读 SegToggle:28 的确切规则照搬**）。
- [ ] **Step 2**: `cd frontend && npm run build && npm run typecheck`（绿）。
- [ ] **Step 3**: Commit：`fix(design): ChartTypeSelector选中态改抬起chip(对齐SegToggle) (V2.6.9 批3b)`。

---

### Task 9: 收尾散值（ProgressEditModal #fff / DashMetrics 圆角字重 / CalGrid·CalYearHeat 8px / followup.css padding）

**Files:**
- Modify: `components/ProgressEditModal.vue:70`（`.pem-save color: #fff`→`var(--on-accent)`）
- Modify: `components/DashMetrics.vue:58,62`（`border-radius:12px`→`--r-md`；`.dm-v font-weight:800`→`700`）
- Modify: `components/CalGrid.vue:91`（`.cal-day border-radius:8px`→`--r-sm`）
- Modify: `components/CalYearHeat.vue:42`（`.cyh-cell border-radius:8px`→`--r-sm`）
- Modify: `styles/followup.css:12`（`.kp-archive-btn,.kp-export-btn,.kp-cancel padding:2px 10px`→`padding: var(--sp-1) var(--sp-3)`；2→--sp-1 近档 4，或保内联半步 `2px var(--sp-3)`——2px 是紧凑按钮内边距，可用 `2px var(--sp-3)` 半步内联）

- [ ] **Step 1**: 逐处按上述换令牌。
- [ ] **Step 2**: `cd frontend && npm run build && npm run typecheck`（绿）；grep `#fff`/`font-weight: 800`/`border-radius: 12px`/`border-radius: 8px` 在这几文件应无遗留。
- [ ] **Step 3**: Commit：`fix(design): 收尾散值(ProgressEditModal白字/DashMetrics圆角字重/8px圆角/followup padding) (V2.6.9 批3b)`。

---

### Task 10: 原生 confirm → ElMessageBox

**背景**：`AppHeader.vue:14`、`DataView.vue:91/95/133/134`、`FollowupRecords.vue:75` 用阻塞式 `window.confirm`，暗色/主题不一致。改 `ElMessageBox.confirm`（对照 `AdminView.vue:85` / `OpportunitiesView.vue:143` 既有用法）。

**Files:**
- Modify: `layout/AppHeader.vue:14`、`views/DataView.vue:91,95,133,134`、`components/FollowupRecords.vue:75`
- Test: 相关组件既有测试为回归网（confirm 改 async ElMessageBox 需注意调用点改 await + try/catch）

- [ ] **Step 1**: 把每处 `if (!window.confirm(msg)) return` 改为 `try { await ElMessageBox.confirm(msg, '确认', { type: 'warning' }) } catch { return }`（用户取消 → reject → catch return）。所在函数改 `async`（若尚非）。`ElMessageBox` 从 `'element-plus'` import。**先读每个调用点确认其函数签名/后续逻辑,保证改 async 后调用方仍正确 await 或不依赖同步返回。**DataView 的两步确认（133+134）合成一次或保留两步 ElMessageBox 均可（保留两步更贴原语义）。
- [ ] **Step 2**: `cd frontend && npm run typecheck && npm run test:run`（全绿；若某组件测试 mock 了 window.confirm 需改 mock ElMessageBox）。
- [ ] **Step 3**: grep 确认这 3 文件无 `window.confirm`/裸 `confirm(`：`grep -nE "\bconfirm\(" src/layout/AppHeader.vue src/views/DataView.vue src/components/FollowupRecords.vue`（应只剩 ElMessageBox.confirm）。
- [ ] **Step 4**: Commit：`fix(design): 原生confirm改ElMessageBox(AppHeader/DataView/FollowupRecords) (V2.6.9 批3b)`。

---

### Task 11: bump V2.6.9 + 全量验收 + 真机视觉冒烟

**Files:**
- Modify: `frontend/src/version.ts`

- [ ] **Step 1**: `version.ts`：`APP_VERSION = 'V2.6.9'`、`RELEASE_DATE`（实现时用实际日期）。
- [ ] **Step 2**: `bash verify.sh`（全绿：前端 typecheck + vitest + build）。
- [ ] **Step 3**: **真机视觉冒烟**（`python server.py` + `cd frontend && npm run dev`，或 build 后 :8080；对照批3a/前的截图基线）：逐一核对本批改动的视觉——① 状态色文字（里程碑「延期」KPI、日历/仪表盘金额、成本明细）现为深字可读；② 日历「15/30天到期」表头淡底深字（非实底白字）；③ BoardView/CalendarView 间距/圆角视觉不变（令牌值贴近原散值）；④ ColumnFilter 列筛选弹层字号随三档缩放；⑤ PendingBarChart 暗色下 danger 变 #d34947、亮色不变；⑥ 可点卡片 Tab 能聚焦+Enter 触发；⑦ 金额列对齐（tabular-nums）；⑧ ChartTypeSelector 选中态为抬起 chip；⑨ 停服/回滚/清空/删记录弹的是 ElMessageBox（暗色一致）。**发现视觉退化就地修正并说明。**
- [ ] **Step 4**: Commit：`chore: bump V2.6.9 + 设计清理真机冒烟 (V2.6.9 批3b)`（含 Co-Authored-By）。

---

### Task 12: 打累积更新包 V2.6.6→V2.6.9 + 升级手册（控制者执行）

> **此任务由控制者亲自执行**（含 PowerShell `/pm` 构建 + 手动校验，不派子代理）。

- [ ] **Step 1: 写升级手册** `deploy/升级手册-V2.6.9.md`（照 `deploy/升级手册-V2.6.6.md` 格式）：累积 V2.6.6→V2.6.9（含批1 数据正确性 / 批2 后端健壮性+FollowupStore重构 / 批3a 前端重构 / 批3b 设计清理）。**头号注意**：① **无需点「更新数据」**（批2 给 dataQuality 加告警字段但 extra=allow 无 schema 结构变化，其余纯前端/逻辑）；② **⚠️ 后端代码改动多（批2 server.py/followup 全域重构），升级须重启 python server.py 进程**；③ 无新页/无新 pageKey/无新依赖；④ 累积含批2 死代码清理（compare_payment_sources.py 已删）。

- [ ] **Step 2: 构建 /pm dist**（**PowerShell，非 Git Bash**——Bash 会篡改 `/pm/`）：
```
cd frontend; npx vite build --base=/pm/
```
校验：`grep -o '/pm/assets[^"]*' frontend/dist/index.html | head -1`（须命中 `/pm/assets`）。

- [ ] **Step 3: 打包**：`python make_update_zip.py` → `release/pmplatform-update-V2.6.9.zip`；核对输出 `dist /pm 构建: 是`、无 `[WARN] 缺失`（尤其 `deploy/升级手册-V2.6.9.md` 须已存在被打进）。

- [ ] **Step 4: 重建默认 dist**（**出 /pm 包后必做,否则本地 :8080 白屏**）：
```
cd frontend; npx vite build
```

- [ ] **Step 5: 提交手册 + 版本**（`release/` 已 gitignore 不提交）：
```bash
git add deploy/升级手册-V2.6.9.md
git commit -m "docs(deploy): V2.6.9 累积升级手册(V2.6.6→V2.6.9,批1+2+3a+3b)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 更新 PROGRESS**：记 V2.6.9（批3b 收官，3 批 roadmap 全部完成，累积包已出待用户自部署，在线基线 V2.6.6→V2.6.9）。commit。

---

## Self-Review（作者已核对）

- **Spec 覆盖**（roadmap 第 5 节设计违例部分 + batch3b-notes）：状态色当文字=T1；实底白字=T2；散值(Calendar/Board)=T2/T3；px字号=T4；图表状态色=T5；a11y=T6；.u-num+font-mono=T7；旧选中态=T8；收尾散值(#fff/圆角/字重/8px/followup.css padding)=T9；confirm=T10；bump+冒烟=T11；打包+手册=T12。全覆盖。
- **Placeholder 扫描**：设计任务给了确切令牌映射(Global Constraints)+每文件确切行号(已核实当前 master)；多处要求"先读范式(SegToggle/MetricGrid/activate.ts/MilestoneView)照搬"——因 CSS/模板须视觉/结构等价,照搬现网范式是正确做法。散值→令牌的非整数档取近档是设计判断,已给映射规则+"元素尺寸px例外"红线,视觉由 T11 冒烟兜底。
- **测试性说明**：设计任务多为 CSS/模板视觉改动,无严格 TDD 面,以 build+typecheck+grep(无遗留散值)验证 + T11 真机视觉冒烟兜底;有真实测试面的(T5 图表状态色契约、T6 a11y 键盘、T10 confirm→ElMessageBox 的 async)配单测先红后绿。
- **类型/命名一致性**：令牌名统一用 theme.css 实存的 `--ok-text/--warn-text/--danger-text/--on-accent/--sp-1..7/--r-sm/md/lg/--fs-1`;STATUS_LIGHT/DARK 来自 echartsTheme;v-activate 来自 directives/activate.ts。
- **风险排序**：T10(confirm→async ElMessageBox 改调用点 async,可能漏 await)与 T5(图表主题取值)略高,配单测;其余纯 CSS 低风险。**打包 T12 关键坑**:必须 PowerShell `/pm` 构建(Bash 篡改)、打包后重建默认 dist(否则白屏)——已在 T12 明列。
- **执行顺序**：T1-T10 设计清理(彼此独立,顺序无强依赖,但同文件的 CalendarView(T1颜色/T2实底散值)、DashMetrics(T1颜色/T6 a11y/T9圆角字重)分散在多任务,注意同文件多任务顺序执行避免冲突)→T11 bump+冒烟→T12 打包。
