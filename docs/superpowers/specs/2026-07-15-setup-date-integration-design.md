# PMIS「立项日期」接入管线 + 多处暴露 —— 设计文档（V3.2.2，Z 级）

> 状态：已与用户 brainstorm 定稿（2026-07-15）。下一步：writing-plans。
> 版本：**V3.2.2**（Z 级 —— 页内局部调整 + 后端新增一个字段）。
> **非纯前端**：改 `pmis.py` + `schema.py`，升级须替换后端 py + 重启后端 + **点「更新数据」**重跑管线。

## 1. 背景与目标

PMIS 原始导出里**已有**「立项日期」字段（`项目基础信息数据.xlsx` 100% 填充、干净 `YYYY-MM-DD`；`项目状态信息数据.xlsx` 亦有；`项目中心.xlsx` 带时分秒），但**从未进入处理管线**——后端零引用、`schema` 无字段、`analysis_data.json` 里「立项」99 次全是项目名/风险描述的偶发文本，无结构化字段。

本次把「立项日期」接入管线并在以下位置暴露：

1. **接入管线**：提取到项目域（`projectPmis[pid].status.立项日期`）。
2. **`/projects`（在建清单）**：新增「立项日期」列，可排序、可列头筛选，**默认不展示**。
3. **`/project/:id`（在建详情）**：在 `.pd-meta` 的「项目编号」行末尾展示立项日期。
4. **`/projects/key`（重点项目清单）**：加「立项日期」列 + 列头筛选（该页**无**范围设置，靠列头筛选，与 `/projects` 同构）。
5. **`/projects/temp`、`/payment/key`、`/risk` 的范围设置（ScopeBuilder）**：补「立项日期」为可筛字段（`kind:'date'`，区间运算符）。

**范围边界（用户 2026-07-15 拍板）**：
- `/projects/key` 没有范围设置 → **加列 + 列头筛选**（非从零搭 ScopeBuilder）。
- **不改已关闭项目**（`/projects/closed` 清单页、已关闭详情页均不动）。

## 2. 架构与数据流

```
项目基础信息数据.xlsx「立项日期」(100%,干净 ISO)  ┐
项目状态信息数据.xlsx「立项日期」(兜底)            ├─ pmis._assemble → projectPmis[pid].status.立项日期
                                                   ┘        │ (schema.PmisStatus 显式声明,gen:types 同源)
                                                            v
                                          data/analysis_data.json  (点「更新数据」后含该字段)
                                                            │
        ┌───────────────────────────────────────────────────┼───────────────────────────────────────┐
        v                                                     v                                       v
  lib/projectList.ts                                   lib/keyProjects.ts                     lib/tempFollowup.ts / riskRows.ts
  ProjectRow.setupDate ← m.status.立项日期             KeyProjectRow.setupDate                 buildScopeInputs.proj.setupDate ← pr.setupDate
        │                                                     │                                 buildRiskRows 行.立项日期 ← pr.setupDate
        v                                                     v                                       v
  ProjectsView 列(默认隐藏,排序,列头筛选)              KeyProjectsView 列 + 列头筛选           FIELD_CATALOG / RISK_SCOPE_CATALOG 加 date 字段
  ProjectDetailView .pd-meta 展示                                                              (ScopeBuilder date 运算符全内建,零改动)
```

**取数口径**：`立项日期` 优先取 `项目基础信息数据`（`base`，100% 填充、干净 ISO），缺再取 `项目状态信息数据`（`status`）。**不取** `项目中心`（带时分秒，脏）。归一化统一 `slice(0,10)` 到 `YYYY-MM-DD`。

## 3. 后端改动（pmis.py + schema.py）

### 3.1 pmis.py `_assemble`（当前 `pmis.py:194-246`）
在 `status` 子块（当前 `pmis.py:216-225`）加一行，与 `项目级别/项目类型` 同位、同 `(b… or s… or None)` 范式：

```python
"status": {
    "项目状态": (b.get("项目状态") or s.get("项目状态") or None),
    ...
    "项目类型": (b.get("项目类型") or s.get("项目类型") or None),
    "立项日期": (b.get("立项日期") or s.get("立项日期") or None),   # ← 新增
    ...
},
```

`b`=项目基础信息索引、`s`=项目状态信息索引（`pmis.py:197-199` 已就绪）。**不做 slice**（原始值即干净 ISO；防脏交给前端 `slice(0,10)`）。

### 3.2 schema.py `PmisStatus`（当前 `schema.py:51-56`）
`PmisStatus(_Base)` 已 `model_config = ConfigDict(extra="allow")`，仍**显式**声明该字段（与 `项目级别/项目类型` 一致，便于 gen:types 产出可选属性）：

```python
class PmisStatus(_Base):
    ...
    项目级别: Optional[str] = None
    项目类型: Optional[str] = None
    立项日期: Optional[str] = None   # ← 新增
    ...
```

### 3.3 类型同源
改完 `schema.py` 运行 `cd frontend && npm run gen:types`，`src/types/analysis.ts` 的 `PmisStatus` 会带 `立项日期?: string | null`。

## 4. 前端改动

### 4.1 `/projects` 列 + 行装配 + 详情

**`lib/projectList.ts`**
- `ProjectRow` 接口（当前 `:8-36`）加：`setupDate: string | null`。
- `buildProjectRows` return 对象（当前 `:66-97`，与 `projectLevel: status.项目级别` 同位）加：
  ```ts
  setupDate: status.立项日期 ?? null,   // 存原始 ISO 串,保证排序正确
  ```
  （`status` 即 `m.status`，`buildProjectRows` 内已解构）

**`views/ProjectsView.vue`**
- `ALL_COLUMNS`（当前 `:48-71`）在 `contractAmount` 后加：
  ```ts
  { key: 'setupDate', label: '立项日期', width: 110, sortable: true,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
  ```
- `DEFAULT_VISIBLE`（当前 `:73`）：**不加** `setupDate` → 默认隐藏、选列器可开。
- `FILTERABLE`（当前 `:74`）：加 `'setupDate'` → 列头出现多选枚举筛选。
  - `setupDate` 以 `Date` 结尾 → `isDateKey`（`lib/cellFormat.ts:4-6`）命中 → `crossFilter.cfFormatValue` 下拉值按日期 `slice(0,10)` 格式化（`crossFilter.ts:12-23`）。
- 排序：`sortable:true` 走 el-table 原生（`usePersistentSort` 已接，`:82,171`）；ISO 串字典序=时间序，无需比较器。**注意**：row 存原始 ISO 串（非展示串），否则排序错乱。

**`views/ProjectDetailView.vue`**
- `.pd-meta`（当前 `:305-315`）「编号」span（`:306`）后紧跟：
  ```html
  <span>立项日期 <b>{{ fmtDateCell(m.status?.立项日期) }}</b></span>
  ```
  `fmtDateCell` 已 import（`ProjectDetailView.vue:7`，来自 `lib/projectPage.ts:47-50`，null/空→'-'、否则 slice(0,10)）。

### 4.2 `/projects/key` 列 + 列头筛选

**`lib/keyProjects.ts`**
- `KeyProjectRow` 接口（当前 `:13-20`）加：`setupDate: string | null`。
- 行由 `buildProgressRowBase`（当前 `:38-67`）装配，其内 `st = m.status`（`:44`）。return 对象（与 `projectLevel: v(st.项目级别, '-')` `:50` 同位）加：
  ```ts
  setupDate: st.立项日期 ?? null,   // 存原始 ISO 串,列 formatter 负责 slice(0,10) 展示
  ```
  （`buildKeyProjectRows` `:69` 逐项目调 `buildProgressRowBase`，故行形状由此决定。）

**`views/KeyProjectsView.vue`**
- `ALL_COLUMNS`（当前 `:57-`，用 `withSortable`）加：
  ```ts
  { key: 'setupDate', label: '立项日期', width: 110,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
  ```
  （`withSortable` 会统一补 `sortable`，除 `NON_SORTABLE_KEYS`；`setupDate` 不在黑名单 → 自动可排。）
- `FILTERABLE`（当前 `:76`）加 `'setupDate'`。
- `DEFAULT_VISIBLE`（当前 `:75` = `ALL_KEYS`）改为排除 setupDate：
  ```ts
  const DEFAULT_VISIBLE = ALL_KEYS.filter((k) => k !== 'setupDate')
  ```
  → 与 `/projects` 一致：默认隐藏、可在选列器打开。

### 4.3 范围设置 date 字段（temp / payment-key / risk）

**temp + payment/key 共享**（`PaymentKeyFollowupView`/`TempFollowupView` 都用缺省 `FIELD_CATALOG` + `buildScopeInputs` + `projectMatches`）：

- `lib/tempScope.ts` `FIELD_CATALOG`（当前 `:36-82`，`project` 组内、`finalAcceptDate` 附近）加：
  ```ts
  { group: 'project', key: 'setupDate', label: '立项日期', kind: 'date' },
  ```
- `lib/tempFollowup.ts` `buildScopeInputs.proj`（当前 `:61-88`，`finalAcceptDate` 附近 `:87`）加：
  ```ts
  setupDate: String(pr?.setupDate ?? '').slice(0, 10),
  ```
  （`pr` 是 `ProjectRow`，`:57`；依赖 4.1 已给 `ProjectRow.setupDate` 赋值。）

**risk 独立目录**（`lib/riskRows.ts`）：
- `buildRiskRows` 行对象（当前 `:40-67`，项目域列区 `:47-62`）加：
  ```ts
  '立项日期': pr?.setupDate ?? null,
  ```
  （`pr` 是 `ProjectRow`，函数内已用 `pr?.stage` 等，`:52`。）
- `RISK_SCOPE_CATALOG`（当前 `:86-112`，`项目状态` 后）加：
  ```ts
  { key: '立项日期', label: '立项日期', kind: 'date' as FieldKind },
  ```

**ScopeBuilder / scopeOps / 后端 scope 校验零改动**：`date` 类型的 `between/notBetween` 运算符（`scopeOps.ts:9-20`）、日期选择器 UI（`ScopeBuilder.vue:188-196`）、`inRange` 按 ISO 串比较（`scopeOps.ts:26-47`）、后端 `followup_store.normalize_scope` 只校验结构且 `between` 已在 `_OPS`（`followup_store.py:8`）——全部现成可用。

## 5. 口径与边界

- **归一化**：所有展示/筛选/比较统一 `slice(0,10)` → `YYYY-MM-DD`（防个别带时分秒）。ISO 格式字典序=时间序，排序与区间比较均正确。
- **空值**：行存 `null`；`/projects`·`/projects/key` 列展示「-」、列头筛选下拉出现空组、区间筛选自然落选；详情页展示「-」；scope `inRange` 对空值（`String(null??'')=''`）在有 `min` 时判否，正确排除。
- **不改**：已关闭项目（清单页 + 详情页）、`projectExport.ts` 导出列（保持导出稳定）。
- **已知无关技术债（不在本次范围）**：`buildScopeInputs.finalAcceptDate` 读 `prog.终验时间`，而 `pmis._assemble` 的 `progress` 块不含「终验时间」，该字段很可能恒空——**本次 setupDate 改从 `status.立项日期` 取（base 100% 填充）不复现此坑**；是否顺带修 finalAcceptDate 不在本 spec 范围。

## 6. 涉及文件清单

| 层 | 文件 | 改动 |
|---|---|---|
| 后端 | `pmis.py` | `_assemble` status 块加 `立项日期` |
| 后端 | `schema.py` | `PmisStatus` 加 `立项日期: Optional[str]` |
| 后端测试 | `tests/`（对应 pmis 测试文件） | `_assemble` 产出含 status.立项日期（有值/兜底/空 三例） |
| 类型 | `frontend/src/types/analysis.ts` | `gen:types` 自动重生成（不手改） |
| 前端 lib | `lib/projectList.ts` | `ProjectRow.setupDate` + 装配 |
| 前端 lib | `lib/keyProjects.ts` | `KeyProjectRow.setupDate` + 装配 |
| 前端 lib | `lib/tempScope.ts` | `FIELD_CATALOG` 加 date 字段 |
| 前端 lib | `lib/tempFollowup.ts` | `buildScopeInputs.proj.setupDate` |
| 前端 lib | `lib/riskRows.ts` | `buildRiskRows` 行 + `RISK_SCOPE_CATALOG` 加 date 字段 |
| 前端 view | `views/ProjectsView.vue` | 列 + DEFAULT_VISIBLE(不含) + FILTERABLE |
| 前端 view | `views/ProjectDetailView.vue` | `.pd-meta` 展示 |
| 前端 view | `views/KeyProjectsView.vue` | 列 + FILTERABLE + DEFAULT_VISIBLE(排除) |
| 前端测试 | 对应 `*.test.ts` | 各 lib 装配 + scope date 命中 |
| 版本 | `frontend/src/version.ts` | `V3.2.2` + RELEASE_DATE |

## 7. 测试策略

- **后端 pytest**（改计算逻辑先补测再改实现）：`_assemble` 三例——base 有值取 base；base 缺、status 有值取 status；两者皆空→`None`。
- **前端 vitest**：
  - `buildProjectRows`：`status.立项日期` → `row.setupDate`；缺失→`null`。
  - `buildKeyProjectRows`：同上。
  - `buildScopeInputs`：`proj.setupDate` 由 `pr.setupDate` slice(0,10) 得到。
  - `buildRiskRows`：行含 `'立项日期'`。
  - scope date：`setupDate` 的 `between`/`notBetween` 用现有 `inRange` 测试范式补一例区间命中/不命中（temp `projectMatches` 与 risk `riskRowMatches` 各一）。
- **构建**：`verify.sh` 全绿（`gen:types` 后 `typecheck` + `vitest` + `build`）。
- **浏览器目验**（改口径/数据层）：点「更新数据」后核对 `/projects` 打开立项日期列有值、排序/筛选生效；`/project/:id` 项目编号行末尾显示；`/projects/key` 同；temp/risk/payment-key 范围设置里「立项日期」出现日期选择器且区间筛有效。

## 8. 升级与部署

- **非纯前端**。升级包须含：`frontend/dist`（换）+ `pmis.py`、`schema.py`（换）。
- 步骤：替换 dist + 替换 py → **重启后端** → **点「更新数据」**（重跑管线把立项日期写进 `analysis_data.json`）→ Ctrl+F5。
- 无新增页面 / 无新 pageKey / 无新第三方依赖。
- 基线 V3.2.1（已上线）。

## 9. 执行方式

writing-plans 后用 subagent-driven-development，实现阶段用 workflow/subagent 并行提速：后端（pmis+schema+测试）1 组、前端各 lib/view 互不相交可并行；控制者串行审查提交 + 一次合并 typecheck/build + opus 终审。
