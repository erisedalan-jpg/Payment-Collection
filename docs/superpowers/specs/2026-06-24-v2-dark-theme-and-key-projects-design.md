# V2.0.0 子项目一：深色底色调整 + /projects/key 增强 设计

> 状态：已批准（用户 2026-06-24 授权"无需确认、按推荐顺序执行、完成后审核"）。
> 这是 V2.0.0 三块需求中较小的两块，合一个分支 / 一份 spec / 一份 plan。
> 纯前端，无后端、无口径改动。部署只需 dist。

## 目标

1. **深色底色调高亮度**：当前 `html.dark` 的两个近黑结构底色太暗，调亮为用户钦定的两个色值。
2. **/projects/key 重点项目进展**：历史快照选项卡改下拉菜单；导出数据集对话框加"一键全选"。

## 一、深色底色调整

### 现状
`frontend/src/styles/theme.css` 的 `html.dark`：
- `--bg: #0d1117;`（页面底，最暗，深海石派生，偏蓝）
- `--card: #121212;`（卡片面，炭黑派生，近中性）
- `--card2: #1b1b20;`（抬升面，比 card 略亮）

三者构成深色三层表面层级：**页面底(最暗) < 卡片面 < 抬升面**。

桥接耦合（改 `--card` 必须同步，否则契约测试红）：
- `frontend/src/charts/echartsTheme.ts:19` `STRUCT_DARK.card = '#121212'` —— 契约测试 `echartsTheme.tokens.test.ts:53` 强制 `STRUCT_DARK.card === cssVar(dark, '--card')`。
- `frontend/src/styles/theme.tokens.test.ts:107-108` 断言 `--bg: #0d1117` / `--card: #121212`。

### 方案
用户给两色：**深灰 `#1A1D24`**、**柔和黑 `#1C1A18`**。

**映射（保层级，下沉判定）**：以感知亮度排序，`#1C1A18`(≈26)比 `#1A1D24`(≈29)略暗；语义上"黑"暗于"灰"，且页面底应为最暗、卡片面抬升。故：
- `--bg`（页面底，最暗）→ **`#1C1A18`（柔和黑）**
- `--card`（卡片面，抬升一层）→ **`#1A1D24`（深灰）**

**派生联动 `--card2`**：原 `#1b1b20`(≈27) 在新 `--card`(≈29) 之下，会破坏"抬升面亮于卡片面"层级。`--card2` 不是用户钦点的第三色，而是 `--card` 的派生抬升面，须随之上调一档以保层级：
- `--card2` → **`#232730`**（≈39，明显亮于 card，冷调与 card 同源）

**同步点**：
- `echartsTheme.ts:19` `STRUCT_DARK.card` → `'#1A1D24'`（与新 `--card` 严格相等，过契约测试）。
- `theme.tokens.test.ts:107-108` → 改断言为 `--bg: #1C1A18` / `--card: #1A1D24`。

浅色 `:root`、状态语义色、图表分类色、EP 桥接均**不动**。EP 暗色桥接用 `var(--card)`/`var(--bg)` 自动随动，无需改。

> 可审项：若用户更想要 `--bg`=深灰、`--card`=柔和黑（即按列出顺序、反层级"卡片下沉"观感），翻转两行即可，成本极低。本设计取"保既有层级"解读。

## 二、/projects/key 增强

### 现状（`frontend/src/views/KeyProjectsView.vue`）
- 数据集选择：`SegToggle`，options=`[当前数据, a0(archiveTime), a1, ...]` —— 当前 + 全部历史快照平铺为一排选项卡。`dataset` ref 值 `'current'` 或 `'a{i}'`。
- 导出：超管 `v-if`，`exportOpen` 弹窗，`el-checkbox-group` v-model `exportSel`（默认 `['current']`），勾选数据集 → 多 sheet 导出。

### 方案

**2.1 历史快照改下拉**：
- 数据集控件改为「**当前数据 / 历史数据** 两段 `SegToggle`（mode）」+「mode=历史数据时显 `el-select` 下拉选具体快照」。
- 状态：`mode = ref<'current'|'history'>('current')`；`historyIdx = ref<number>(<最新archive下标>)`。
- `isCurrent = computed(() => mode.value === 'current')`（保留，defineExpose 仍暴露 `isCurrent`，老用例可用）。
- `rows`：`isCurrent ? currentRows : (archives[historyIdx]?.rows ?? [])`。
- 无 archives 时：历史数据段禁用（或不可选），默认停在当前数据。
- `dataset` ref 不再直接绑定 UI，但为兼容 defineExpose/老用例保留一个 `dataset` computed 派生（`isCurrent ? 'current' : 'a'+historyIdx`），或直接把 defineExpose 改为 `{ mode, historyIdx, isCurrent }`（以实现 plan 为准；保证 isCurrent 行为不变）。
- 默认选最新快照：archives 末尾为最新（`_progress_apply_archive` 用 append）；`historyIdx` 默认 `archives.length-1`。

**2.2 导出一键全选**：
- 导出弹窗 `el-checkbox-group` 上方加一个「全选 / 全不选」`el-checkbox`（indeterminate 态联动）：勾选→`exportSel = 全部 value`；取消→`exportSel = []`。
- 全选 checkbox 的 `checked`/`indeterminate` 由 `exportSel.length` 与 `datasetOpts.length` 派生。

### 不变
取数口径（TOP1000 大客户且合同>100万或P1）、编辑弹窗、归档、列定义、ColumnPicker/ColumnFilter/导出多 sheet 机制均不动。

## 测试策略
- **深色**：`theme.tokens.test.ts` 改后断言新 hex；`echartsTheme.tokens.test.ts` 契约测试自然过（STRUCT_DARK.card 同步）；`npm run typecheck`/`build` 绿。
- **/projects/key**：组件用例覆盖 (a) mode 切历史→下拉出现且 rows 取对应 archive；(b) 默认 mode=current、historyIdx=最新；(c) 全选 checkbox→exportSel 全选、取消→清空、半选 indeterminate。沿用 vitest + @vue/test-utils + Element Plus stub 现有范式。

## 完成定义
`bash verify.sh` 全绿（含前端 typecheck/vitest/build）。版本号不在本子项目 bump（V2.0.0 统一在集成阶段改）。
