# V2.8.2 跟进进展就地富文本内联编辑 — 设计文档

> 日期：2026-07-10　版本：V2.8.2（Z 级，纯前端）
> 前身/相关：[[v281-audit-target-detail-enrichment]]（审计对这些更新端点已埋点，本次不改审计）。
> 后续：V2.8.3 选列+排序按用户持久化（独立周期，本文不含）。

## 目标

把 5 个跟进页的「点击填写/编辑进展」从弹窗（`ProgressEditModal` 的单个 `el-input textarea`）改为**就地在单元格内的富文本内联编辑**，工具栏全套：加粗 / 下划线 / 删除线 / 字体颜色 / 斜体 / 清除格式。不弹窗、直接在格子里写。

## 架构概述

- **后端零改动**：更新端点对内容不敏感（`str(content or '')` 存字符串、进展字段无长度上限），HTML 串原样落盘。
- **审计零改动**：更新审计只记字段标签 + 「已修改」，不记正文（见 [[v281-audit-target-detail-enrichment]]）。
- **全部工作在前端**：新增一个共享内联编辑单元格组件 + 一个纯函数库（净化 / 去标签），替换 5 页的 `#cell-{field}` slot，删除 `ProgressEditModal`。
- **编辑器技术**：浏览器原生 `contenteditable` + `document.execCommand`，零第三方依赖（契合离线单机 / 无框架 / 禁外链约定）。

## Global Constraints（项目级硬约束，每个任务都隐含）

- 交流语言简体中文；**不使用任何 emoji**，符号用 `→ ↓ ❌ ✕ ▾ ⚠`。
- 跟进类型术语用「邮件推动」（不是「邮件催收」）。
- 只引用 `frontend/src/styles/theme.css` 设计令牌，**不手写散值**；补 CSS 完善表现，不引框架。自绘交互件五态齐全（default/hover/selected/disabled/focus）。
- 8pt grid（`--sp-*`）、圆角 `--r-*`、阴影最多两层（`--shadow-1/2`）、动效仅 `--dur-1/2` + `--ease` 且尊重 `prefers-reduced-motion`。
- 中文不大写不加字距；muted 蓝/紫不用于小号正文。
- 版本单一来源 `frontend/src/version.ts`；本次 → `V2.8.2` / `RELEASE_DATE = '2026-07-10'`。
- 前端禁外链字体 / 禁引第三方运行时依赖（净化器与编辑器均自研，不加 npm 包）。
- 验证：`bash verify.sh` 全绿（ruff + pytest + 前端 typecheck/vitest/build）。TDD：先补/改测试再改实现。

## 涉及范围

### 5 个页面与字段

| 页面 | 路由 | View 文件 | store prop | 富文本字段 | 行点击导航 |
|---|---|---|---|---|---|
| 重点项目 | /projects/key | `KeyProjectsView.vue` | `key`(默认) | weekProgress, nextPlan | 有 → `/project/{id}` |
| 重点商机 | /opportunities/key | `OpportunityFollowupView.vue` | `oppFollowup` | weekProgress, nextPlan | 无 |
| 风险跟进 | /risk | `RiskFollowupView.vue` | `riskFollowup` | followAction, revConclusion | 无 |
| 临时重点 | /projects/temp | `TempFollowupView.vue` | `temp` | weekProgress, nextPlan | 有 → `/project/{id}` |
| 回款重点 | /payment/key | `PaymentKeyFollowupView.vue` | `paymentKey` | followAction, revConclusion | 有 → `/project/{id}` |

- **不含** `nextRevDate`（risk/payment）：保持现有内联 `el-date-picker` 不变。
- 每字段更新链路（不变）：`store.update(id, field, html)` → POST `/api/{progress|temp-followup|opportunity-followup|risk-followup|payment-key-followup}/update`，body `{projectId|oid|rk, field, content}`。

## 组件与文件结构

### 新增 `frontend/src/lib/richText.ts`（纯函数，可单测，不依赖 Vue/DOM 框架）

两个导出函数：

1. **`sanitizeRichText(html: string): string`** — 严格白名单净化，用于 `v-html` 渲染前。
   - 用 `DOMParser().parseFromString(html, 'text/html')` 解析，递归遍历 body 子节点重建输出。
   - **标签白名单**（其余标签一律"拆解"= 丢标签保留其净化后的子内容）：
     `b`, `strong`, `u`, `i`, `em`, `s`, `strike`, `del`, `br`, `span`, `font`。
   - **属性白名单**：除以下外，**所有属性一律删除**（含所有 `on*` 事件、`class`、`id`、`href`、`src`、`style` 的非 color 部分）：
     - `span`：仅保留 `style` 中的 `color`，且 `color` 值必须匹配 `^#[0-9a-fA-F]{3,8}$` 或 `^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$`；不匹配则丢弃该 style。
     - `font`：仅保留 `color`（同上正则校验），**归一化为** `<span style="color:...">`（输出统一用 span，不输出 font）。
   - 文本节点：保留其文本内容（浏览器解析已解码实体；重建输出时对文本做 HTML 转义，杜绝二次注入）。
   - 结果保证：无 `<script>`/`<style>`/`<iframe>`/`<img>`/事件属性/`javascript:` 等；只可能含上述格式标签。
   - 空/非字符串输入 → 返回 `''`。

2. **`htmlToPlainText(html: string): string`** — 去标签取纯文本，用于 xlsx 导出与（若需要）排序键。
   - `DOMParser` 解析取 `textContent`；把块级/换行语义转为 `\n`（至少 `<br>` → `\n`）；折叠多余空白但保留换行；返回 trim 后的纯文本。
   - 空/非字符串 → `''`。

**XSS 测试向量（必须覆盖）**：`<script>alert(1)</script>`、`<img src=x onerror=alert(1)>`、`<a href="javascript:alert(1)">x</a>`、`<span style="color:red;background:url(x)">`、`<span onclick="x">`、`<b>ok</b>`（保留）、`<span style="color:#f00">红</span>`（保留）、`<font color="#00f">蓝</font>`（→ span 保留）、`<span style="color:expression(1)">`（丢 style）、纯文本 `1 < 2 & 3`（安全转义显示）。

### 新增 `frontend/src/components/RichTextCell.vue`

单元格级富文本组件，替换 5 页 `#cell-{field}` slot 体。

- **Props**：
  - `content: string` — 当前字段原始存储值（可能是旧纯文本或新 HTML）。
  - `editable: boolean` — 是否当前数据模式（false 时纯只读渲染，无编辑入口）。
  - `prefix?: string` — 前缀纯文本（如 `${editTime}：`），空则不显示；空内容且 editable 时显示占位「点击填写」，只读且空显示 `-`。
- **Emits**：`save(html: string)` — 用户点保存时抛出净化前的 innerHTML（父组件调 `store.update`；父负责 await/错误提示）。
- **展示态**：`<span class="rtc-prefix">{{prefix}}</span><span class="rtc-body" v-html="sanitizeRichText(content)"></span>`；`editable` 时整体加 `.editable`（accent 色 + pointer），点击进入编辑态。`.rtc-body { white-space: pre-wrap }`。
- **编辑态**：
  - 一行工具条（6 个自绘按钮，五态齐全）：加粗(B)/下划线(U)/删除线(S)/斜体(I)/字体颜色(A▾ 预设色板)/清除格式。按钮 `@mousedown.prevent` 保住选区；点击执行对应 execCommand。
  - `contenteditable` 编辑框：进入时先 `document.execCommand('styleWithCSS', false, true)`；`innerHTML` 初值 = `sanitizeRichText(content)`。最小高约 4 行、随内容增高、`max-height` 后滚动。
  - 底部 `保存` / `取消`。
  - 键盘：`Esc` = 取消；`Ctrl+Enter` = 保存。
  - `dirty` 追踪（input 事件置脏）：点击组件外部时，未脏则关闭，已脏则保持打开（边框轻提示 `--danger` 或 focus-ring 闪一下）。
- **色板**：固定预设约 7 色，取自令牌语义值：默认文字 `--txt`、红 `--danger`、橙 `--warn`、绿 `--ok`、蓝 `--accent`、紫 `--accent2`、灰 `--mut`。点色块 → `execCommand('foreColor', false, 该色值)`。（落地时把令牌 CSS 变量解析为具体色值传给 execCommand，或维护一份与令牌同源的十六进制表。）
- **样式**：全部引用设计令牌；工具条按钮 hover `--hover-tint`、选中 `--selected-tint`、disabled `--disabled-opacity`、focus 走全局 `:focus-visible`。

### 修改 5 个 View

- 把两处 `#cell-{field}` slot 体换成 `<RichTextCell :content="..." :editable="fp.isCurrent.value" :prefix="editTimePrefix(row, field)" @save="html => activeStore.update(id, field, html)" />`。
- 移除本地 `openEdit`/ProgressEditModal 相关代码与 `<ProgressEditModal>` 引用。
- **排序**：把 `followAction`/`revConclusion` 加入 `columnSort.ts` 的 `NON_SORTABLE_KEYS`（weekProgress/nextPlan 已在内）；确认 risk 页显式 `sortable:true` 处（RiskFollowupView 约 :62-63）与 payment 的 `withSortable` 不再对这两列开启排序。
- **筛选**：从 RiskFollowupView 的 FILTERABLE（约 :88）移除 `revConclusion`。
- **导出**：5 页 `exportRow` 对这些字段用 `htmlToPlainText(content)` 拼时间前缀（去标签），避免 HTML 漏进 Excel。

### 删除

- `frontend/src/components/ProgressEditModal.vue` 及 `frontend/src/components/ProgressEditModal.test.ts`（仅这 5 页 + 该测试使用，迁移后无消费方）。

## 行为变化（用户已确认接受）

1. risk、payment 两页 **失去 followAction/revConclusion 两列的排序**（自由文本排序意义低）。
2. risk 页 **失去按 revConclusion（回顾结论）筛选**。
3. xlsx 导出这些字段为**纯文字无格式**（去标签）。

## 边界与非目标

- 不改后端、不改审计、不改 schema、不改数据管线（升级仅换 dist，无需重启后端、无需点更新数据）。
- 不做图片 / 链接 / 表格 / 字号 / 对齐等富文本能力（YAGNI；仅六项）。
- 不改 `nextRevDate` 日期字段。
- 不做选列/排序持久化（V2.8.3 独立周期）。
- 不引任何第三方 npm 依赖。

## 测试策略

- **`richText.test.ts`**：`sanitizeRichText` 白名单 + 全部 XSS 向量 + 色值正则边界 + font→span 归一化 + 空输入；`htmlToPlainText` 去标签 + `<br>`→换行 + 空输入。
- **`RichTextCell.test.ts`**：只读渲染（净化 v-html + 前缀 + 空占位）、editable 点击进入编辑、保存 emit 净化前 innerHTML、取消不 emit、Esc/Ctrl+Enter、脏态外部点击保持打开、工具条按钮触发 execCommand（可 mock document.execCommand 断言调用）。
- **5 页接入回归**：点击填写进入编辑、保存后展示富文本、历史态只读无编辑器、导出去标签、排序列已禁用、行点击不被编辑器误触发。
- `bash verify.sh` 全绿。

## 验收清单

- [ ] 5 页点击进展格 → 就地出编辑器（无弹窗），可加粗/下划线/删除线/斜体/改色/清除格式。
- [ ] 保存后单元格以富文本样式展示；刷新后样式保留（已落库 HTML）。
- [ ] 历史快照态只读、不出编辑器。
- [ ] 旧纯文本记录展示正常（换行保留、无破版）。
- [ ] 导出 xlsx 中这些字段为纯文字。
- [ ] XSS 向量注入后渲染无脚本执行（净化生效）。
- [ ] 版本号显示 V2.8.2；`ProgressEditModal` 已删除且无残留引用。
- [ ] `bash verify.sh` 全绿。
