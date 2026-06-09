# Plan E1：P0 一致性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除残留的明暗/字号一致性瑕疵：FilterBar 字号随三档设置变化、暗色 select 不再白底、"待回款"在错色处统一为语义 token `--c-remaining`。

**Architecture:** 纯 CSS / token 调整，不新增任何业务逻辑、不改组件结构。两个任务：(1) FilterBar 样式 token 化；(2) "待回款"错色处（DashMetrics 青、BoardView 橙）统一为 `--c-remaining`，并将 spec 点名的 AnalysisView 待回款语义化（与延期区分）。

**Tech Stack:** Vue3 `<script setup>` + scoped CSS + CSS 变量主题（theme.css）。验证用 `frontend` 的 vitest + typecheck + build（`bash verify.sh`）。

**关于测试：** 本计划全为 scoped CSS 颜色/字号 token 替换。jsdom 不计算 scoped CSS 的实际颜色值，写"断言颜色值"的单测没有意义且脆弱。因此验证手段是：(a) 现有全套 vitest 不回归，(b) `npm run typecheck` 通过，(c) `npm run build` 通过，(d) grep 守卫确认目标错色 token 已不再用于"待回款"，(e) 人工启动确认暗色 + 大/小字号下表现。这是对纯样式改动的诚实验证方式，不伪造 TDD。

**范围边界（重要）：** grep 核验发现"待回款"还在 `LedgerView.vue` / `ProjectsOverviewTab.vue` / `PlanTab.vue` 用 `.sb-val.red`、在 `PlanBoard.vue` 用硬编码 `#ef4444`——但这些**本就渲染为红色（正确色）**，且 `.red` 是组件内共享 scoped 类，改其取值可能误伤同类其他元素。本期**不动**这些已正确的红色处，仅记入 backlog（语义化为后续低优先项）。E1 只改真正**错色**的两处 + spec 点名的 AnalysisView。

---

### Task 1：FilterBar 字号 token 化 + select 暗色适配

**Files:**
- Modify: `frontend/src/layout/FilterBar.vue:65-71`（`<style scoped>` 段）

当前样式（行 65-71）：

```css
.filter-bar { display: flex; align-items: center; gap: 16px; padding: 8px 18px;
  border-bottom: 1px solid var(--line); background: var(--card); font-size: 13px; color: var(--sub); }
.fb-item { display: inline-flex; align-items: center; gap: 6px; }
.fb-item select { padding: 4px 8px; border: 1px solid var(--line2); border-radius: 6px; font-size: 13px; }
.naguan { margin-left: auto; }
```

- [ ] **Step 1：把两处硬编码 `font-size: 13px` 换成 `var(--fs-1)`，并给 select 补暗色背景/前景**

把 `<style scoped>` 段（FilterBar.vue:65-71）整体替换为：

```css
.filter-bar { display: flex; align-items: center; gap: 16px; padding: 8px 18px;
  border-bottom: 1px solid var(--line); background: var(--card); font-size: var(--fs-1); color: var(--sub); }
.fb-item { display: inline-flex; align-items: center; gap: 6px; }
.fb-item select { padding: 4px 8px; border: 1px solid var(--line2); border-radius: 6px;
  font-size: var(--fs-1); background: var(--card2); color: var(--txt); }
.naguan { margin-left: auto; }
```

说明：`--fs-1`（0.8rem）随 settings store 的 `--fs-base`（sm 13 / md 15 / lg 17px）整体缩放；`background: var(--card2); color: var(--txt)` 让原生 `<select>` 控件在暗色下不再渲染浏览器默认白底。

- [ ] **Step 2：typecheck + 运行该组件相关测试，确认无回归**

Run:
```bash
cd frontend && npm run typecheck && npx vitest run src/layout
```
Expected: typecheck 0 错误；`src/layout` 下测试全 PASS（FilterBar 测试断言的是 `data-test` 选择器与行为，不依赖字号像素值，故不受影响）。

- [ ] **Step 3：grep 守卫——确认 FilterBar 内再无硬编码字号**

Run:
```bash
cd frontend && grep -n "font-size: 13px" src/layout/FilterBar.vue || echo "OK: no hardcoded font-size"
```
Expected: 输出 `OK: no hardcoded font-size`。

- [ ] **Step 4：提交**

```bash
git add frontend/src/layout/FilterBar.vue
git commit -m "fix(E1): FilterBar 字号改用 --fs-1 + select 暗色背景"
```

---

### Task 2：待回款错色统一为 --c-remaining（DashMetrics 青 / BoardView 橙）+ AnalysisView 语义化

**Files:**
- Modify: `frontend/src/components/DashMetrics.vue:49`
- Modify: `frontend/src/views/BoardView.vue:270`
- Modify: `frontend/src/views/AnalysisView.vue:61` 与 `:91` 附近（`<style scoped>`）

背景：`theme.css` 已定义 `--c-remaining: var(--danger)`（待回款缺口语义色，值=红）。三处"待回款"目前未用它：DashMetrics 用 `--cyan`（青，视觉错色）、BoardView 用 `--c-pending`（橙，视觉错色）、AnalysisView 用共享类 `.danger`（红色正确，但与"延期"混用同一类，spec 要求语义拆分）。

- [ ] **Step 1：DashMetrics 待回款色 `--cyan` → `--c-remaining`**

`frontend/src/components/DashMetrics.vue:49`，将：

```css
.dm-v.remain { color: var(--cyan); }
```

改为：

```css
.dm-v.remain { color: var(--c-remaining); }
```

（不改 `:27` 的 `cls: 'remain'`，类名保留，只换颜色取值。）

- [ ] **Step 2：BoardView 待回款色 `--c-pending` → `--c-remaining`**

`frontend/src/views/BoardView.vue:270`，将：

```css
.bv-remain { color: var(--c-pending); }
```

改为：

```css
.bv-remain { color: var(--c-remaining); }
```

- [ ] **Step 3：AnalysisView 待回款语义拆分（与延期区分）**

`frontend/src/views/AnalysisView.vue:61`，当前：

```html
<div class="sb-item"><div class="sb-label">待回款总金额(万)</div><div class="sb-val danger">{{ fmtWan(summary.totalExpected - summary.totalActual) }}</div></div>
```

把待回款这一项的 `class="sb-val danger"` 改为 `class="sb-val remaining"`（行 65 的"延期"项保持 `sb-val danger` 不动）：

```html
<div class="sb-item"><div class="sb-label">待回款总金额(万)</div><div class="sb-val remaining">{{ fmtWan(summary.totalExpected - summary.totalActual) }}</div></div>
```

然后在 `<style scoped>` 段，紧挨现有 `.sb-val.danger { color: var(--danger); }`（约行 91）之后新增一行：

```css
.sb-val.remaining { color: var(--c-remaining); }
```

（结果：待回款=`--c-remaining`、延期=`--danger`，两者当前同为红，但语义类已分离。）

- [ ] **Step 4：typecheck + 运行受影响测试，确认无回归**

Run:
```bash
cd frontend && npm run typecheck && npx vitest run src/components/DashMetrics src/views/BoardView src/views/AnalysisView
```
Expected: typecheck 0 错误；相关测试全 PASS（这些测试断言文本/结构，不依赖颜色值）。

- [ ] **Step 5：grep 守卫——确认待回款错色 token 已清除**

Run:
```bash
cd frontend && grep -n "var(--cyan)" src/components/DashMetrics.vue; grep -n "bv-remain.*--c-pending" src/views/BoardView.vue; echo "checked"
```
Expected: 前两条无输出（已无 `--cyan` 于 DashMetrics、无 `.bv-remain` 配 `--c-pending`），仅打印 `checked`。

- [ ] **Step 6：提交**

```bash
git add frontend/src/components/DashMetrics.vue frontend/src/views/BoardView.vue frontend/src/views/AnalysisView.vue
git commit -m "fix(E1): 待回款错色统一为 --c-remaining(DashMetrics 青/BoardView 橙) + AnalysisView 语义拆分"
```

---

### Task 3：全量验证 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1：跑完整 verify.sh，确认全绿**

Run:
```bash
bash verify.sh
```
Expected: 末尾 `[PASS] verify.sh 全部通过`（py_compile + ruff + pytest + 前端 typecheck/vitest/build 全绿）。

- [ ] **Step 2：人工目检（暗色 + 字号）**

后台 dev 服务若已停，重启 `python server.py`(:8080) 与 `cd frontend && npm run dev`。在浏览器：
- 顶部 DisplaySettings 切暗色 → FilterBar 的 select 控件应为深色背景、文字可读。
- 切大/小字号 → FilterBar 文字应随之变化。
- 首页 KPI"待回款"卡 → 红色（不再是青色）。
- /board 待回款列 → 红色（不再是橙色）。
- /analysis/nodes 汇总条"待回款"与"延期" → 均红色，语义已分离。

（目检为人工确认项，无对应自动断言；如发现问题回到对应 Task 修正。）

- [ ] **Step 3：更新 PROGRESS.md**

在 PROGRESS.md 的进度记录处追加一行（沿用现有格式）：

```
- Plan E1 P0 一致性修复完成：FilterBar 字号 token 化 + select 暗色；待回款错色(DashMetrics 青/BoardView 橙)统一为 --c-remaining + AnalysisView 语义拆分。已正确红色的 .sb-val.red/硬编码 #ef4444 处记入 backlog 待语义化。
```

- [ ] **Step 4：提交**

```bash
git add PROGRESS.md
git commit -m "docs(E1): PROGRESS 记录 P0 一致性修复完成"
```

---

## Self-Review

**1. Spec coverage（对照 spec 的 Plan E1 节）：**
- spec 改动点 1（FilterBar 字号 + select 暗色）→ Task 1 ✓
- spec 改动点 2（DashMetrics `--cyan`→`--c-remaining`）→ Task 2 Step 1 ✓
- spec 改动点 3（AnalysisView 待回款语义化）→ Task 2 Step 3 ✓
- spec 改动点 4（全局核验，遗漏一并改）→ Task 2 Step 2（BoardView 橙色错色，即遗漏）+ 范围边界说明（已正确红色处明确记入 backlog 而非本期改）✓
- spec 测试节（无新逻辑，跑现有套件 + 手动）→ Task 3 ✓

**2. Placeholder scan：** 无 TBD/TODO；每个 CSS 改动均给出前后完整代码；命令均可执行、附预期输出。✓

**3. Type consistency：** 无新类型/函数。CSS 类名一致：`.sb-val.remaining` 在 Task 2 Step 3 同时定义（style）与使用（template）；`.dm-v.remain` 类名保留仅换取值；`--c-remaining` 为 theme.css 既有 token（行 47）。✓
