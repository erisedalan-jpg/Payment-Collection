# V2.8.4 跟进列宽×2 + /risk 行下钻 — 设计文档

> 日期：2026-07-10　版本：V2.8.4（Z 级，纯前端）

## 目标

两处小改：①5 个跟进页的「点击填写」富文本列宽度翻倍（240 → 480）；②`/risk`（风险跟进）支持点击行下钻到该风险对应项目的 `/project/:id`。

## 架构概述

纯前端，后端 / 审计 / schema / 数据管线零改动。升级仅换 dist、无需重启后端、无需点「更新数据」。

## Global Constraints（每个任务都隐含）

- 交流语言简体中文；**不使用任何 emoji**（符号仅 `→ ↓ ❌ ✕ ▾ ⚠`）。
- 只引设计令牌、不手写散值（本次列宽是既有 `width` 数值属性、非设计令牌范畴）；不引框架/第三方依赖。
- 版本单一来源 `frontend/src/version.ts` → `V2.8.4` / `RELEASE_DATE='2026-07-10'`。
- 后端零改动；升级仅换 dist。
- TDD：改动 2 先补测试再改实现。收尾 `bash verify.sh` 全绿。
- commit 结尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

## 改动 1 · 富文本列宽 240 → 480

把以下 10 处列定义的 `width: 240` 改为 `width: 480`（`wrap: true` 等其余属性不变）：

| 视图 | 列 key | 行 |
|---|---|---|
| `views/KeyProjectsView.vue` | `weekProgress` | 69 |
| `views/KeyProjectsView.vue` | `nextPlan` | 70 |
| `views/TempFollowupView.vue` | `weekProgress` | 74 |
| `views/TempFollowupView.vue` | `nextPlan` | 75 |
| `views/OpportunityFollowupView.vue` | `weekProgress` | 54 |
| `views/OpportunityFollowupView.vue` | `nextPlan` | 55 |
| `views/RiskFollowupView.vue` | `followAction` | 65 |
| `views/RiskFollowupView.vue` | `revConclusion` | 66 |
| `views/PaymentKeyFollowupView.vue` | `followAction` | 83 |
| `views/PaymentKeyFollowupView.vue` | `revConclusion` | 84 |

- 横向滚动本就存在（`.kp-scroll`/成本页各自 `overflow-x: auto`），列变宽不破版。
- 行号为定位提示，以「该列 key + `width: 240`」为锚点匹配。

## 改动 2 · /risk 行点击下钻 `/project/:id`

`views/RiskFollowupView.vue`：

- 新增 `import { useRouter } from 'vue-router'` + `const router = useRouter()`。
- 新增 `function onRow(row: Record<string, any>) { router.push('/project/' + (row as RiskRow).projectId) }`（`RiskRow.projectId` 见 `lib/riskRows.ts:15,42`，主域权威项目号）。
- 该页 DataTable 起始标签加 `clickable` + `@row-click="onRow"`（与 KeyProjects/Temp/Payment 三页同款）。
- **可编辑单元格不误跳转**：followAction/revConclusion 走 `RichTextCell`（display 态 `@click.stop`）、nextRevDate 走 `el-date-picker`（模板 `@click.stop`），点击进入编辑不冒泡到行点击——沿用现有机制，无需新增拦截。

## 测试策略

- **改动 2**：`views/RiskFollowupView.test.ts` 加一条用例——mount 后点击某行（`.el-table__row`），断言 `router.push` 被以 `'/project/{projectId}'` 调用（仿 `KeyProjectsView.test.ts` 的「点行跳项目详情」用例）。
- **改动 1**：纯宽度、无行为变化，不加测试。
- 相关视图现有测试仍绿；`bash verify.sh` 全绿。

## 边界与非目标

- 不改后端 / schema / 数据管线 / 审计。
- 不动其它列宽、不动其它页行为。
- 不改富文本编辑逻辑本身（仅承载它的列变宽）。

## 验收清单

- [ ] 5 页的两个「点击填写」列明显变宽（约为原 2 倍）、内容仍换行不截断。
- [ ] /risk 点击行（非点进可编辑单元格）跳转到该风险项目的 `/project/:id`。
- [ ] /risk 点击 followAction/revConclusion 单元格进入富文本编辑、点 nextRevDate 选日期，均**不触发**行跳转。
- [ ] 版本号 V2.8.4；后端零改动；`bash verify.sh` 全绿。
