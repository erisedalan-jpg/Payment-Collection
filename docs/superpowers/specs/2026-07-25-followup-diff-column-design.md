# 跟进表「时间差计算」列（B 期）设计

> 本期 = 用户需求 2.3，A→C→B 三期的最后一期。A 期（项目域字段扩散）随 V4.4.4 交付，
> C 期（倚天饱和度口径）随 V4.4.5 交付。
>
> 版本：**建议 V4.4.6（Z 级）**，最终由用户拍板。**纯配置类功能，不进数据管线、无需点「更新数据」。**

## 1. 目标

给 V4.4.0 建立的「跟进表超管自定义列」引擎增加**第三种列类型 `diff`**：计算
「**指定日期 − 指定列**」的天数差。

- 作用于 `temp` / `risk` / `payment_key` / `opportunity` 四张表（即 `followup_columns.TABLE_IDS`，
  与自定义列同一套引擎；「重点项目进展」`/projects/key` 是独立代码路径，**不含**）。
- **指定日期**（anchor）三选一：当前日期 / 某个固定日期 / 另一个日期列。
- **指定列**（target）：该表的任一日期列。
- 超管配置一次，全表生效；单位**天**；正数表示 anchor 更晚。

## 2. 核心差异：`diff` 是派生列，不是存储列

`text`/`date` 的值存在各 store 的 `current[记录键][customKey]` 里、由管理员填写；
**`diff` 没有值可存**，每次渲染按行数据算。这一条差异派生出本期几乎全部设计：

| | `text` / `date` | `diff` |
|---|---|---|
| 值来源 | 从 `current` 读 | 按行数据现算 |
| `apply_update` 放行 | 走 `extra_fields` | **必须拒绝**（§3.2） |
| `clearOnArchive` | 超管可配 | 无意义，恒 `false`，配置界面不显示该勾选 |
| `EditTime` / `EditBy` | 有 | 无 |
| 列筛选 | `date` 进 `FILTERABLE` | 数字列，**不进** |
| 归档快照 | 值随 `current` 存档 | 不入档（§6） |

## 3. 后端

### 3.1 `followup_columns.py` 扩类型

```python
COL_TYPES = ('text', 'date', 'diff')
ANCHOR_KINDS = ('today', 'fixed', 'column')
```

`diff` 列多带一个 `diff` 配置对象：

```jsonc
{
  "key": "cf-a1b2c3d4",
  "label": "立项至今天数",
  "type": "diff",
  "clearOnArchive": false,          // 恒 false
  "diff": {
    "anchor": { "kind": "today" },  // 或 {"kind":"fixed","date":"2026-12-31"} / {"kind":"column","key":"nextRevDate"}
    "target": "setupDate"           // 指定列的 key
  }
}
```

校验规则（`add_column` / `update_column` 均适用）：

- `type == 'diff'` 时 `diff` 必填；`anchor.kind` 必须在 `ANCHOR_KINDS` 内；`target` 必须是非空字符串。
- `kind == 'fixed'` 时 `date` 必须匹配 `^\d{4}-\d{2}-\d{2}$`；`kind == 'column'` 时 `key` 必须非空。
- `type != 'diff'` 时忽略并丢弃传入的 `diff`（防止改类型后留下孤儿配置）。
- `clearOnArchive` 对 `diff` 强制落 `False`，不接受前端传值。
- **不校验 `target` / `anchor.key` 指向的列是否存在**——后端不认识前端的列模型，
  且列可能来自 PMIS 数据（`立项日期`）。引用失效在前端表现为显示 `-`（§5）。

`_normalize` 同步：`diff` 类型的条目须保留 `diff` 子对象并做同样的形状校验，
形状不合法则**丢弃该列**（与现有「不合法条目直接跳过」的策略一致）。

### 3.2 安全边界：`diff` 列的 key 绝不能进 `extra_fields`

`custom_keys(cfg, table)`（`followup_columns.py:57`）返回该表**全部**自定义列 key，
四处 `apply_update` 用它作 `extra_fields` 放行写入（`server.py:1985/2178/2293/2404`）。
`diff` 类型一旦加入，计算列的 key 就会被放行 → **普通管理员可以往计算列 POST 值**，
之后该行同时存在「存储值」与「计算值」，且存储值会在 decorate 时胜出，产生无法解释的脏数据。

**修法**：新增 `writable_keys(cfg, table)`，只返回 `type in ('text','date')` 的 key；
`server.py` 四处 `_extra = followup_columns.custom_keys(...)` 改为 `writable_keys(...)`。
`custom_keys` 语义**保持不变**（仍返回全部 key），其现有测试断言不受影响。

`clear_field_keys`（`:115`）已按 `c.get("clearOnArchive")` 过滤，而 `diff` 列恒 `False`，
天然不会进；但仍**显式跳过 `type == 'diff'`**，以防有人手改 JSON 把它设成 `true`。

### 3.3 端点不变

复用现有 `/api/followup-columns/{add,update,reorder,delete}` 四个静态路径与
`_SUPER_ONLY_PATHS` 超管闸，只是请求体多带 `diff` 字段。**不新增端点、不新增
`data/*.json` 文件**（复用 `data/followup_columns.json`，已 gitignore）。

`delete_column` 对 `diff` 列照常工作：它在 `current` 里没有值，清值遍历得 `affectedRows = 0`。

## 4. 前端

### 4.1 纯计算函数（可单测，与渲染解耦）

新增 `frontend/src/lib/diffColumn.ts`：

```ts
export type DiffAnchor =
  | { kind: 'today' }
  | { kind: 'fixed'; date: string }      // 'YYYY-MM-DD'
  | { kind: 'column'; key: string }
export interface DiffConfig {
  anchor: DiffAnchor
  target: string                          // 指定列的 key
}

/** 取行上某 key 的日期值并规整为 'YYYY-MM-DD';非日期/空 → null。 */
export function pickDate(row: Record<string, any>, key: string): string | null

/** 计算 anchor − target 的天数差;任一端取不到 → null。 */
export function computeDiffDays(
  row: Record<string, any>, cfg: DiffConfig, today: string,
): number | null
```

`DiffConfig` 同步加进 `frontend/src/lib/followupColumns.ts` 的 `CustomColumn`：
`type: 'text' | 'date' | 'diff'`，并加可选字段 `diff?: DiffConfig`。

- `today` 由调用方传入（**不在函数内取当前时间**，否则无法测试、且同一次渲染内可能跨日不一致）。
- 差值按**自然日**计算：两端各取 `YYYY-MM-DD` 前 10 位、按 UTC 零点解析后相减，避免夏令时/时区偏移导致的 off-by-one（V3.0.0 踩过时区 off-by-one）。

### 4.2 `useCustomColumns` 三处扩展

- `toDataColumn` 加 `diff` 分支：`{ num: true, sortable: true, width: 110, formatter: v => (v == null ? '-' : String(v)) }`。
  **纯数字、不加「天」后缀**——列名已表达含义，加后缀会破坏排序与导出为数值。
- `decorate` 对 `diff` 列**计算**而非从 `current` 取值；`today` 在 `decorate` 内取一次，供本批全部行共用。
- `filterableKeys` 保持只收 `date` 类型（`diff` 是数字列，不进列头筛选）。
- `defaultKeys()` 保持返回**全部**自定义列 key（含 `diff`）——自定义列是超管主动添加的，
  加了就该看得见。这与 A 期「借入的项目域列默认隐藏」是两套不同机制，不要混淆：
  借入列是系统自动扩散的（可能几十个），自定义列是超管一列一列配出来的（上限 8）。

> `decorate` 现有的提前返回 `if (!defs.value.length) return rows` 与 `if (!rec) return r` 需注意：
> 后者会在该行**没有跟进记录时直接跳过**，导致 `diff` 列算不出来。`diff` 不依赖 `current`，
> 必须在 `rec` 缺失时**照样计算**。这是本期最容易漏的一处。

### 4.3 「指定列」候选：两路来源合并，不手工维护清单

```
内置/借入日期列：ALL_COLUMNS.filter(c => isDateKey(c.key))
自定义 date 列：  defs.filter(c => c.type === 'date')
```

`isDateKey`（`lib/cellFormat.ts:4`）已能识别 `setupDate` / `plannedCloseDate` / `nextRevDate` /
`立项日期` / `计划关闭时间` / `识别日期` 等中英文列名，因此 **V4.4.4 借入四页的六个项目域
日期列自动成为候选**，今后再加日期列也自动进——与 A 期建立的扩散机制一致，不搞第二套清单。

`isDateKey` **认不出**自定义列的 `cf-xxxxxxxx` key，故自定义 `date` 列须从 `defs` 单独并入。

### 4.4 配置界面

`FollowupColumnConfig.vue` 新增 prop `:columns="ALL_COLUMNS"`（该表当前列模型），
四个 view 各传一次（`TempInstancePanel.vue`、`RiskFollowupView.vue`、
`PaymentKeyFollowupView.vue`、`OpportunityFollowupView.vue`）。

新建列时类型下拉增加「时间差」；选中后展开两个控件：

- **指定日期**：单选 `当前日期 / 指定日期 / 选择列`；选「指定日期」显示 `el-date-picker`，选「选择列」显示列下拉。
- **指定列**：列下拉（候选同 §4.3）。

已建的 `diff` 列在列表行内**显示其引用关系**（如「今天 − 立项日期」），让超管看得见引用了什么——
这是对「引用列被改名会静默失效」这一已知债的可见性补偿。类型为 `diff` 时不渲染「归档清空」勾选。

## 5. 边界一律显示 `-`，不报错

- `target` 列在行上不存在（列被删/改名）→ `undefined` → `null`
- `target` 或 `anchor` 列值为空串 / 非日期文本 → `null`
- `anchor.kind == 'fixed'` 但日期串损坏 → `null`

**已知债（不在本期解决）**：引用的列 key 若被改名，计算列静默失效（显示 `-`、无告警）。
与 `tempScope.ts:63` 那条「范围条件按 key 序列化、改名即静默失效」同宗，是本仓固有模式。
本期通过 §4.4 的引用关系可见化做部分缓解。

## 6. 归档与历史视图

`diff` 列不入归档快照（它不在 `current` 里，`apply_archive` 自然不会存它）。
查看历史归档时，`diff` 列按**当前**行数据与**当前**日期计算——例如「立项至今天数」在历史
视图里显示的是「到今天」而非「到归档当时」。

取舍：要么历史视图不显示（信息缺失），要么按当前算（语义漂移）。**选后者**，并在升级手册中写明，
避免使用者把它误读为归档时点的快照值。

## 7. 明确不做

- 不改 `/projects/key`（重点项目进展，独立代码路径、不接自定义列引擎）。
- 不新增端点、不新增 `data/*.json`、不动数据管线；**升级无需点「更新数据」**。
- 不改 `custom_keys` 的现有语义（只新增 `writable_keys`）。
- 不做单位切换（只支持天）、不做工作日差（只算自然日）、不做跨表引用。
- `diff` 列与 `text`/`date` **共用每表 8 列上限**（`MAX_COLS_PER_TABLE`），不单开配额。

## 8. 验证

- `bash verify.sh` 全绿。
- 后端 pytest 新增：`diff` 配置校验（合法/各类非法形状）、`writable_keys` 排除 `diff`、
  `_normalize` 丢弃形状损坏的 `diff` 列、`clear_field_keys` 不含 `diff`。
- **安全回归（本期最重要的一条）**：对 `diff` 列的 key 调 `apply_update`（四域各一）
  必须**被拒绝**（`extra_fields` 不含它）。
- 前端 vitest 新增：`computeDiffDays` 三种 anchor × 边界（空值/坏值/引用列不存在）、
  `decorate` 在**无跟进记录**的行上仍算出 `diff` 值（§4.2 的易漏点）。
- 手工冒烟：四张表各建一个 `diff` 列（今天 − 立项日期）→ 值正确、可排序、导出为数字、
  列头无筛选入口；改列名后值不变；删除该列提示影响 0 行；归档后历史视图仍显示该列且按当前日期算。
