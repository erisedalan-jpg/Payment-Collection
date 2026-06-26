# 设计：风险子页面全列展示 + 商机页放开普通管理员写权限（L4 范围内）

> 目标版本：V2.2.2（Z 级——子页面展示 + 页内局部权限调整）。单一版本来源 `frontend/src/version.ts`。
> 两项互相独立，可分别实现、分别验收。本期**无 `preprocess_data.py` 改动**，升级不需点「更新数据」。

## 背景与目标

用户提出两处修改：

1. `/project/:id` 风险子页面：风险明细表当前只展示 43 列里挑选的 13 列，且长文本被省略号截断。改为**全部 43 列都展示，且单元格全文换行（不截断）**。
2. `/opportunities`（商机清单）：普通管理员当前**完全只读**（无编辑/新增按钮）。改为**普通管理员可编辑、可新增商机**。

### 已澄清的口径（用户经 AskUserQuestion 确认）

- **第 1 项**：选「全部 43 列 + 换行」（不是仅当前列换行）。
- **第 2 项**：选「可写，**仅限本人 L4 范围**」——保住 L4 数据隔离。动作集＝**编辑 + 新增**；**删除 / 导入 / 导出 / 批量选择仍为超管专属**。

### 重要：第 2 项逆转了已留档设计（须知悉）

原始设计 `docs/superpowers/specs/2026-06-24-v2-opportunities-board-design.md`（第 10–11 行）明确规定「**普通管理员对商机只读**，不显示新增/删除/导入/导出按钮与行选择框」。**现状代码与该设计完全一致，并非缺陷**。本期是用户作为产品决策方**主动放开**普通管理员写权限。因此必须同步收紧后端 L4 写入校验，否则普通管理员可越权改/建本人 L4 之外的商机（IDOR / L4 隔离回退）。

---

## 第 1 项 — 风险子页面全 43 列 + 换行（前端）

### 现状

- 后端 `pmis.py:204` 的 `riskRecords` 经 `_jsonable_row` **已保留全部 43 列**——数据齐全，纯前端展示取舍。
- `frontend/src/lib/projectPage.ts` 的 `RISK_COLUMNS` 把 43 列裁成 13 列；其中 `风险描述`/`待办任务` 标了 `wrap: true`。
- `frontend/src/views/ProjectDetailView.vue` 第 201–206 行 `riskCols` 映射时**漏把 `wrap` 透传**给 `DataTable`，故标了 `wrap` 的列实际仍被 `show-overflow-tooltip` 截断（这是「换行失效」的根因）。
- `DataTable.vue` 已支持：`:show-overflow-tooltip="!col.wrap"` + `:cell-class-name="col.wrap?'dt-wrap-col':''"` + `.dt-wrap-col{white-space:normal;word-break:break-word}`。即列上带 `wrap:true` 即换行、不截断。

### 变更（仅 `ProjectDetailView.vue` 的 `riskCols` 计算属性）

把 `riskCols` 从「固定映射 RISK_COLUMNS 13 列」改为「**按真实数据全列构建、全列 `wrap:true`**」：

- 以风险记录的全部键（取首行 `riskRows[0]` 的键序，即 xlsx 原始 43 列顺序）为列集合。
- 命中 `RISK_COLUMNS` 的列：沿用其 `label`/`width`/`date`（日期列仍走 `fmtDateCell`）。
- 未命中的其余列：`label` 用原始中文键名、给一个默认宽度（如 160）。
- **所有列统一 `wrap: true`**（全文换行、不截断 = 满足「全量展示 + 数据较多换行」；短值列不受影响）。
- 空数据时 `riskRows.length===0` 仍走既有 `v-else`「无风险记录。」分支，`riskCols` 可为空，无副作用。

实现示意（最终代码以实现为准）：

```ts
const riskCols = computed<DataColumn[]>(() => {
  const rows = riskRows.value
  if (!rows.length) return []
  const known = new Map(RISK_COLUMNS.map((c) => [c.key, c]))
  return Object.keys(rows[0]).map((key) => {
    const c = known.get(key)
    return {
      key,
      label: c?.label ?? key,
      width: c?.width ?? 160,
      wrap: true,
      formatter: c?.date ? (v: unknown) => fmtDateCell(v) : undefined,
    }
  })
})
```

> 注：`id` 等非业务键若存在于行对象，会一并成列。实现时若发现首行含 `id` 之类内部键，按需在键过滤里剔除（仅排除明确的内部键，不改其余）。

### 边界

不改后端/数据层/schema；不改 `RISK_COLUMNS` 常量（仍可被其它消费方使用，本页改为不再受其 13 列裁剪约束）；不改风险汇总 chips。

### 测试

`ProjectDetailView.test.ts`：构造一条含「风险描述」长文本 + 某个不在 13 列内的字段（如 `备注`）的风险记录，断言：风险 Tab 渲染出该额外列表头、长文本单元格挂 `dt-wrap-col`（换行类）、不再被截断。

---

## 第 2 项 — 商机页放开普通管理员写（仅本人 L4）

### 后端 `opportunities.py`

新增一个纯函数（与 `filter_for_account` 的 L4 判定同源，可单测）：

```python
def can_access_l4(l4_value, allowed_l4, is_super) -> bool:
    if is_super:
        return True
    allow = set(allowed_l4 or [])
    if '*' in allow:
        return True
    return _s(l4_value) in allow
```

`apply_create` / `apply_create_with_fields` / `apply_update` / `apply_delete` **签名与逻辑不变**（L4 校验在 server 处理器做，保持领域函数纯净、不引入会话概念）。

### 后端 `server.py`

- **门禁放开**：`_SUPER_ONLY_PATHS` 移除 `'/api/opportunities/create'`、`'/api/opportunities/update'`。**保留** `'/api/opportunities/delete'`、`'/api/opportunities/import'`。移除后这两个端点仍由 `_auth_gate` 强制登录（未登录 401），只是放开到普通管理员。
- **`handle_opportunities_update`** 增 L4 校验：
  - 取 `account, rec = self._session_account_rec()`；`rec` 缺 → 401。
  - 载 store、找 `target`（按 id）；无 → 404（保持现状）。
  - 非超管时：`_opp.can_access_l4(target.get('l4'), rec.get('allowedL4',[]), False)` 为假 → 403（不能改可见范围外的行）；
    且若 `fields` 含 `'l4'`、`_opp.can_access_l4(fields['l4'], rec.allowedL4, False)` 为假 → 403（不能把行移出/移入越权 L4）。
  - 通过后 `apply_update`，余下不变。
- **`handle_opportunities_create`** 增 L4 锁定：
  - 取 `account, rec`；`rec` 缺 → 401。
  - 非超管且 `'*'` 不在 `allowedL4` 时：取 `fields.get('l4')`；若空且 `allowedL4` 恰一项 → 默认填该项；`_opp.can_access_l4(l4, allowedL4, False)` 为假 → 403（普通管理员新增必须落在本人 L4）。
  - 通过后 `apply_create_with_fields`，余下不变。
- `handle_opportunities_delete` / `handle_opportunities_import`：**不动**（仍超管专属）。

### 前端 `frontend/src/views/OpportunitiesView.vue`

当前 210–226 行一个 `v-if="auth.isSuper"` template 块同时罩着 新增/批量删除/导入/导出。需**拆分**：

- 「**新增商机**」按钮：改为**任意登录管理员可见**（移出超管块、单独渲染）。
- 「**编辑**」操作列（293 行 `v-if="auth.isSuper"`）：改为**任意登录管理员可见**。
- 「批量删除」「导入」「导出」「行选择列（256 行）」：**保持** `auth.isSuper`。

### 前端编辑抽屉 `OpportunityEditDrawer.vue`（L4 约束，UX 防 403）

后端已是安全闸；前端再限制 L4 选项以免普通管理员选了越权 L4 触发 403：

- 普通管理员：L4 字段 `options` 限定为本人 `allowedL4`（从 auth store 取）；若恰一项则预填并禁用该字段。
- 超管：保持全 11 项 L4 选项（行为不变）。
- 依赖：auth store 需暴露当前账号 `allowedL4`。实现时先确认 `useAuthStore` 是否已含该字段；若无则补（仅读，登录响应里已有该信息则透传）。

### 测试

- `tests/test_opportunities.py`：
  - `can_access_l4`：超管恒 True；`'*'` 恒 True；普通管理员命中/未命中。
  - update：普通管理员改**本人 L4** 行成功；改**他人 L4** 行被拒（处理器层，断言 403 路径——或对 `can_access_l4` 做单测覆盖该判定）。
  - create：普通管理员落本人 L4 成功；落他人 L4 被拒。
  - 超管 update/create 不受影响。
- 前端 vitest（`OpportunitiesView.test.ts`）：普通管理员（`auth.isSuper=false`）可见「新增商机」按钮与「编辑」操作列；**不可见**导入/导出/批量删除/选择列。超管全可见（回归）。

---

## 版本与发布

- `frontend/src/version.ts` → `V2.2.2`、`RELEASE_DATE = '2026-06-26'`。
- 属 Z 级（子页面展示 + 页内局部权限）。`PROGRESS.md` 增 V2.2.2 条目，注明**逆转 V2.0.0「商机普通管理员只读」设计**。
- 升级部署 `*.py`（含改动的 `opportunities.py`、`server.py`）+ 重建 dist；**无新依赖、不需点「更新数据」、无新增页面/页面访问 key**。打包与升级手册按需在实现后另出。

## 不做（YAGNI）

- 不改风险汇总 chips、不改 `RISK_COLUMNS` 常量本身。
- 不放开商机 删除/导入/导出/批量选择 给普通管理员。
- 不改 `/opportunities/key`（重点商机跟进）既有权限。
- 不为普通管理员引入跨 L4 写能力。
- 不改 `apply_*` 领域函数签名。
