# Task 8 Report: RiskFollowupView.vue + 路由/导航/pageKey

## 实现概述

按简报逐步完成，TDD 流程。

### Step 1: pageAccess + nav + router
- `frontend/src/lib/pageAccess.ts`：PageKey 联合追加 `'risk-followup'`
- `frontend/src/nav.ts`：KEY_FOLLOWUP_LINKS 末尾追加 `{ label: '风险跟进', to: '/risk', key: 'risk-followup' }`
- `frontend/src/router/index.ts`：在 temp-followup 路由后追加懒加载路由 `/risk`，name `risk-followup`，meta `{title:'风险跟进', hideFilter:true, pageKey:'risk-followup'}`

### TDD 红阶段（Step 2 & 3）
写测试文件 → 跑红（文件不存在，`Failed to resolve import`）确认 RED。

### 实现 RiskFollowupView.vue（Step 4）
按简报逐字实现，含：
- 动态风险列（`riskCols` computed，按 allRows 全键去重+RISK_COLUMNS 元数据）
- 固定项目列（PROJECT_COLS 8 列）+ 跟进三列（followAction / revConclusion / nextRevDate）
- 16 默认可见列（简报指定清单）
- `hasScope = scope.groups.some(g => g.conditions.length)` → 空范围全量回退
- 文本编辑：ProgressEditModal，store="riskFollowup"，projectId 传 riskKey
- 日期编辑：el-date-picker inline，onDateChange 调 risk.update
- 范围设置 / 归档（留存跟进）/ 导出：`v-if="auth.isSuper"`
- 归档弹窗文案含「归档（留存跟进）」+「保留不清空」
- `doArchive` 调 `risk.archive(...)` store 不清空 current

## TDD 证据

### RED 阶段
```
FAIL src/views/RiskFollowupView.test.ts
Error: Failed to resolve import "./RiskFollowupView.vue" from "src/views/RiskFollowupView.test.ts". Does the file exist?
Test Files  1 failed (1)
      Tests  no tests
```

### GREEN 阶段
```
✓ src/views/RiskFollowupView.test.ts (3 tests) 1979ms
  ✓ 默认展示全部风险(含已关闭),16 默认列含跟进三列 869ms
  ✓ 有范围条件时按风险行过滤 547ms
  ✓ 普通管理员不见范围/归档/导出按钮 561ms
Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Typecheck 结果

```
> vue-tsc --noEmit
(无输出，无新增错误)
```

## 测试与简报的差异

简报的测试代码未包含 ElementPlus 插件和 flushPromises，导致 `el-table-column` 的 `#default="scope"` 插槽在 jsdom 中 `scope` 为 undefined 而崩溃。已按仓库既有模式（参照 TempFollowupView.test.ts / OpportunityFollowupView.test.ts）补充：
- `import ElementPlus from 'element-plus'` + `flushPromises`
- `vi.mock('@/lib/riskFollowupApi', ...)` 防止 onMounted 调用真实 API
- mount 时传 `{ global: { plugins: [ElementPlus] } }`
- 测试函数改为 async + await flushPromises()

**所有断言与简报完全一致**，仅 mount 基础设施调整。

## 改动文件

| 文件 | 操作 |
|---|---|
| `frontend/src/lib/pageAccess.ts` | 修改：PageKey 追加 'risk-followup' |
| `frontend/src/nav.ts` | 修改：KEY_FOLLOWUP_LINKS 追加风险跟进条目 |
| `frontend/src/router/index.ts` | 修改：懒加载路由 /risk |
| `frontend/src/views/RiskFollowupView.vue` | 新建：主视图（按简报逐字） |
| `frontend/src/views/RiskFollowupView.test.ts` | 新建：3 条测试（断言与简报一致，基础设施补 ElementPlus） |

## 提交

`fbb722c` feat(risk-followup): 新页/risk(全列+换行+跟进三字段+范围设置+归档留存)+路由/导航/pageKey

## 自审

- hasScope 判断使用 `groups.some(g => g.conditions.length)` 与简报一致
- 归档弹窗文案含「归档（留存跟进）」+「保留不清空」，符合约束
- archive 调用 `risk.archive(...)` 不清空 current，符合 store 设计（注释可证）
- 权限控制：范围/归档/导出 v-if="auth.isSuper"；跟进字段编辑无权限门槛（任意登录用户可写）
- 无 emoji，无后端/preprocess/schema 改动
- 设计令牌：样式全部用 CSS 变量（--sp-*/--fs-*/--r-*/--card2/--accent/--line/--txt/--sub/--mut），无散值

## 疑虑

无。依赖（Task 5/6/7 产物）均已存在，接口与简报一致，运行正常。

## Fix: sortable + progCell

### 修复说明

针对代码评审发现的两处问题，修改 `frontend/src/views/RiskFollowupView.vue`：

1. **FOLLOW_COLS 缺 sortable**（Spec ❌，必修）：`followAction` 和 `revConclusion` 两列补加 `sortable: true`，与全局「全列 sortable」约束对齐。

2. **progCell undefined 前缀**（Minor 正确性）：当文本内容有值但 `editTime` 为 undefined 时，原代码输出 `undefined：内容`。将返回行改为 `t ? \`${t}：${c}\` : \`${c}\``，缺失 editTime 时只输出内容本身。

### vitest 输出

```
 RUN  v2.1.9

 ✓ src/views/RiskFollowupView.test.ts (3 tests) 1871ms
   ✓ RiskFollowupView > 默认展示全部风险(含已关闭),16 默认列含跟进三列 834ms
   ✓ RiskFollowupView > 有范围条件时按风险行过滤 490ms
   ✓ RiskFollowupView > 普通管理员不见范围/归档/导出按钮 545ms

 Test Files  1 passed (1)
       Tests  3 passed (3)
    Duration  5.56s
```

### typecheck 输出

```
> vue-tsc --noEmit
(无输出，无新增错误)
```
