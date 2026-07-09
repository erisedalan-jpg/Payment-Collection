# /data 数据管理页重设计（工作流导向 + 状态总览）设计 · V2.8.0

> 日期：2026-07-09
> 状态：设计已确认（用户认可）
> 范围：在**保留全部现有功能**的前提下重做 `/data` 页——从扁平的 8 卡纵向堆叠，改为「状态总览条 + 主区工作流 + 折叠维护区」的层级结构，提升主路径清晰度、状态可见性、误操作防护。纯前端、零后端改动，严守项目设计令牌。

## 1. 目标与背景

现状 `frontend/src/views/DataView.vue` 是 8-9 张等重 `dv-card` 纵向堆叠：数据来源说明 / 文件清单与状态 / 数据下载·更新（含 PMIS cookie + 本机代理 + 倚天区）/ 设置(清空) / 项目标签 / 人工导入·回滚 / 数据历史·回滚。全部用项目令牌、无硬编码，功能完整但：

- **层级扁平**：高频操作（上传/取 cookie/下载/更新）与低频危险操作（清空/回滚/人工导入）等重堆叠，主路径不突出、易误操作。
- **状态分散**：处理/PMIS 时间戳缩在顶部，本机代理状态、cookie 新鲜度散落各卡。
- **布局残留**：「设置」用 `dv-grid2` 却只放一张卡。
- **信息偏文字堆砌**。

### 已定方向（brainstorm 确认）

| 决策点 | 选择 |
|---|---|
| 主方向 | **工作流导向 + 状态总览**（视觉+结构都重做） |
| 维护/危险操作形态 | **折叠面板**（el-collapse，默认收起） |
| 手动粘贴 cookie textarea | 收进「更多」折叠作高级兜底（主路径改为「获取本机 cookie」按钮） |
| 功能范围 | **一个不删**，仅重排 + 改样式 |
| 版本 | V2.8.0（/data 整页重设计，Y 级） |
| 后端 | **零改动**（纯前端） |

## 2. 页面骨架

```
数据管理
┌─────────────────────────────────────────────────┐
│ 上次处理 X · PMIS X · 本机代理●已连接 · cookie●有效 │  ← 状态总览条(新)
└─────────────────────────────────────────────────┘

■ 获取与更新数据                          (主区,常展开)
  ① 获取数据
    ┌ 在线下载 ──────────┐  ┌ 上传文件 ──────────┐
    │ [获取本机PMIS cookie]│  │ PMIS九表清单+状态   │
    │  代理●/cookie●       │  │ [上传] 项目域+状态  │
    │ [下载数据] ▓▓▓░       │  │ [上传]              │
    └──────────────────────┘  └─────────────────────┘
    ▸ 更多：手动粘贴 cookie / 倚天 cookie(取备用)   (次级,折叠)
  ② 更新看板
    [更新数据（重新处理）] ▓▓▓▓░

维护                                      (折叠面板,默认收起)
▸ 项目标签
▸ 人工数据导入 / 回滚
▸ 数据历史 / 回滚
▸ 清空数据 ⚠
```

三段：**状态总览条**（新）→ **主区「获取与更新数据」**（① 获取：在线/上传两路径并列 → ② 更新看板）→ **维护区**（折叠，默认收起）。原「数据来源（两种方式）」说明卡收成主区内一行浅色 helper 文本。

## 3. 状态总览条（新组件 `DataStatusBar.vue`）

一排紧凑状态项，横向排布、窄屏换行。用 `.u-num` 挂时间/数字，用**状态语义色三态（淡底深字）**：

- **上次处理时间**（`lastUpdate`）、**PMIS 时间**（`lastPmis`）：中性（`--sub` 标签 + `--txt` 值）。
- **本机代理**：`已连接`（`--ok-bg`+`--ok-text`）/ `未运行`（`--warn-bg`+`--warn-text`）。
- **PMIS cookie**：`有效`（`--ok`，附 SESSION 预览 + 更新时间）/ `未设置`（`--warn`）。
- **倚天 cookie**：`已存`（中性）/ `-`（`--mut` 弱化）。

`DataStatusBar.vue` 为**表现型组件**：props 喂入（`lastUpdate`、`lastPmis`、`agentOnline`、`cookieStatus`、`yitianStatus`），无副作用、无 store 依赖，可独立单测。DataView 把已有 ref 作为 props 传入。

## 4. 主区「获取与更新数据」

### ① 获取数据 · 两路径并列（`.u-grid-auto` 自动换列，窄屏堆叠）

- **在线下载（PMIS）**：
  - `获取本机 PMIS cookie 并推送` 按钮（`--accent` 主色，`data-test="btn-fetch-pmis-cookie"`）+ 代理/cookie 状态点。
  - `下载数据` 按钮（`data-test="btn-download"`）+ 下载进度条。
  - 逻辑沿用现 `onFetchPmisCookie`/`onDownload`/`startDownload`；无 SESSION 告警不推送、代理未运行提示——全保留。
- **上传文件**：
  - PMIS 九表清单 + 状态（`dv-fgrid` 文件格，`data-test="files-card"`/`pmis-row`）+ `上传 PMIS 文件`。
  - 项目域文件清单 + 状态 + `上传项目域文件`。
  - 逻辑沿用现 `onPmisUpload`/`onUploadInputs`。

### 次级「更多」（默认折叠）

- **手动粘贴 cookie**：保留现 `pmisCookie` textarea（`data-test="pmis-cookie"`）+ 提示，作高级兜底。
- **倚天 cookie（取备用）**：`获取本机倚天 cookie 并存储` 按钮（`data-test="btn-fetch-yitian-cookie"`）+ 状态；逻辑沿用 `onFetchYitianCookie`。

### ② 更新看板

- `更新数据（重新处理）` 主按钮（`--accent`）+ 更新进度条。作为两获取路径的汇聚终点，视觉最突出。逻辑沿用 `startReprocess`。

## 5. 维护区（`el-collapse`，默认全部收起）

四个折叠面板，内容与 handler **全沿用现有**：

- **项目标签**：标签库（`onAddTag`/`onRename`/`onDisable`）+ 按标签排除（`excludeOn`/`excludeTags`）。
- **人工数据导入 / 回滚**：导入 xlsx（`onManImport`）+ 错误表 + 备份列表回滚（`onManRollback`，`data-test="manual-import-card"`/`man-backup-row`）。
- **数据历史 / 回滚**：撤销（`onUndoRollback`）+ 版本列表回滚（`onRollback`，`data-test="history-row"`/`history-rollback`/`history-source-note`）+ 源数据说明。
- **清空数据 ⚠**：危险，标题/按钮用 danger 淡底深字；现有**两步 confirm**（`ElMessageBox.confirm` ×2）**保留不变**。

## 6. 视觉与交互（严守设计令牌，不引框架）

- 状态点/徽标一律状态语义色三态（`--ok-bg/--ok-text`、`--warn-bg/--warn-text`、`--danger-bg/--danger-text`），禁实底小字。
- 主操作 `--accent`+`--on-accent`；危险 danger 淡底深字；进度条沿用 `--accent`。
- 分区间距 `--gap-section`，卡片沿用 `--card/--line/--shadow-1/--r-md`；hover 用 `--hover-tint`、focus 走全局 `:focus-visible`；微交互可克制取 `--lift`（V2.5.2 已入库令牌）。
- 折叠用 Element Plus `el-collapse`（项目已用 Element Plus，不引新框架）。
- 三档字号 `--fs-*`、8pt 间距 `--sp-*`、圆角 `--r-*`、阴影 `--shadow-1/2`（最多两层）全走令牌，**无手写散值**；金额/时间/数字挂 `.u-num`。
- 动效仅 `--dur-1/--dur-2` + `--ease`，尊重 `prefers-reduced-motion`。

## 7. 保留清单（「保留现有功能」硬约束）

**功能一个不删**：PMIS/项目域上传、获取本机 PMIS cookie、手动粘贴 cookie、下载数据、更新数据、倚天 cookie 取存、项目标签增改禁用 + 按标签排除、人工导入/回滚、历史回滚/撤销、清空数据（两步确认）、各状态/时间显示——全部保留，仅重排 + 改样式。

**所有 `data-test` 钩子保留**：`pmis-cookie`、`btn-download`、`btn-fetch-pmis-cookie`、`btn-fetch-yitian-cookie`、`files-card`、`pmis-row`、`manual-import-card`、`man-backup-row`、`history-row`、`history-rollback`、`history-source-note`。→ 既有 `DataView.test.ts` 不破：`el-collapse` 内容默认渲染在 DOM 中（仅 CSS 收起、非懒挂载），测试可正常查询到这些 data-test 元素与 handler；涉及展开交互的用例在测试内把对应面板设为激活即可。

## 8. 架构 · 单元边界 · 测试 · 版本 · 交付

- **架构**：`DataView.vue` 的 `<script setup>`（refs/handlers/composables/onMounted/defineExpose）**基本不动**，只重排 `<template>` + 重写 `<style scoped>`。抽出 `DataStatusBar.vue`（表现型、props 驱动、无副作用）承载状态总览条。纯前端、**零后端改动**。
- **单元边界**：`DataStatusBar.vue` 只渲染 + 依 props，不碰 store/api，可独立测；DataView 仍是编排者（数据/handler 源头）。
- **测试**：
  - `DataStatusBar.test.ts`（vitest）：各状态渲染——代理已连接/未运行、cookie 有效/未设置、倚天已存/无 的三态类与文案。
  - `DataView.test.ts`：既有用例保持绿（靠保留 data-test + handler + defineExpose）；补 1-2 用例——维护折叠区可展开、主按钮（更新数据）可点、状态条组件被渲染。
- **版本**：**V2.8.0**（/data 整页重设计，Y 级）。单一来源 `frontend/src/version.ts`。
- **交付**：**纯前端包**——**无需重启后端、无需点「更新数据」**，仅替换 `frontend/dist`。从在线基线 V2.7.1 增量。

## 9. 非目标（YAGNI）

- 不改任何后端端点/数据管线/pmisdata。
- 不新增页面/路由/pageKey。
- 不引入新前端框架或外链字体/资源。
- 不改业务口径、不动 cookie 代理逻辑。
- 倚天不加下载（数据功能仍待后续开发）。
