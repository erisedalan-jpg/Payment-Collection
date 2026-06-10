# 展示形式底层设计规范（Design Foundation）

> 设计令牌 / foundation 层规范。约束**展示形式**(配色·排版·间距·卡片·圆角·阴影·动效·密度),不规定**展示内容**(每页放什么,后续单独设计)。
> 本规范是后续所有页面重构的视觉底座;页面只准引用这里定义的令牌,不准手写散值。

**日期:** 2026-06-10
**版本:** V2 —— V1 落地令牌体系(theme.css);V2 增补:浅色 `--mut` 对比度修正、状态色三态(填充/淡底/文字)、ECharts canvas 桥接、交互状态层、数字排版(tabular-nums/行高/字距)、字体令牌、`--cyan` 收编、z-index 阶梯、断点约定。
**范围:** 仅令牌 + 文档落地 —— 落地文件为 `frontend/src/styles/theme.css`(CSS 唯一落地)与 `frontend/src/charts/echartsTheme.ts`(canvas 桥接,双源契约,见 1.7)+ 本 spec + CLAUDE.md 条款。现有 Vue 页面**不迁移**,留到后续"内容层"重构时逐页换用新令牌。
**配色基调决策:** 5 套候选色里选**蓝色系**做基调(唯一既语义中立、中性色阶又完整);绿/红当基调会与状态语义色冲突,棕偏弱,紫留作"想更独特"的未来换肤备选。状态语义色独立固定;图表分类色从 5 套各抽一支,使 5 套全部物尽其用。

---

## 1. 配色（Color）

### 1.1 原则

- **结构色 vs 状态色分离。** 结构色(背景/卡片/边框/文字/强调)代表产品气质,挑语义中立的蓝;状态色(已回款/待回款/风险)代表数据读数,独立固定,不随基调变。
- 颜色承载语义的场合(状态),不允许被审美主题覆盖。
- light / dark 两套,同名令牌在两主题下各有取值,`:root` 为浅色,`html.dark` 覆盖。

### 1.2 结构色令牌

| 令牌 | 角色 | Light | Dark |
|---|---|---|---|
| `--bg` | 页面底 | `#EEF3F7` | `#0E1A22` |
| `--card` | 卡片面 | `#FFFFFF` | `#16262F` |
| `--card2` | 次级面/表头底 | `#F6F9FB` | `#11212A` |
| `--line` | 主分隔线 | `#DDE6EE` | `#253A47` |
| `--line2` | 强分隔/描边 | `#CDDAE2` | `#2F4756` |
| `--txt` | 主文字 | `#1E2A33` | `#E4EDF2` |
| `--sub` | 次要文字 | `#4A5B68` | `#A7BAC7` |
| `--mut` | 弱化文字 | `#62707D`(V2 加深,原 `#7C8A97` 仅 3.17~3.54:1 不达标;新值在 `--bg`/`--card`/`--card2` 上全部 ≥4.5:1) | `#8295A3` |
| `--accent` | 主强调(按钮/链接/选中) | `#325969` | `#6C8FA9` |
| `--accent2` | 次强调(hover/辅助) | `#6C8FA9` | `#8FB0C4` |
| `--highlight` | 高亮点缀(选区/标记) | `#C8ADC4` | `#C8ADC4` |
| `--on-accent` | 强调填充上的反白前景 | `#FFFFFF` | `#FFFFFF` |

### 1.3 状态语义色令牌（固定,不随基调变）

| 令牌 | 回款语义 | Light | Dark |
|---|---|---|---|
| `--ok` (= `--c-paid`) | 已回款 / 成功 | `#4E9A7C` | `#5BA88A` |
| `--warn` (= `--c-pending`) | 待回款 / 警示 | `#E0A23B` | `#E6B056` |
| `--danger` (= `--c-remaining` / `--c-delayed`) | 风险 / 延期 / 缺口 | `#D24D5C` | `#E0697A` |
| `--c-plan` | 计划回款 | `#6C8FA9` | `#7FA5BE` |
| `--c-urgent` | 7 天内临期 | `#E07A4F` | `#EC8A60` |
| `--c-advance`(= `--cyan`,V2 收编) | 可提前 | `#0891B2` | `#22D3EE` |

> 回款别名(`--c-paid`/`--c-pending`/`--c-remaining`/`--c-delayed`/`--c-plan`/`--c-urgent`)沿用现有命名,指向上表;现有 567 处 `var(--…)` 引用尽量不改名,只改取值。
> `--cyan` 原为游离令牌(实际用于日历「可提前」状态),V2 收编为状态语义色,新增别名 `--c-advance: var(--cyan)`,旧名保留兼容。

### 1.3.1 状态色三态(填充 / 淡底 / 文字,V2)

带文字的状态标识(chip / 标签 / 带字色块)一律**「淡底 + 深字」**,可加状态色圆点或 1px 状态色描边;实底(100% 状态色)只用于**无文字**色块(图例点 / 迷你条 / 进度段);状态色做长段正文仍然禁止。现状「实底 + 白字」全部不达标(白字于警示色仅 2.23:1),禁止再用。

| 状态 | 填充(取值不变) | 淡底 | 文字(Light) | 文字(Dark) |
|---|---|---|---|---|
| 已回款 | `--ok` | `--ok-bg` | `--ok-text` `#37745B` | `var(--ok)` |
| 待回款 | `--warn` | `--warn-bg` | `--warn-text` `#8A6210` | `var(--warn)` |
| 风险延期 | `--danger` | `--danger-bg` | `--danger-text` `#B93848` | `var(--danger)` |
| 7 天临期 | `--c-urgent` | `--urgent-bg` | `--urgent-text` `#A84B1D` | `var(--c-urgent)` |
| 可提前 | `--c-advance` | `--advance-bg` | `--advance-text` `#066F89` | `var(--c-advance)` |

- 淡底公式:浅色 `color-mix(in srgb, <状态填充色> 12%, transparent)`,暗色 16%;随所在底色自适应。不支持 `color-mix` 的浏览器忽略该声明 → 无淡底但深字仍可读(安全降级,同 EP 桥接策略)。
- 文字色已实测:浅色五个值在白卡与各自淡底上全部 ≥4.5:1;暗色直接用状态本色(于暗色卡面实测 4.78~8.59,全达标)。

### 1.4 图表分类色（5 套各抽一支）

| 令牌 | 取值(Light) | 取值(Dark) | 来源 |
|---|---|---|---|
| `--chart-1` | `#6C8FA9` | `#7FA5BE` | 蓝 |
| `--chart-2` | `#B484B0` | `#C29AC0` | 紫 |
| `--chart-3` | `#417A64` | `#5BA88A` | 绿 |
| `--chart-4` | `#886441` | `#B08A63` | 棕 |
| `--chart-5` | `#D24D5C` | `#E0697A` | 红 |
| `--chart-6` | `#C8ADC4` | `#D2BCCF` | 紫系浅 |
| `--chart-7` | `#FEC187` | `#FEC187` | 棕系琥珀 |
| `--chart-8` | `#A7C190` | `#B7CEA3` | 绿系浅 |

> 用色规则(V2):图表中**表达回款状态**的系列(已回款/待回款/风险等)必须用状态语义色(`--c-paid` 等);`--chart-1..8` 仅用于无固定语义的分类对比(客户/项目/月份等)。

### 1.5 可访问性护栏（补充规则 1）

- 正文 / 表格数据 / 任何小号文字(≤ `--fs-3`)一律用 `--txt`(或 `--sub` 作次要),**禁止**用 `--accent` / `--accent2` / `--highlight` / muted 蓝紫做小号正文 —— muted 色对比度不足会看不清。
- muted 结构色只可用于:大号粗体数字(`--fs-5`/`--fs-6`)、图标、填充块(白字反白)、图表系列、边框。
- 状态色用于文字时仅限标签 / 角标 / 状态短词,且必须用对应 `--*-text` 深字档(见 1.3.1),不用于长段正文。
- 暗色下 `--accent #6C8FA9` 上的 `--on-accent` 白字仅 3.42:1(V2 实测):自绘的 accent 实底填充上,白字仅限 ≥`--fs-4` 粗体或图标;小号场景改用 `--selected-tint` 淡底 + `--txt` 文字。

### 1.6 Element Plus 桥接

`--el-color-primary` 系列继续由 `--accent` 经 `color-mix` 派生(不支持的浏览器安全回退 EP 内置值);`--el-border-radius-base` 对齐 `--r-md`。暗色下 EP 灰阶映射到上表结构色(沿用现有 `html.dark` 段做法)。

### 1.7 ECharts canvas 桥接(双源 + 契约测试,V2)

ECharts 画在 canvas 里,读不到 CSS 变量,因此 `frontend/src/charts/echartsTheme.ts` 是**第二落地文件**:浅/暗两套注册主题(`ent` / `ent-dark`)的取值必须与 theme.css 同名令牌**逐项一致**,由契约测试强制(测试同时读两个源文件断言相等 —— 改一边漏一边,测试即红)。角色映射:

| ECharts 角色 | 令牌 |
|---|---|
| 调色板 `color` | `--chart-1..8`(浅/暗各一套) |
| 坐标轴线 `axisLine` / `axisTick` | `--line2` |
| 轴标签 `axisLabel` / 图例文字 | `--sub` |
| 分隔线 `splitLine` | `--line` |
| 标题 / tooltip 文字 | `--txt` |
| tooltip 底 / 边框 | `--card` / `--line` |
| 字体 `fontFamily` | 与 `--font-sans` 同栈(见 2.4) |

---

## 2. 排版（Typography）

### 2.1 六级层级（每级一个职责,字号·字重·色锁定）

| 令牌 | rem | px @中(16) | 字重 | 文字色 | 职责 |
|---|---|---|---|---|---|
| `--fs-6` | 2.15rem | ~34px | 700 | `--txt` | 大数字 / KPI 主值(card 主信息) |
| `--fs-5` | 1.55rem | ~25px | 700 | `--txt` | 页面 / 区块标题 |
| `--fs-4` | 1.2rem | ~19px | 600 | `--txt` | 卡片标题 / 小节头 |
| `--fs-3` | 1rem | 16px | 400 | `--txt` | 正文基准 |
| `--fs-2` | 0.875rem | 14px | 400 | `--sub` | 次要 / 表格元信息(card 辅信息) |
| `--fs-1` | 0.75rem | 12px | 600 | `--mut` | 角标 / 标签 / 列头(常配大写+字距) |

> rem 倍率三档恒定,px 随基准缩放。字重/色为默认基线,组件可在不破坏层级的前提下微调。

### 2.2 三档字号

`--fs-base` 由 settings store 运行时写到 `<html>`,六级按 rem 整体缩放:

| 档位 | `--fs-base` |
|---|---|
| 小 | `14px` |
| 中(默认) | `16px` |
| 大 | `18px` |

### 2.3 card「1 主 2 辅」映射

- 一张卡 **1 个主信息** + **最多 2 个辅信息**。
- 主信息 → `--fs-6` 或 `--fs-5`(700,`--txt`)。一张卡内**不允许出现两个 700 大号主值**。
- 辅信息 → `--fs-2` / `--fs-1`(常规字重,`--sub` / `--mut`)。

### 2.4 字体令牌(V2)

- `--font-sans: -apple-system, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif` —— 系统栈,拉丁系统字体优先、中文回退雅黑;**不含 Inter**(原栈首的 Inter 未随应用分发,只在恰好安装过的机器生效,导致各机观感不一致,V2 移除)。
- body 与 ECharts 主题(1.7)同源引用此栈。
- **前端禁止外链字体**(离线原则)。旧版 index.html 的 Google Fonts 外链属遗留前端,随 Phase C 删除,不在本轮。

### 2.5 数字排版 · 行高 · 字距(V2)

- 工具类 `.u-num { font-variant-numeric: tabular-nums; }`:金额、百分比、KPI 数值、表格数字列**必须**挂用 —— 等宽数字保证列对齐、数值刷新不跳动(回款看板满屏金额,这是底线规则)。
- 行高三档:

| 令牌 | 值 | 适用 |
|---|---|---|
| `--lh-tight` | `1.15` | `--fs-5` / `--fs-6` 大数字、大标题 |
| `--lh-dense` | `1.4` | `--fs-1` / `--fs-2` / `--fs-4` 表格、标签、小节头 |
| `--lh-base` | `1.6` | `--fs-3` 正文 |

- 字距 `--ls-wide: 0.05em`:仅用于 `--fs-1` 的**拉丁字母 / 数字大写标签**;中文列头**不大写、不加字距**(2.1 表中「常配大写+字距」仅指拉丁/数字场景)。

---

## 3. 间距（Spacing）

- **4px 基数 / 8px 节奏**(8pt grid;4px 仅用于内联紧排半步)。
- 间距阶梯令牌:

| 令牌 | 值 |
|---|---|
| `--sp-1` | `4px` |
| `--sp-2` | `8px` |
| `--sp-3` | `12px` |
| `--sp-4` | `16px` |
| `--sp-5` | `24px` |
| `--sp-6` | `32px` |
| `--sp-7` | `48px` |

页面布局的 margin/padding/gap 一律取自上表,不写表外散值。

---

## 4. 卡片（Card）

统一令牌,全平台一套:

| 令牌 | 值 | 用途 |
|---|---|---|
| `--card-pad` | `20px` | 卡片内边距 |
| `--gap-card` | `16px` | 卡片之间间距 |
| `--gap-stack` | `12px` | 卡内元素纵向堆叠 |
| `--gap-section` | `24px` | 区块之间间距 |

---

## 5. 圆角（Radius）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--r-sm` | `6px` | 标签 / 输入 / 角标 |
| `--r-md` | `10px` | 卡片(并对齐 `--el-border-radius-base`) |
| `--r-lg` | `14px` | 抽屉 / 弹窗 |
| `--r-full` | `999px` | 胶囊 / 圆点 |

---

## 6. 阴影（Shadow）

仅两级,每级**最多两层**投影;扁平 / 并列元素用 `1px` 边框,**不允许**第三种阴影。

| 令牌 | Light | Dark | 用途 |
|---|---|---|---|
| `--shadow-1` | `0 1px 2px rgba(30,42,51,.06), 0 2px 8px rgba(30,42,51,.05)` | `0 1px 2px rgba(0,0,0,.4), 0 2px 8px rgba(0,0,0,.3)` | 静置卡片 |
| `--shadow-2` | `0 2px 4px rgba(30,42,51,.08), 0 12px 28px rgba(30,42,51,.12)` | `0 2px 4px rgba(0,0,0,.5), 0 12px 28px rgba(0,0,0,.45)` | 悬浮 / 抽屉 / 浮层 |

---

## 7. 动效（Motion，补充规则 2）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--dur-1` | `120ms` | 状态反馈(hover / 按下 / 勾选) |
| `--dur-2` | `200ms` | 展开 / 抽屉 / 浮层进出 |
| `--ease` | `cubic-bezier(.2, 0, 0, 1)`(ease-out 类) | 统一缓动 |

- 全站过渡时长只用这两个令牌。
- 尊重 `@media (prefers-reduced-motion: reduce)`:该模式下时长归零 / 关闭位移动画。

---

## 8. 表格密度（补充规则 3）

- 表格单元格内边距统一:纵 `--sp-2`(8) · 横 `--sp-3`(12)。
- 行高随三档字号自然缩放(由 `--fs-base` 驱动),**不单独做密度开关**。
- 表头用 `--fs-1` + `--mut`,底色 `--card2`(大写+字距仅限拉丁/数字列头,见 2.5)。

---

## 9. 交互状态层(V2)

自绘交互件至少定义 **default / hover / selected / disabled / focus** 五态,全部取自下表令牌;Element Plus 组件经主色桥接(1.6)自带状态,不另行覆盖。

| 令牌 | 值 | 用途 |
|---|---|---|
| `--hover-tint` | `color-mix(in srgb, var(--accent) 6%, transparent)` | 行 / 列表项 / 卡片 hover 底 |
| `--selected-tint` | `color-mix(in srgb, var(--accent) 12%, transparent)` | 选中底;文字保持 `--txt`(可加 600 字重),不靠 accent 变色(暗色 accent 做小号文字不达标) |
| `--disabled-opacity` | `0.45` | 禁用态统一公式(整体降透明度,不逐色定义) |

- focus 全局规则(既有实现,正式入规范):`:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`。
- hover / 按下反馈时长用 `--dur-1`,展开浮层用 `--dur-2`(见第 7 节)。

---

## 10. 层叠 z-index(V2)

| 令牌 | 值 | 用途 |
|---|---|---|
| `--z-sticky` | `100` | 吸顶表头 / 工具条 |
| `--z-panel` | `1500` | 自绘浮层面板 |
| `--z-toast` | `4000` | 全局通知,压过一切 |

- 弹窗 / 抽屉 / 下拉**优先用 Element Plus 组件**(自带 2000+ 动态 z 管理);自绘浮层只准用上表三级,**禁止散写数字**。
- 现有 `FollowupRecords.vue` 的 `z-index: 3000` 留待内容层迁移时改为 `--z-panel`。

---

## 11. 断点与响应(V2)

CSS 的 `@media` 不能引用自定义属性,断点作为**文档常量**(与 theme.css 既有注释一致):

| 档位 | 条件 | 行为原则 |
|---|---|---|
| 窄屏 | `<=768px` | 侧栏收起、卡片单列、表格容器横向滚动 |
| 常规 | `<=1200px` | 栅格降列(优先靠 `.u-grid-auto` 自动换列,少写断点) |
| 宽屏 | `>1200px` | 完整布局 |

---

## 12. 落地约定

1. **落地文件:** `frontend/src/styles/theme.css`(CSS 唯一落地,令牌写入 `:root` 浅色 + `html.dark` 深色覆盖)与 `frontend/src/charts/echartsTheme.ts`(canvas 桥接,取值与 theme.css 同源,见 1.7)。
2. **命名兼容:** 沿用现有 `--bg/--card/--card2/--line/--line2/--txt/--sub/--mut/--accent/--on-accent/--fs-base/--fs-1..5/--c-*` 名称,只改取值并**新增** `--accent2/--highlight/--fs-6/--sp-*/--card-pad/--gap-*/--r-*/--shadow-*/--dur-*/--ease/--chart-*`。最大限度不动现有 567 处 `var(--…)` 引用。
   V2 再新增:`--c-advance`、`--ok-bg/--warn-bg/--danger-bg/--urgent-bg/--advance-bg`、`--ok-text/--warn-text/--danger-text/--urgent-text/--advance-text`、`--font-sans`、`--lh-tight/--lh-dense/--lh-base`、`--ls-wide`、`--hover-tint/--selected-tint/--disabled-opacity`、`--z-sticky/--z-panel/--z-toast`,工具类 `.u-num`;修改取值:浅色 `--mut`。仍零改名。
3. **现有页面不迁移:** 本轮只换令牌底座;页面逐个换用新卡片/间距/层级,放到后续"内容层"重构。
4. **三档字号机制:** 复用 settings store 写 `--fs-base` 的现有机制,把可选值定为 14 / 16 / 18,默认 16。
5. **验证:** 改动后跑 `bash verify.sh`(前端 typecheck/vitest/build 须绿)。契约测试覆盖:V1 全部令牌 + V2 新令牌存在性与取值、`.u-num`、ECharts 双源一致性(浅/暗调色板、结构映射、字体栈)。手动启动确认 light/dark 切换、三档字号切换、图表配色已换为 `--chart-1..8` 无异常。

---

## 13. 写入 CLAUDE.md 的条款（精简小节,指向本 spec）

在 CLAUDE.md「## 4. 关键约定」之后新增一节「## 设计底层规范（展示形式）」,列硬性约束并指向本文件(V2 同步增补状态三态/图表桥接/交互状态/数字排版/字体/z-index/断点条目)。

---

## 14. 不在本规范内（范围边界）

- 每个页面**展示什么内容**(信息架构、字段取舍、图表选型)—— 后续单独 brainstorm。
- 组件级交互细节(具体表单校验、空态文案等)。
- 纳管开关 / 筛选条等功能逻辑(见 PROGRESS.md backlog)。
- 其余 4 套配色的换肤切换实现(留作未来,不在本轮)。
- 现有页面迁移:PlanBoard 散值清理、FollowupRecords `z-index: 3000` 改 `--z-panel`、状态 chip 换三态形态等,全部归内容层重构。
- C 级项(Element Plus size 档位统一、自绘控件高度令牌)→ PROGRESS.md backlog。
