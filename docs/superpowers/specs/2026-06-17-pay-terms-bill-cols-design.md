# 详情页消费两列新数据：收款条件 + 票据信息 设计

> 2026-06-17 立项。源起：用户重新调整 `input/` 下 5 个 CSV 的导出列。
> 经精读 + 全管线实跑证实：5 个文件代码引用的列名/语义**一个没变**，列调整全是追加式，
> 解析不会断、schema 校验通过、产物正确重生成（详见本节"背景"）。本设计仅消费两组
> 新可用列，属详情页子页面内局部增列。

## 背景与现状（已证实）

- 5 个文件（collection_stages / payment_records / budget_data / profit_loss_direct / profit_loss_bridge）
  代码引用列全部仍在，无重命名/删除；新增列均为追加且当前未消费。
- `collection_stages.csv` 扩容：1172 行/575 项目 → 1443 行/718 项目（86 缺口的导出端补全在起效）。
- 时区不变量保持：2229 个 epoch 中 2215 落东八区零点、0 落 UTC 零点 → `UTC+8` 转换正确。
- `关联日期 → termDays` 经证实是账期天数（非多态），解析正确，**不改**。
- 全管线实跑：系统核心口径回款回填 631 项目（收款阶段 718），schema 校验通过。

本设计要消费的两组新列：

| 列 | 出处文件 | 非空行 | 形态 |
|---|---|---|---|
| `收款条件` | collection_stages.csv | 193 | 逐阶段自由文本，可能较长 |
| `票据_调整类型` / `票据_到期日期` / `票据_互抵协议号` | payment_records.csv | 6 / 9 / 16 | 极稀疏，承兑/背书票据信息 |

## 目标

- 详情页「回款」tab 的阶段表新增「收款条件」列，全文换行显示。
- 详情页「流水」tab 的明细表新增单列「票据」，仅带票据信息的行显示。
- 不破坏既有表格密度规范；不动其它 4 个文件的解析；不进导出。

## 范围

**做**：collection_stages.py / profit.py 各加字段；schema 两类各加字段；重生成 TS 类型；
ProjectDetailView.vue 两表各增一列；DataTable.vue 加按列换行开关；配套测试；版本 V1.6.3。

**不做**：
- `调整原因` 列（'1'/'.'/'。' 噪声）不消费。
- `备注(note)` / `订单号(orderNo)` 本轮不补展示（已解析进 schema 但保持窄范围）。
- 收款条件/票据不进 `projectExport`（详情页明细，非导出口径）。
- 其它 4 个文件的解析逻辑不动（已证实对齐）。

## 文件结构与职责

| 文件 | 改动 |
|---|---|
| `collection_stages.py` | `_row_to_node` 增 `payTerm` 字段 |
| `profit.py` | `load_payment_records` 每条记录增 `billType/billDueDate/billProtocol` |
| `schema.py` | `PaymentNodePmis` 增 `payTerm`；`PaymentRecord` 增三个 bill 字段 |
| `frontend/src/types/analysis.ts` | `npm run gen:types` 重生成（不手改） |
| `frontend/src/components/DataTable.vue` | `DataColumn` 增 `wrap?: boolean`；按列控制 `show-overflow-tooltip` 与换行样式 |
| `frontend/src/views/ProjectDetailView.vue` | `PMIS_NODE_COLS` 增收款条件列；`PAYREC_COLS` 增票据列 |
| 对应测试文件 | 见"测试" |

## 数据模型（扁平字段，向后兼容默认值）

### 后端解析

`collection_stages.py` `_row_to_node` 返回 dict 增：

```python
"payTerm": (row.get("收款条件") or "").strip(),
```

`profit.py` `load_payment_records` 的 `rec` 增：

```python
"billType": str(r.get("票据_调整类型") or "").strip(),
"billDueDate": str(r.get("票据_到期日期") or "").strip()[:10],
"billProtocol": str(r.get("票据_互抵协议号") or "").strip(),
```

### schema（`schema.py`）

`PaymentNodePmis` 增（置于 `termDays` 后、`reached` 前）：

```python
payTerm: str = ""
```

`PaymentRecord` 增（置于 `note` 后）：

```python
billType: str = ""
billDueDate: str = ""
billProtocol: str = ""
```

均带默认空串，旧产物/旧测试 fixture 不受影响。改后运行 `cd frontend && npm run gen:types`。

## UI

### 回款 tab —— 收款条件列（换行全显）

`PMIS_NODE_COLS` 在 `termDays`（账期(天)）后、`status`（状态）前插入：

```ts
{ key: 'payTerm', label: '收款条件', width: 240, wrap: true,
  formatter: (v) => (v ? String(v) : '-') },
```

依赖 DataTable 的 `wrap` 支持：该列关闭 `show-overflow-tooltip` 并允许 `white-space: normal` 换行；
固定列宽 240 让长文本在本列内换行而非撑满整表。

### 流水 tab —— 票据列（有才显示）

`PAYREC_COLS` 末尾追加：

```ts
{ key: 'bill', label: '票据', width: 150, formatter: (_v, r) => fmtBill(r) },
```

其中（定义在 `<script setup>`）：

```ts
function fmtBill(r: Record<string, any>): string {
  const td = [r.billType, r.billDueDate].filter(Boolean).join('·')
  if (td) return td
  if (r.billProtocol) return `互抵:${r.billProtocol}`
  return ''
}
```

规则：`billType`/`billDueDate` 任一有值 → 「类型·到期日」（空段自动省略）；二者皆空但有
`billProtocol` → 「互抵:协议号」（show-overflow-tooltip 看全）；全空 → 空白。覆盖所有带票据行
（含仅有协议号的行）。`bill` 为派生展示键，不在行数据里，靠 formatter 读 `r` 上三个真实字段。

### DataTable 换行开关（`DataTable.vue`）

`DataColumn` 接口增：

```ts
/** 为真时该列不截断、单元格内换行（长文本列用） */
wrap?: boolean
```

`el-table-column` 绑定改为 `:show-overflow-tooltip="!col.wrap"`，并对 wrap 列单元格加
`white-space: normal; word-break: break-word;`（经 cell class 或 `:class`）。
非 wrap 列行为不变（仍 `show-overflow-tooltip` 截断+悬浮）。

## 测试

- `tests/test_collection_stages.py`：新增/扩充用例断言 `_row_to_node` 输出含 `payTerm`，
  取自 `收款条件`，空 → `""`。
- `tests/test_profit.py`：`load_payment_records` 用例断言记录含 `billType/billDueDate/billProtocol`，
  分别取自三个票据列；无票据列的行三者为 `""`；`billDueDate` 截前 10 字符。
- `frontend/src/views/ProjectDetailView.test.ts`：构造一条带票据的流水行 + 一条带长收款条件的阶段行，
  断言「票据」列渲染出 `类型·到期日`（或「互抵:协议号」兜底），「收款条件」列渲染出全文。
- `frontend/src/components/DataTable.test.ts`（已存在，追加用例）：断言 `wrap:true` 列
  不挂 `show-overflow-tooltip`、`wrap:false` 列仍挂。

## 版本与进度

- 版本单一来源 `frontend/src/version.ts` → **V1.6.3**，RELEASE_DATE `2026-06-17`（Z 级：子页面内局部增列）。
- `PROGRESS.md` 记一条：详情页消费 collection_stages.收款条件 + payment_records.票据_* 两列。

## 验证（声称完成前必跑）

```bash
bash verify.sh   # python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿
```

附加：实跑一次 `python preprocess_data.py` 确认产物含新字段且 schema 通过（数据层证据）。

## 取舍记录

- 票据数据模型选**扁平字段**而非嵌套对象/后端预拼串：与现有 `currency/rate` 同构、面积最小、
  表现归前端，符合全站口径。
- 收款条件选**按列 wrap 开关**（DataTable 小增强）而非视图内插槽：可复用、换行样式集中在组件。
- 票据 formatter 对"仅有协议号"行兜底显示「互抵:协议号」，确保"有才显示"覆盖全部带票据行。
