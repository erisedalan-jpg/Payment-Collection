# TOP1000 客户属性接入 设计文档

> 日期：2026-06-24　版本：V1.19.0（跨页加维度 + 新数据源，Y 位）
> 状态：设计已与用户确认，待用户复核本 spec 后转 writing-plans。

## 1. 目标

新增辅助数据源 `input/TOP1000.xlsx`（CRM 大客户清单），把「是否 TOP1000 大客户」与「象限」两项客户属性接到现有项目主域，并在 5 个页面展示/筛选/作为分析维度：

- `/data` 数据管理页：可离线上传 TOP1000.xlsx，「更新数据」同步刷新。
- `/projects`：新增「TOP1000」「象限」两列（默认隐藏、可筛选）。
- `/project/:id`：在「客户」与「签约单位」之间展示「TOP1000大客户」「象限」。
- `/insight`、`/insight/board`、`/insight/risk`：维度新增「TOP1000」「象限」两项。

## 2. 数据源结构（已核对真实文件）

`input/TOP1000.xlsx`，单 sheet（Sheet1），首行表头，139 条数据行。表头 9 列：

```
客户编码 | 客户名称 | CRM客户负责人 | 市场BG |
CRM客户负责人\n集团军/大区/特区 | CRM客户负责人\n军团/省分公司 |
客户级别 | 关联客户类型 | 象限
```

本期只用 4 列：**客户名称、客户编码、客户级别、象限**（其余忽略）。

- `客户名称`：139 个全部唯一（无重复），干净 join 键。
- `客户级别`：全部为 `TOP1000大客户`（此前 TOP1001…1020 为数据异常，用户已修正回 TOP1000）。规则仍按「级别==TOP1000大客户」判定，防未来脏数据。
- `象限`：4 种取值 —— `M1 战略核心区`(104) / `M2 现金牛/打猎区`(29) / `M3 潜力培育区`(2) / `M4 待开拓/长尾区`(4)。

## 3. 匹配与派生规则

**匹配键 = 项目的 `最终客户`（PMIS 基础信息），与 TOP1000.客户名称 strip 后精确等值匹配。** 不做模糊匹配（YAGNI）。

依据（用真实数据核对）：主域 623 个在建项目中，按 `最终客户` 命中 75 个；按 `签约单位` 仅命中 1 个（签约单位多为「某T1-终端用户直签」等通用串，不可用）。全量 projectPmis(1260) 按 `最终客户` 命中 175 个。

每个项目派生两字段（写到项目主域记录 `Project` 上，作为 5 个消费点的**单一来源**）：

| 字段 | 类型 | 取值规则 |
|---|---|---|
| `top1000` | `str` | `"是"` ⟺ 命中清单 **且** 命中行 `客户级别 == "TOP1000大客户"`；否则 `"否"`（含未命中） |
| `quadrant` | `str` | 命中行的 `象限` 值（如 `"M1 战略核心区"`）；未命中或该行象限为空 → `""` |

注：`quadrant` 仅取决于是否命中，**与 `top1000` 是/否无关**（清单内即便级别非 TOP1000 也可有象限，本期数据全为 TOP1000，但规则保持解耦）。

## 4. 后端设计

数据流：`TOP1000.xlsx` →(openpyxl 解析)→ `{客户名称: {level, quad}}` →(build_projects 内按最终客户查表)→ `Project.top1000 / Project.quadrant` →(schema 校验)→ `analysis_data.json`。

### 4.1 config.py
- 新增常量 `TOP1000_FILE = "TOP1000.xlsx"`、`TOP1000_LEVEL = "TOP1000大客户"`。
- `INPUT_UPLOAD_NAMES` 加入 `"TOP1000.xlsx"`（上传白名单）。

### 4.2 projects.py
- **新函数** `read_top1000(path) -> Dict[str, Dict[str, str]]`：复用现有 `_read_header_sheet(path, "客户名称")`（其 `_open_workbook` 不用 read_only，规避 WPS 截行问题），转成 `{客户名称.strip(): {"level": 客户级别.strip(), "quad": 象限.strip()}}`。文件缺失/无该表头 → 返回 `{}`（优雅降级，不抛错、不阻断主流程）。客户名称为空的行跳过。
- **改 `build_projects(...)`**：新增形参 `top1000_map: Dict[str, Dict[str, str]]`（带默认 `None`→`{}` 容错）。循环内取 `最终客户 = str((pm.get("customer") or {}).get("最终客户") or "").strip()`，查 `top1000_map`，按 §3 规则计算 `top1000`/`quadrant`，加入返回 dict。
- **改 `load_dept_projects(input_dir, project_pmis, mapping)`**：在已有 `read_org_names`/`read_delivery` 旁增 `top1000 = read_top1000(os.path.join(input_dir, config.TOP1000_FILE))`，传给 `build_projects(..., top1000_map=top1000)`。

### 4.3 preprocess_data.py
**无需改动**：`load_dept_projects` 已接收 `input_dir`（`os.path.join(BASE_DIR, "input")`，BASE_DIR 已含 frozen 双分支），TOP1000 读取与路径定位由 §4.2 内部完成，开发/打包两模式自动覆盖。

### 4.4 schema.py
- `Project` 模型新增两显式字段：`top1000: str = "否"`、`quadrant: str = ""`（显式声明而非依赖 `extra=allow`，使前端 `gen:types` 生成具名类型、避免孤儿消费方）。
- 改后运行 `cd frontend && npm run gen:types` 重新生成 `src/types/analysis.ts`。

## 5. 前端设计

所有页面均从 Pinia `useDataStore().data` 的 `projects`（项目主域）读取新字段，与后端单一来源对齐。

### 5.1 数据管理页 `/data`
- `composables/useInputFiles.ts` 的 `INPUT_FILE_NAMES` 加入 `"TOP1000.xlsx"`，自动出现在可上传清单与上传循环。`DataView.vue` 展示逻辑（过滤 legacy）无需特殊处理。
- 「更新数据」（`/api/reprocess`）本就全量重跑管线，自动包含 TOP1000 解析，无需额外接线。

### 5.2 `/projects`（ProjectsView.vue + projectList.ts）
- `ProjectRow`（projectList.ts）增 `top1000: string`、`quadrant: string`；`buildProjectRows` 从 `p.top1000`/`p.quadrant` 取值（默认 `'否'`/`''`）。
- `ALL_COLUMNS` 增两列：`{ key: 'top1000', label: 'TOP1000' }`、`{ key: 'quadrant', label: '象限' }`。**不加入 `DEFAULT_VISIBLE`** → 默认隐藏，可经 ColumnPicker 勾选。
- `FILTERABLE` Set 加入 `'top1000'`、`'quadrant'` → 表头自动渲染 ColumnFilter。象限无数据的行其值为空，筛选枚举里归一为现有空值表现。

### 5.3 `/project/:id`（ProjectDetailView.vue）
- 在 `pd-meta` 区，`<span>客户 …</span>`（:285）与 `<span>签约单位 …</span>`（:286）之间插入两个同形 span：
  ```html
  <span>TOP1000大客户 <b>{{ p.top1000 || '否' }}</b></span>
  <span>象限 <b>{{ p.quadrant || '-' }}</b></span>
  ```
- 形态与现有「客户/签约单位」一致（标签 + 值文字），不另做卡片。

### 5.4 三个分析页维度（各自独立行构建，互不复用）

| 页面 | 维度数组 | 行类型 | 行构建函数 | 取值来源 |
|---|---|---|---|---|
| `/insight` | `INSIGHT_DIMENSIONS` | `InsightRow` | `buildInsightRows` | `p.top1000` / `p.quadrant` |
| `/insight/board` | `PAY_BOARD_DIMENSIONS` | `PayBoardRow` | `buildPayBoardRows` | `p.top1000` / `p.quadrant` |
| `/insight/risk` | `RISK_DIMENSIONS` | `RiskRow` | `buildRiskRows` | `p.top1000` / `p.quadrant` |

每页三处同构改动：维度数组各 push `{ key: 'top1000', label: 'TOP1000' }`、`{ key: 'quadrant', label: '象限' }`；行类型加两字段；行构建函数加两赋值（用现有 `v()` helper，使未匹配空象限归 `'-'`）。

- `/insight`、`/insight/board`：本身有「排名/交叉/透视」三选项卡且共用同一维度列表，加入维度数组后三卡自动适配，无须改页面模板。
- `/insight/risk`：页面结构为「风险统计分析（排名）」+「风险概览（按维度透视表）」两块，共用 `RISK_DIMENSIONS`（概览选择器排除 `riskLevel`）。加入两维后自动出现在两块的维度选择器中（用户已确认此范围，不另建交叉/透视选项卡）。

## 6. 错误处理与边界

- TOP1000.xlsx 缺失/损坏/无表头 → `read_top1000` 返回 `{}`，全部项目 `top1000='否'`、`quadrant=''`，不阻断管线（与其他辅助源同款降级）。
- 项目 `最终客户` 为空或不在清单 → `top1000='否'`、`quadrant=''`。
- 前端象限空值：表格/详情显示空或 `-`；分析维度归 `'-'` 桶（沿用现有约定）。
- 异常项目（orgL4 空）不因本特性改变其在各页的既有纳入/排除规则。

## 7. 测试策略

- **后端（pytest，TDD）**：
  - `read_top1000`：正常解析（名称→{level,quad}）、缺文件返回 `{}`、客户名称空行跳过、级别/象限 strip。
  - `build_projects` 派生：命中且级别 TOP1000→`top1000='是'`；命中但级别非 TOP1000→`'否'` 而 `quadrant` 仍取值；未命中→`'否'`/`''`；最终客户空→未命中。
  - 用小型内存夹具（构造 project_pmis + top1000_map），不依赖真实大文件。
- **前端（vitest）**：
  - `buildProjectRows`/`buildInsightRows`/`buildPayBoardRows`/`buildRiskRows` 新字段映射（命中/未命中/空象限）。
  - 维度数组含新两维（断言 label/key）。
  - ProjectsView 列默认隐藏（不在 DEFAULT_VISIBLE）、在 FILTERABLE。
- **验证**：`bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）；改 schema 后先 `npm run gen:types`。手动冒烟：放好 TOP1000.xlsx → `python server.py` → 点更新数据 → 核对 /projects 两列、详情页、三分析页维度。

## 8. 范围与非目标

- 非目标：模糊/别名匹配、客户编码 join（项目侧无客户编码字段）、TOP1000.xlsx 其余 5 列（CRM负责人/市场BG/关联客户类型等）、风险页新建交叉/透视选项卡。
- 版本 V1.19.0，与未上生产的 V1.17.1、V1.18.0 一并待打包，不单独上线。
