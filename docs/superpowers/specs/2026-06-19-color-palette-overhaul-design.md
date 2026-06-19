# 整体配色改版（Color Palette Overhaul）设计

> 把全站配色从「蓝灰基调 + 绿/黄/红状态色」整体切换到用户钦定的品牌色板。
> 本 spec 是配色取值的新权威，**取代** `2026-06-10-design-foundation-design.md` §1「配色」的具体色值；该文档其余章节（排版/间距/卡片/圆角/阴影/动效/密度/交互/zindex/断点）与角色框架仍然有效。

**日期:** 2026-06-19
**版本:** V1.10.0（Y 级，整页级以上的全局视觉改版；用户已确认走小版本，不升 X）
**范围:** 仅「配色令牌取值」+ 其契约测试 + 散落硬编码色归一 + 文档对齐。不改令牌名、不改排版/间距/卡片等其它 foundation 维度、不迁移页面结构。

---

## 1. 输入色板（用户钦定）

### 1.1 品牌彩色（11 支）

| 名称 | 色号 | 名称 | 色号 |
|---|---|---|---|
| 深蓝 | `#0D3A69` | 深红 | `#470125` |
| 橙色 | `#EB5C20` | 正蓝 | `#002FA7` |
| 棕色 | `#492D22` | 青绿 | `#018B8D` |
| 正红 | `#C8161D` | 浅红 | `#D34947` |
| 蓝绿 | `#71E2D1` | 浅绿 | `#6ECC54` |
| 浅黄 | `#F9D46C` | | |

### 1.2 中性色（仅这 4 个黑白；其余一律禁止引入新色号）

| 名称 | 色号 | 角色 |
|---|---|---|
| 柔纸白 | `#FBFBFD` | 浅色卡片面 / 反白前景 |
| 米白 | `#F6F6F0` | 浅色页面底 |
| 炭黑 | `#121212` | 暗色卡片面 / 浅色主文字 |
| 深海石 | `#0D1117` | 暗色页面底 |

---

## 2. 决策（brainstorm 已敲定）

1. **中性灰阶派生策略 = 透明度/明度派生。** 结构层只用 4 个黑白中性色，靠明度（具体派生灰）或透明度（color-mix over transparent）生成 `card2/line/line2/sub/mut` 各级；不引入第 16 个色号。纯灰即「黑白派生」，符合「仅允许黑白」约束。
2. **可访问性 = 可读性优先。** 当品牌色做小号文字达不到 4.5:1 时，允许把该色向炭黑（深字）或柔纸白（浅字）做派生，得到达标的「深字 / 提亮」文字档；仍只基于「给定色 + 黑白」。保留现有「淡底 + 深字」三态形态。
3. **范围 = 整体统一。** 两个令牌落地文件 + 其契约测试 + 组件里散落的硬编码色，一并并入新色板。
4. **主强调 = 深蓝。** `--accent`=深蓝 `#0D3A69`（沉稳主色），`--accent2`=正蓝 `#002FA7`（更跳的辅助强调）。
5. **已回款绿 = 浅绿 `#6ECC54`。**
6. **danger 三档红同源：** 浅色 `--danger`=正红 `#C8161D`、暗色=浅红 `#D34947`、深字档=深红 `#470125`。
7. **暖色复用：** 暖色仅橙、黄两支，`--warn`(待回款) 与 `--highlight`(选区/标记) 共用浅黄 `#F9D46C`，`--c-urgent`(临期) 用橙色 `#EB5C20`，互不冲突。

### 2.1 色板使用总览（11 彩全部物尽其用）

| 品牌色 | 主要角色 | 兼任 |
|---|---|---|
| 深蓝 `#0D3A69` | `--accent`（浅） | `--chart-1`（浅） |
| 正蓝 `#002FA7` | `--accent2`（浅）/ `--c-plan`（浅） | — |
| 橙色 `#EB5C20` | `--c-urgent` | `--chart-2` |
| 浅黄 `#F9D46C` | `--warn` / `--highlight` | `--chart-4` |
| 正红 `#C8161D` | `--danger`（浅） | `--chart-5`（浅） |
| 浅红 `#D34947` | `--danger`（暗） | `--chart-5`（暗） |
| 深红 `#470125` | `--danger-text`（浅，深字） | — |
| 青绿 `#018B8D` | `--c-advance`（浅，`--cyan`） | `--chart-3`（浅） |
| 蓝绿 `#71E2D1` | `--c-advance`（暗，`--cyan`） | `--chart-6` |
| 浅绿 `#6ECC54` | `--ok` | `--chart-7` |
| 棕色 `#492D22` | `--warn-text`（浅，深字） | `--chart-8`（浅） |

---

## 3. 令牌取值表（落地到 `theme.css`）

> 约束沿用 foundation：ECharts 镜像的 5 个令牌（`--txt/--sub/--line/--line2/--card`）+ 状态基色（`--ok/--warn/--danger`）+ `--chart-1..8` 必须是**具体色值**（canvas 读不到变量、且双源契约逐字比对）；仅 `-bg` 淡底、`hover/selected` 用 color-mix；派生灰阶写具体值。色值统一小写以对齐 echartsTheme.ts 常量。

### 3.1 结构色

| 令牌 | 浅色 `:root` | 暗色 `html.dark` | 说明 |
|---|---|---|---|
| `--bg` | `#f6f6f0` | `#0d1117` | 米白 / 深海石 |
| `--card` | `#fbfbfd` | `#121212` | 柔纸白 / 炭黑 |
| `--card2` | `#f1f1ef` | `#1b1b20` | 派生（次级面/表头底） |
| `--line` | `#e4e4e2` | `#272b31` | 派生（主分隔） |
| `--line2` | `#d4d4d2` | `#343a44` | 派生（强描边） |
| `--txt` | `#121212` | `#fbfbfd` | 主文字 |
| `--sub` | `#474747` | `#bcbec1` | 次要文字 |
| `--mut` | `#6b6b6b` | `#8b8e93` | 弱化文字（目标 ≥4.5:1） |
| `--accent` | `#0d3a69` | `#7891ac` | 深蓝 / 深蓝明度提亮 |
| `--accent2` | `#002fa7` | `#7e95d2` | 正蓝 / 正蓝明度提亮 |
| `--highlight` | `#f9d46c` | `#f9d46c` | 浅黄 |
| `--on-accent` | `#fbfbfd` | `#fbfbfd`（继承） | 反白前景 |

### 3.2 状态语义色（固定语义；别名 `--c-paid/--c-pending/--c-remaining/--c-delayed` 不动）

| 令牌 | 浅色 | 暗色 | 语义 |
|---|---|---|---|
| `--ok`（`--c-paid`） | `#6ecc54` | `#6ecc54` | 已回款 |
| `--warn`（`--c-pending`） | `#f9d46c` | `#f9d46c` | 待回款 |
| `--danger`（`--c-remaining`/`--c-delayed`） | `#c8161d` | `#d34947` | 风险/延期/缺口 |
| `--c-plan` | `#002fa7` | `#7e95d2` | 计划回款 |
| `--c-urgent` | `#eb5c20` | `#eb5c20` | 7 天临期 |
| `--cyan`（`--c-advance` = `var(--cyan)`） | `#018b8d` | `#71e2d1` | 可提前（青绿/蓝绿） |

> `--c-advance: var(--cyan)` 的别名声明保持不变（契约测试断言其存在）；只改 `--cyan` 取值，浅=青绿、暗=蓝绿。

### 3.3 状态三态 · 淡底（公式不变，自动引用新基色）

`--ok-bg/--warn-bg/--danger-bg/--urgent-bg/--advance-bg` = `color-mix(in srgb, var(<基色>) 12%, transparent)`（浅）/ `16%`（暗）。形态与降级策略沿用 foundation §1.3.1，不改。

### 3.4 状态三态 · 文字档（深字/提亮，目标 ≥4.5:1）

| 令牌 | 浅色（深字） | 暗色（提亮） |
|---|---|---|
| `--ok-text` | `#2f6b27` | `#8fd97a` |
| `--warn-text` | `#492d22`（棕色） | `var(--warn)` |
| `--danger-text` | `#470125`（深红） | `#e8918f` |
| `--urgent-text` | `#8a3a18` | `var(--c-urgent)` |
| `--advance-text` | `#056d6e` | `var(--c-advance)` |

### 3.5 图表分类色 `--chart-1..8`

| # | 浅色 | 暗色（深色档明度提亮） | 来源 |
|---|---|---|---|
| 1 | `#0d3a69` | `#3e6fa8` | 深蓝 |
| 2 | `#eb5c20` | `#eb5c20` | 橙 |
| 3 | `#018b8d` | `#1fa6a8` | 青绿 |
| 4 | `#f9d46c` | `#f9d46c` | 浅黄 |
| 5 | `#c8161d` | `#d34947` | 红（暗用浅红） |
| 6 | `#71e2d1` | `#71e2d1` | 蓝绿 |
| 7 | `#6ecc54` | `#6ecc54` | 浅绿 |
| 8 | `#492d22` | `#8a5a45` | 棕（暗提亮） |

### 3.6 Element Plus 桥接

`--el-color-primary` 系列继续由 `--accent` 经 `color-mix` 派生，公式不变（自动跟随新 accent）。`html.dark` 段 EP 灰阶映射到结构色，不改。

---

## 4. 第二落地文件 `echartsTheme.ts`（与 §3 同源）

```ts
CHART_LIGHT  = ['#0d3a69','#eb5c20','#018b8d','#f9d46c','#c8161d','#71e2d1','#6ecc54','#492d22']
CHART_DARK   = ['#3e6fa8','#eb5c20','#1fa6a8','#f9d46c','#d34947','#71e2d1','#6ecc54','#8a5a45']
STRUCT_LIGHT = { txt:'#121212', sub:'#474747', line:'#e4e4e2', line2:'#d4d4d2', card:'#fbfbfd' }
STRUCT_DARK  = { txt:'#fbfbfd', sub:'#bcbec1', line:'#272b31', line2:'#343a44', card:'#121212' }
STATUS_LIGHT = { ok:'#6ecc54', warn:'#f9d46c', danger:'#c8161d' }
STATUS_DARK  = { ok:'#6ecc54', warn:'#f9d46c', danger:'#d34947' }
```

`echartsTheme.tokens.test.ts` 是**动态双源比对**（读两文件断言相等），不需改、自动跟随；只要 §3 与本节逐项一致即绿。

---

## 5. 契约测试 `theme.tokens.test.ts`（硬编码期望值，必须同步重写）

该测试用 `toContain` 钉死了一批期望色值，全部按 §3 改写。逐项映射：

**:root（浅色）**
- `--bg: #f6f6f0`、`--card: #fbfbfd`、`--txt: #121212`、`--accent: #0d3a69`、`--accent2: #002fa7`、`--highlight: #f9d46c`
- `--ok: #6ecc54`、`--warn: #f9d46c`、`--danger: #c8161d`、`--c-urgent: #eb5c20`
- `--chart-1: #0d3a69`、`--chart-5: #c8161d`、`--chart-8: #492d22`
- `--mut: #6b6b6b;`
- `--ok-text: #2f6b27;`、`--warn-text: #492d22;`、`--danger-text: #470125;`、`--urgent-text: #8a3a18;`、`--advance-text: #056d6e;`
- 改：`--on-accent: #ffffff` → `--on-accent: #fbfbfd`（`#ffffff` 不在 4 中性色内，归一到柔纸白；契约测试该行同改）。
- 不变：`--c-advance: var(--cyan);`、各 `-bg: color-mix... 12% ...`、间距/字号/卡片/阴影/动效/交互/zindex/`--c-paid..` 别名/`.u-num`/`不含 Inter`。

> 注：EP 桥接里 `--el-color-primary-light-*` 的 `color-mix(... #fff)` 是「向白派生」的明度原语，保留不动（白是派生工具，非新增色号）；仅把用户可见的反白文字（`--on-accent`、`DisplaySettings` 的 `#fff`）归一到柔纸白 `#fbfbfd`。

**html.dark（暗色）**
- `--bg: #0d1117`、`--card: #121212`、`--txt: #fbfbfd`、`--accent: #7891ac`、`--accent2: #7e95d2`
- `--danger: #d34947`、`--ok: #6ecc54`
- `--ok-text: #8fd97a;`、`--danger-text: #e8918f;`
- 不变：`--warn-text: var(--warn);`、`--urgent-text: var(--c-urgent);`、`--advance-text: var(--c-advance);`、各 `-bg: ...16%...`、`--shadow-1`(暗)。

---

## 6. 散落硬编码色归一（范围=整体统一）

| 文件 | 现状 | 处理 |
|---|---|---|
| `lib/calendar.ts` `LIST_STATUS_ORDER` | `延期 #EF4444 / 待回款 #94A3B8 / 部分回款 #3B82F6 / 质保期 #F59E0B` | color 字段进 CSS 内联绑定 → 改 `var(--token)`：延期=`var(--danger)`、待回款=`var(--mut)`、部分回款=`var(--c-plan)`、质保期=`var(--warn)`。 |
| `nav.ts` `TIERS` | `var(--red,#ef4444)/var(--orange,#f59e0b)/var(--green,#10b981)`（`--red/--orange/--green` 令牌不存在，恒走 fallback） | 改为存在的令牌：100万以上=`var(--danger)`、50-100万=`var(--warn)`、50万以下=`var(--ok)`。 |
| `components/PendingBarChart.vue` `COLORS` | `['#EF4444','#F59E0B','#10B981']`，进 ECharts canvas | 改具体色值（danger/warn/ok 同源）：`['#c8161d','#f9d46c','#6ecc54']`。 |
| `components/PageStub.vue` `.hint` | `color:#94a3b8` | 改 `color: var(--mut)`。 |
| `components/DisplaySettings.vue` `.seg-btn.on` | `color:#fff` | 改 `color: var(--on-accent)`。 |
| `components/CalDayDetail.test.ts` | 断言日历状态色 | 随 `calendar.ts` 改后的 `var(--token)` 同步更新断言。 |
| `components/PendingBarChart.test.ts` | 断言 `COLORS` | 随上面新 `COLORS` 同步更新断言。 |

---

## 7. 版本与文档对齐

- `frontend/src/version.ts` → `V1.10.0`，日期 `2026-06-19`（单一来源，只改此处）。
- `CLAUDE.md` 「## 设计底层规范」首条「配色」里的示例色号，由旧值改为新值（accent 浅 `#0D3A69`/暗 `#7891AC`；已回款 `#6ECC54`/待回款 `#F9D46C`/风险延期 `#C8161D`/可提前 青绿`#018B8D`/蓝绿`#71E2D1`），并补一句「结构灰阶由 4 个黑白中性色派生、全站仅用钦定色板」。
- `2026-06-10-design-foundation-design.md` 顶部加一行 supersede 注记：§1 配色具体色值以本 spec 为准（不改其历史正文）。
- `PROGRESS.md` 增一条改版记录；finishing 后回填合并 SHA。

---

## 8. 验证（Verification）

1. `bash verify.sh` 全绿（typecheck / vitest 含两套契约测试 / build / 后端 ruff·pytest 不受影响）。
2. 契约测试硬断言新色值；ECharts 双源动态比对一致。
3. 手动核验：
   - light / dark 切换，三档字号切换，看板/图表/日历/台账无 JS 报错（右下角红条）。
   - 状态 chip「淡底 + 深字」可读；深字档（ok/warn/danger/urgent/advance）在白卡与各自淡底上目测清晰（目标 ≥4.5:1，实现阶段以对比度核验确认，未达标者在「给定色 + 黑白」范围内微调）。
   - 图表 8 色可区分；回款状态系列用状态色而非 chart 色（沿用 foundation §1.4 规则，不在本轮调整）。

---

## 9. 不在本轮（范围边界）

- 排版/间距/卡片/圆角/阴影/动效/密度/交互状态/zindex/断点等其它 foundation 维度。
- 页面结构/信息架构/组件交互逻辑。
- 其余配色方案换肤切换机制（foundation §14 已列为未来项）。
- foundation spec 历史正文重写（只加 supersede 注记）。
