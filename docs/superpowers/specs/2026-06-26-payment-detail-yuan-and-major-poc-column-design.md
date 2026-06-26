# 设计：回款明细改「元」+ 商机「是否重大POC」列

> 版本目标：V2.2.1（Z 级——子页面/页内局部调整）。单一版本来源 `frontend/src/version.ts`。
> 三块互相独立，可分别实现、分别验收。本期**无 `preprocess_data.py` 改动**，升级不需点「更新数据」。

## 背景与目标

用户提出三处修改：

1. `/project/:id` 回款子页面的回款明细表，金额列当前以「万元」展示（`÷10000` 后保留 2 位小数四舍五入），导致部分数据精度丢失；改为以原始「元」展示。
2. `/opportunities`（商机清单）新增一列「是否重大POC」（是/否 下拉），位于「预估落单时间」之后、「实际中标状态」之前，并放入默认显示列。
3. `/opportunities/key`（重点商机跟进）随第 2 项的新列同步生效：该列可作为范围筛选条件、可作为可选显示列。

### 已澄清的口径（用户确认）

- **第 1 项范围**：仅明细表的三列（计划回款 / 已收 / 未收）由「万」→「元」。`账期(天)`（`termDays`，天数非金额）保持不变；回款 Tab 顶部汇总卡片（合同总额 / 流水累计 / 计划回款，均为万元）保持不变。
- **第 3 项默认列**：「是否重大POC」**不**进 `/opportunities/key` 的默认显示列；仅作为可选列（列选择器可勾选）和范围筛选字段存在——这两者由现有派生逻辑自动生效，无需为之新增代码。

## 第 1 项 — `/project/:id` 回款明细表改用「元」

### 现状

`frontend/src/views/ProjectDetailView.vue` 中 `PMIS_NODE_COLS`（约 111–124 行）定义回款 Tab 的「回款节点明细」表列：

```ts
{ key: 'expectedPayment', label: '计划回款(万)', formatter: (v) => fmtWan(v as number) },
{ key: 'receivedAmount',  label: '已收(万)',     formatter: (v) => fmtWan(v as number) },
{ key: 'unpaidAmount',    label: '未收(万)',     formatter: (v) => fmtWan(v as number) },
{ key: 'termDays',        label: '账期(天)',     formatter: (v) => (v == null ? '-' : String(v)) },
```

`fmtWan(yuan)` = `Number(yuan / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })`，是精度丢失根因。
`fmtYuan(n)` = `Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })`，直接展示原始元值（整数元精确）。
`expectedPayment` / `receivedAmount` / `unpaidAmount` 底层均为原始「元」数值（见 `lib/paymentPmis.ts` 的 `PayNodeRow`，取自 `PaymentNodePmis.expectedPayment/receivedAmount/unpaidAmount`）。
`fmtYuan` 已在本文件 `import` 中（第 8 行 `import { fmtWan, fmtRatio, fmtYuan } from '@/lib/format'`），无需新增 import。

### 变更

仅改 `PMIS_NODE_COLS` 三列的 `label` 与 `formatter`：

```ts
{ key: 'expectedPayment', label: '计划回款(元)', formatter: (v) => fmtYuan(v as number) },
{ key: 'receivedAmount',  label: '已收(元)',     formatter: (v) => fmtYuan(v as number) },
{ key: 'unpaidAmount',    label: '未收(元)',     formatter: (v) => fmtYuan(v as number) },
```

`termDays` 行保持不变；顶部 `pmisPaySummary` 汇总卡片保持不变。

### 一致性参照

`frontend/src/components/LedgerTable.vue`（`/payment` 台账下钻节点明细）已用「已收(元) / 未收(元)」+ `fmtYuan`。本次改动使 `/project/:id` 与 `/payment` 下钻口径一致。

### 边界

不改任何后端、数据层、schema；不改 `/payment/*`（回款看板各页）的其它表；不改顶部汇总卡片。

## 第 2 项 — `/opportunities` 新增「是否重大POC」列

### 后端 `opportunities.py`

- `FIELDS` 元组追加 `'majorPoc'`（置于 `'opportunityLevel'` 之后，字段数 23 → 24）；同步把文件顶部注释「23 个可编辑业务字段」改为「24 个」。
- `HEADER_TO_FIELD` 追加一项：`'是否重大POC': 'majorPoc'`。
- `new_row` / `apply_create` / `apply_update` / `apply_create_with_fields` / `read_opportunities_xlsx` 均按 `FIELDS` 循环 + 白名单处理，新增字段自动覆盖，无需改函数体。`majorPoc` 非日期非金额，走默认 `_s()`（字符串）分支，正确。

字段 key 命名：`majorPoc`（沿用既有驼峰风格，与 `keyOpp` / `opportunityLevel` 同构；全仓无同名键冲突）。

### 前端 `frontend/src/lib/opportunityColumns.ts`

- 复用已有常量 `const YN = ['是','否']`。
- 在 `OPP_COLUMNS` 中 `expectedDate`（预估落单时间）项**之后**、`productCategory` 之前插入：

```ts
{ key: 'majorPoc', label: '是否重大POC', type: 'select', options: YN, width: 120, filterable: true },
```

- `DEFAULT_VISIBLE` 数组在 `'expectedDate'` 之后插入 `'majorPoc'`，即：
  `[..., 'amountWan', 'opportunityLevel', 'expectedDate', 'majorPoc', 'bidStatus', 'lastUpdate', 'recentUpdate']`
  （落在 预估落单时间 与 实际中标状态 之间，满足「落单时间后、中标状态前」。）
- `OPP_FIELDS`（过滤掉 auto/derived 后取 key）与 `FILTERABLE`（取 `filterable:true`）均自动派生，无需改。

### 位置说明

在完整列数组 `OPP_COLUMNS` 中，「预估落单时间」与「实际中标状态」之间原本隔着 9 列（产品大类…中标日期等）；新列紧跟「预估落单时间」之后插入，既满足「落单时间后」（紧邻其后），也满足「中标状态前」（排在中标状态之前）。在默认显示视图中，「预估落单时间」与「实际中标状态」相邻，新列恰好落在二者之间。此与「商机级别」列「紧跟其前序锚点之后插入」的既有做法一致。

### 编辑抽屉

`/opportunities` 的编辑抽屉按列的 `type`/`options` 渲染表单控件，`type:'select'+options:YN` 自动渲染为下拉（与「商机级别」P1–P4 同款，已在 V2.2.0 验证可用），无需改抽屉代码。

### 数据兼容

存量商机无 `majorPoc` 值 → 前端显示 `-`，后端读取缺省为 `''`，无迁移、无副作用。可在该页超管编辑选填，或在 `input/opportunities.xlsx` 增列后重导入（整表替换）。

## 第 3 项 — `/opportunities/key` 随新列自动生效

### 现状（派生关系）

`frontend/src/views/OpportunityFollowupView.vue`：

- `import { OPP_SCOPE_CATALOG, opportunityMatches } from '@/lib/opportunityScope'`，而 `OPP_SCOPE_CATALOG = OPP_COLUMNS.map(...)` 派生自 `OPP_COLUMNS`（见 `lib/opportunityScope.ts`）。
- `const ALL_COLUMNS: DataColumn[] = [...OPP_COLUMNS.map(oppToDataColumn), ...FOLLOWUP_COLUMNS]`，全列也派生自 `OPP_COLUMNS`。

因此第 2 项给 `OPP_COLUMNS` 加列后：

- 「是否重大POC」自动出现在范围设置（ScopeBuilder）的可选字段目录中（`type:'select'` → kind `enum` → 可按值筛选），满足「增加筛选条件」。
- 「是否重大POC」自动出现在列选择器可勾选列表中，满足「增加展示内容」。

### 变更

**无代码变更**。按用户确认，`DEFAULT_VISIBLE`（该页默认 11 列）保持不变，不加入「是否重大POC」。

## 测试

- `frontend/src/lib/opportunityColumns.test.ts`：若断言了 `OPP_COLUMNS` 列数、`DEFAULT_VISIBLE` 内容或顺序，更新期望（新增 `majorPoc`）。新增/补充：断言 `majorPoc` 列存在、`type:'select'`、`options=['是','否']`、位于 `expectedDate` 与 `bidStatus`/`productCategory` 之间，且在 `DEFAULT_VISIBLE` 中。
- `tests/test_opportunities.py`：补断言——`HEADER_TO_FIELD['是否重大POC']=='majorPoc'`、`'majorPoc' in FIELDS`、`read_opportunities_xlsx` 能把「是否重大POC」列读入 `majorPoc`、`apply_update` 能写 `majorPoc`。
- `frontend/src/lib/opportunityScope.test.ts` / `frontend/src/views/OpportunityFollowupView.test.ts`：若断言了 `OPP_SCOPE_CATALOG` 长度或可选列总数，更新期望（+1）。
- `/project/:id` 改动若有对应视图测试（断言列 label/formatter），更新为「元」期望；若无则手动冒烟。
- 收尾跑 `bash verify.sh`（语法 + ruff + pytest + 前端 typecheck/vitest/build 全绿）。

## 版本与发布

- `frontend/src/version.ts` → `V2.2.1`。
- 属 Z 级局部调整。`PROGRESS.md` 增 V2.2.1 条目。
- 升级时部署 `*.py`（含改动的 `opportunities.py`）+ 重建 dist；**无新依赖、不需点「更新数据」**。打包与升级手册按需在实现后另出（本 spec 不含发布物料）。

## 不做（YAGNI）

- 不动 `/payment/*` 看板各页、不动顶部汇总卡片单位。
- 不改 `账期(天)`。
- 不为「是否重大POC」做历史数据迁移。
- 不把「是否重大POC」加入 `/opportunities/key` 默认列。
