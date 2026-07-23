# 跟进表超管自定义列 — 设计文档

> 日期：2026-07-22
> 状态：设计已确认，待落实现计划
> 版本：Y 级（新增能力，跨 4 张跟进表的「超管自定义列」子系统）；版本号由用户钦定

## 1. 目标

让**超级管理员**为跟进表按需增加「由其他管理员填写」的列。每个自定义列：

- 类型为**文本**（富文本，同现有「本周重点进展」）或**日期选择**（同现有 `/risk` 的「下次rev时间」）；
- 由超管配置**列名**与**归档时是否清空**；
- 值由任意管理员填写（与现有跟进列同权限），只有列的**增删改**是超管专属。

## 2. 范围

覆盖走 `followup_store` 引擎的 **4 张跟进表**：

| 表 | 路由 | store 模块 | 内置可编辑列 | 表级归档行为 |
|---|---|---|---|---|
| 临时重点跟进 | `/projects/temp` | `temp_followup`（多实例） | `weekProgress` / `nextPlan` | 清空 |
| 风险跟进 | `/risk` | `risk_followup` | `followAction` / `revConclusion` / `nextRevDate` | 留存 |
| 回款重点跟进 | `/payment/key` | `payment_key_followup` | `followAction` / `revConclusion` / `nextRevDate` | 留存 |
| 重点商机跟进 | `/opportunities/key` | `opportunity_followup` | `weekProgress` / `nextPlan` | 清空 |

**不在本期范围**：「重点项目进展」（`project_progress`，逻辑内联在 `server.py`、不走 `followup_store`）。留待后续单独接入，届时复用本期的配置模型与前端组件。

## 3. 架构决策

### 3.1 自定义列的值内联存储（承重决策）

自定义列的值**内联进现有跟进 store 记录**：存在每条记录里 `rec[customKey]`，连同 `rec[customKey + 'EditTime']`、`rec[customKey + 'EditBy']`，与内置列 `weekProgress` / `followAction` 完全并排。

理由：`apply_update` / 归档 / 导出（`exportRow` 遍历可见列）/ 选列持久化（`useColumnPrefsDynamic` 动态列集）这套机器**几乎原样复用**；归档快照 `rows` 天然带上自定义列值；新增面最小、无第二份数据源需同步。

被否方案：独立值表（须复刻更新/归档/导出/快照全套，同步风险大）；通用列引擎（过度设计，YAGNI）。

### 3.2 配置与值分离

- **列定义（配置）**：新增 `data/followup_columns.json`，超管可配、改完即时生效、**不进数据管线**（同 `budget_config` 模式）。**按表**存储，temp 多实例共享同一份表级配置。
- **列的值**：内联在各 store `current` 中（见 3.1），temp 各实例各存各的。

## 4. 数据模型

### 4.1 配置文件 `data/followup_columns.json`

```json
{
  "version": 1,
  "tables": {
    "temp":        [ {"key": "cf-a1b2c3d4", "label": "责任人", "type": "text", "clearOnArchive": false} ],
    "risk":        [],
    "payment_key": [],
    "opportunity": []
  }
}
```

列定义字段：

| 字段 | 说明 | 约束 |
|---|---|---|
| `key` | 服务端生成的稳定 id | 格式 `cf-` + 8 位 hex；**改名不换 key** → 已填值不丢；全局生成即唯一 |
| `label` | 显示列名 | strip 后 1..20 字符、非空；**表内不重名**（跨表可重名） |
| `type` | 列类型 | `"text"`（富文本）或 `"date"`（日期选择） |
| `clearOnArchive` | 归档时是否清空该列 | 布尔 |

- 数组顺序 = 列显示顺序（重排 = 移动数组元素）。
- 每表**软上限 8 列**（防表格过宽）；超出时新增被拒并给出提示。
- `key` 前缀 `cf-` 与所有内置字段名不冲突，避免值命名空间碰撞。

### 4.2 值存储

沿用现有形状，无新键结构：`store.current[记录键][customKey] = 内容`，配套 `[customKey]EditTime` / `[customKey]EditBy`。记录键各表原样（temp/paykey/opp 用 projectId/oppId、risk 用 riskKey）。

## 5. 后端设计

### 5.1 新增 `followup_columns.py`（纯逻辑 + 存取）

集中放置：配置的加载/保存、列定义校验、CRUD 纯函数。参照 `budget_config.py` / `followup_store.py` 的薄封装风格。

```python
TABLE_IDS = ('temp', 'risk', 'payment_key', 'opportunity')
COL_TYPES = ('text', 'date')
MAX_COLS_PER_TABLE = 8
LABEL_MAX = 20

def load(path) -> dict            # 读文件；缺失/损坏 → 规范空结构 {version,tables:{每表:[]}}
def save(path, cfg) -> None       # 原子写
def columns_for(cfg, table) -> list[dict]        # 返回该表列定义列表（副本）
def custom_keys(cfg, table) -> set[str]          # 该表所有自定义列 key 集合（喂更新校验）
def add_column(cfg, table, label, type_, clear_on_archive) -> dict   # 生成 key、校验、追加；返回新列
def update_column(cfg, table, key, *, label=None, type_=None, clear_on_archive=None) -> dict  # 改名/类型/清空开关(合并)；改名表内查重、key 不变
def reorder_columns(cfg, table, ordered_keys) -> list               # 按给定 key 顺序重排
def delete_column(cfg, table, key) -> dict                          # 从配置移除；返回被删列（供 server 据此清值）
def clear_field_keys(cfg, table, builtin_fields, table_level_clear) -> set[str]  # 归档待清字段集（见 6.2）
```

校验规则：`table ∈ TABLE_IDS`；`type ∈ COL_TYPES`；`label` strip 后 1..20 且表内不重名；超上限拒绝；未知 `key` 拒绝。非法一律 `ValueError`，`server.py` 转 400。

### 5.2 `followup_store.py` 改动

**更新校验放行自定义 key**（`apply_update`）：现在 `if field not in cfg.progress_fields: raise`。改为接受一个额外允许集参数：

```python
def apply_update(cfg, store, key, field, content, account, now, extra_fields=()):
    if field not in cfg.progress_fields and field not in extra_fields:
        raise ValueError("invalid field: %s" % field)
    ...
```

各域薄封装（`risk_followup.apply_update` 等）透传 `extra_fields`；`server.py` 传入 `followup_columns.custom_keys(cfg, table)`。

**归档改为按字段清除**（`apply_archive`）：现在整体 `store['current'] = {}` 或整体留存。改为接受待清字段集：

```python
def apply_archive(cfg, store, rows, now, clear_fields=None):
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
    if clear_fields is None:
        # 向后兼容：无自定义列时退化为原表级行为
        if cfg.clear_on_archive:
            store['current'] = {}
        return
    for rec in store['current'].values():
        for f in clear_fields:
            rec.pop(f, None); rec.pop(f + 'EditTime', None); rec.pop(f + 'EditBy', None)
    store['current'] = {k: v for k, v in store['current'].items() if v}   # 丢弃清空后为空的记录
```

`clear_fields` 由 `server.py` 用 `followup_columns.clear_field_keys` 算出（见 6.2），含内置字段（按表级 `clear_on_archive`）与各自定义列（按其 `clearOnArchive`）。

> 说明：当某表无自定义列且传 `clear_fields=None` 时，行为与改动前**逐字一致**（回归安全网）。有自定义列时一律走按字段清除分支。

### 5.3 `server.py` 端点与接线

**新增端点**（`/api/followup-columns/*`）：

| 方法 路径 | 权限 | body |
|---|---|---|
| `GET /api/followup-columns` | 任意登录管理员 | — |
| `POST /api/followup-columns/add` | 超管 | `{table,label,type,clearOnArchive}` |
| `POST /api/followup-columns/update` | 超管 | `{table,key,label?,type?,clearOnArchive?}` |
| `POST /api/followup-columns/reorder` | 超管 | `{table,keys:[...]}` |
| `POST /api/followup-columns/delete` | 超管 | `{table,key}` → 删列 + 清值（见下） |

> 端点用**静态路径 + body 传参**（不用 `PATCH /<table>/<key>` 这类带变量路径）：审计 `map_action` 按精确 `(method, path)` 匹配、超管闸 `_SUPER_ONLY_PATHS` 按 path 匹配，静态路径才挂得上；也与既有 `/api/temp-followup/instances/create` 等同范式。

**填写复用现有更新端点**：4 处更新 handler（temp `~1956` / opp `~2142` / risk `~2250` / paykey `~2354`）的 `field not in ..PROGRESS_FIELDS` 校验，改为查 `内置 ∪ followup_columns.custom_keys(cfg, table)`，命中则调 `apply_update(..., extra_fields=custom_keys)`。

**归档 handler**（4 处）：改为传 `clear_fields = clear_field_keys(cfg, table, 表级clear)` 给 `apply_archive`。

**删列清值**（`DELETE` handler）：
1. `delete_column` 从配置移除该列定义；
2. 遍历该表 store 的 `current`，对被删 `key` 执行 `pop(key/EditTime/EditBy)`（temp 遍历**全部实例**的 `current`）；统计影响记录数；
3. **不动** `archives`（历史快照冻结）；
4. 保存两份文件（配置 + store），返回 `{deleted: 列, affectedRows: N}`。

**审计**：列的增/删/改名/改类型/切清空/重排均记 `audit_log`（`_ACTION_MAP` 需加对应条目，否则埋点为死埋点）。**绝不记任何敏感值**（本域无密钥，但遵循既有约定）。

**打包/开发双路径**：本域纯读写 `data/*.json` + 内存逻辑，无子脚本调用，`frozen` 分支无需特判；文件路径沿用既有 `data` 目录解析（`sys.executable` 目录 vs 开发目录），与其它 `*_followup.json` 同源。

## 6. 归档「按列清空」语义

### 6.1 与表级行为的关系

自定义列的 `clearOnArchive` **独立于**表级 `clear_on_archive`，二者叠加决定每个字段归档后是否清空：

| 表级 | 内置列 | 自定义列（clearOnArchive=true） | 自定义列（clearOnArchive=false） |
|---|---|---|---|
| 清空（temp/opp） | 清 | 清 | **留存**（值随记录键留在 current） |
| 留存（risk/paykey） | 留 | **清**（仅清该列） | 留 |

即：留存表里可让某个自定义列每轮归档后清空重填；清空表里可让某个自定义列跨轮留存。归档快照 `rows` 始终冻结全量。

### 6.2 `clear_field_keys(cfg, table, builtin_fields, table_level_clear)` 算法

```
待清集 = {}
若 table_level_clear:  待清集 |= builtin_fields          # 各域模块的 PROGRESS_FIELDS
对该表每个自定义列 c:
    若 c.clearOnArchive:  待清集 |= {c.key}
返回 待清集
```

`server.py` 归档时传入该域的 `builtin_fields`（`_temp.PROGRESS_FIELDS` / `_riskfu.PROGRESS_FIELDS` 等，`server.py` 已 import 各域模块）与表级 `clear_on_archive`，算出 `clear_fields` 交给 `apply_archive`。

## 7. 前端设计

### 7.1 新增/改动清单

| 文件 | 类型 | 职责 |
|---|---|---|
| `lib/followupColumns.ts` | 新增 | 类型定义 + API 客户端（GET 全量、POST/PATCH/DELETE/reorder） |
| `stores/followupColumns.ts` | 新增 | Pinia：加载并缓存 4 表配置，暴露 `columnsFor(table)` |
| `composables/useCustomColumns.ts` | 新增 | 入参 tableId → 产出 `DataColumn[]`（日期列 sortable+filterable+日期格式化；文本列 wrap+富文本）+ `isCustomKey` 判定 + 更新透传 |
| `components/FollowupCustomCell.vue` | 新增 | 按 `type` 派发：文本 → `RichTextCell`，日期 → `el-date-picker`；可编辑态复用 `isCurrent` |
| `components/FollowupColumnConfig.vue` | 新增 | 超管抽屉：列列表 + 增/改名/选类型/切 clearOnArchive/上下移/删（删二次确认、提示影响行数） |
| `views/TempFollowupView.vue`（`/projects/temp`） | 改 | 并入自定义列、加 cell 模板、工具栏加「列设置」按钮 |
| `views/RiskFollowupView.vue`（`/risk`） | 改 | 同上 |
| `views/PaymentKeyFollowupView.vue`（`/payment/key`） | 改 | 同上 |
| `views/OpportunityFollowupView.vue`（`/opportunities/key`） | 改 | 同上 |

`TABLE_ID` 与后端 `TABLE_IDS` 对齐用后端键（`temp` / `risk` / `payment_key` / `opportunity`）；前端各视图已有的 `TABLE_ID` 常量（如 `'risk-followup'`）是选列持久化用的、与此不同，`useCustomColumns` 单独传后端表键。

### 7.2 视图接入模式

各视图统一：

1. `const custom = useCustomColumns(TABLE_ID)`；
2. `ALL_COLUMNS` 在内置跟进列**之后**并入 `custom.columns.value`；
3. 加一段泛型 cell 模板（Vue 动态插槽名）：
   ```vue
   <template v-for="col in custom.columns.value" :key="col.key" #[`cell-${col.key}`]="{ row }">
     <FollowupCustomCell :col="col" :row="row" :editable="fp.isCurrent.value"
       :save="(v) => store.update(rowKey(row), col.key, v)" />
   </template>
   ```
4. 工具栏 `v-if="auth.isSuper"` 加「列设置」按钮 → 打开 `FollowupColumnConfig`；
5. 新增自定义列**默认可见**（并入 `DEFAULT_VISIBLE` 或让动态列默认显示）。

选列持久化、导出、跨表筛选（日期列）因走既有动态列机制**自动纳入**，无需逐视图特判。

### 7.3 文本列 = 富文本

`type: "text"` 用 `RichTextCell`，与「本周重点进展」一致（白名单读写净化、换行 `<br>`）。日期列 `value-format="YYYY-MM-DD"`，与 `nextRevDate` 一致。

## 8. 权限与安全

- 列的增/删/改（`POST/PATCH/DELETE/reorder`）**超管专属**，非超管 403。
- 列值填写沿用现有更新端点权限（登录管理员、`isCurrent` 态可编辑）。
- `data/followup_columns.json` 无敏感数据，但按既有约定纳入 `data/` gitignore 覆盖（确认 `.gitignore` 已覆盖 `data/*.json`）。
- 前端 `FollowupCustomCell` 文本走 `RichTextCell` 既有净化，杜绝存储型 XSS。

## 9. 测试

**后端 pytest**（新增 `tests/test_followup_columns.py` + 扩充 `test_followup_store.py`）：

- 配置校验：未知 table/type 拒绝；label 空/超 20/表内重名拒绝；超 8 列拒绝。
- `add/rename/update/reorder/delete` 纯函数行为；改名后 key 不变。
- `clear_field_keys`：四象限（表级清/留 × 自定义清/留）字段集正确。
- `apply_archive(clear_fields=...)`：按字段清除、清空记录被丢弃、`clear_fields=None` 退化为原行为（回归）。
- `apply_update(extra_fields=...)`：自定义 key 放行、未配 key 仍拒。
- 删列清值：current（temp 全实例）对应 key 被清、archives 不动、影响行数正确。

**前端 vitest**：

- `useCustomColumns`：文本/日期列的 `DataColumn` 形状（sortable/filterable/formatter）正确。
- `FollowupColumnConfig`：增/删（二次确认）/改名/切开关/重排交互。
- `FollowupCustomCell`：type 派发正确、可编辑态受控。

**验证**：`bash verify.sh` 全绿（语法/ruff/pytest/typecheck/vitest/build）。

## 10. 升级影响

- **非纯前端**：改 `followup_store.py` / 各 `*_followup.py` / `server.py`，新增 `followup_columns.py` + 前端若干；升级需覆盖后端 + 换 dist + 重启。
- **无需点「更新数据」**（本域不进数据管线）。
- **向后兼容**：`followup_columns.json` 缺失 → 视作各表空列表 → 行为与升级前逐字一致；未配自定义列的表归档走退化分支。既有跟进数据不受影响。

## 11. 已知边界（非缺陷）

- temp 多实例共享表级列配置（不支持「某实例独有列」）—— 符合「列是表的属性」直觉，YAGNI。
- 自定义列不参与「更新数据」后的重挂逻辑；其值按记录键留在 current，重挂行为与内置跟进列一致。
- 每表 8 列软上限；确有更多需求再调常量。
- 「重点项目进展」本期不含（独立代码路径）。

## 12. 未来可选（本期不做）

- 数值/下拉（枚举）列类型。
- 「重点项目进展」接入同一模型。
- 列级只读/按账号可见（与账号权限细粒度体系正交）。
