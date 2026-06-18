# 子项目2：在建/已关闭项目清单 设计

> 生成 2026-06-18。前置：子项目1 PMIS 数据血缘扩展(V1.7.0)已合并；详情页合同编号展示(V1.7.1)已合并。
> 配套血缘：`docs/字段级数据血缘-数据字典-2026-06-18.md` §四(WPS 残留)、页面级清单 §4 标注的"已关闭全量摄取"待办即本子项目。

## 目标

把项目清单从"仅在建"扩展为**在建 / 已关闭两个清单**：全量摄取交付实施三部的已关闭项目（轻量、PMIS 已关闭三表口径），前端拆为两个独立路由页，已关闭行可点开精简详情页。

## 范围

**范围内**：已关闭项目轻量摄取（新 `closedProjects` 键 + `ClosedProject` schema + 类型）、前端已关闭清单页(`/projects/closed`)、精简已关闭详情页(`/closed-project/:id`)、导航标签调整、`meta.totalClosed` 口径统一、版本 V1.8.0。

**范围外（不做）**：已关闭项目的回款/里程碑/利润/风险 join（已关闭基本无这些数据，YAGNI）；已关闭清单 xlsx 导出（v1 不做）；已关闭项目接入现有完整详情页(`/project/:id`)的回款/里程碑/利润 tab；放宽 `/project/:id` 的 404 限制。WPS A.xlsx project_overview / pay_projects / followup 双源（属另行处置，不在本子项目）。

## 决策（brainstorming 已定）

1. **已关闭 universe** = 交付三部全部已关闭（项目经理 ∈ 三部花名册），全量摄取（≈3417）。同在建清单的部门口径、也同现 `count_closed_dept`。
2. **字段** = PMIS 已关闭三表核心（轻量），不 join 回款/里程碑/利润/风险。
3. **前端** = 两个独立路由（`/projects` 在建保持不变、`/projects/closed` 已关闭新增）。
4. **精简详情** = 独立路由详情页 `/closed-project/:id`（非 modal）。
5. **导航** = 现「项目清单」改名「在建项目」，新增「已关闭项目」。
6. **导出** = v1 不做。
7. **版本** = V1.8.0（Y 级新增整页）。

## 一、数据源与口径

- 源：`input/pmis/` 已关闭三表（`config.PMIS_FILES_CLOSED`）：
  - center `项目中心-已关闭.xlsx`（4797 行；含 成本状态/是否交付部门人工成本超支/合同编号/项目经理/项目级别/计划终验时间/项目类型/项目阶段）
  - base `项目基础信息数据-已关闭.xlsx`（4790 行；含 项目经理（FR）/CSR/CDR/SR/AR/项目经理L3部门/项目经理L3-1部门/项目经理L4部门/签约单位/最终客户/行业中类/合同总额（元）/合同编号/项目状态/**项目关闭时间**/**是否正常关闭**/**关闭说明**）
  - status `项目状态信息数据-已关闭.xlsx`（4025 行；含 项目累计完工进展百分比/里程碑进度状态/项目阶段/项目状态/预算列 项目总预算（元）·项目核算（元）·剩余预算（元））
  - **无 risk 已关闭表**（与现状一致）。
- 表头第 2 行（`config.PMIS_HEADER_ROW=2`）；join 键 = 项目编号。
- universe = 已关闭 center 项目 ∩（项目经理 ∈ `org_names`）。`org_names` = `read_org_names(组织架构.xlsx)` 的三部花名册（与在建同源；空清单时降级为不过滤，同在建）。

## 二、后端 `build_closed_projects`（projects.py）

新增纯函数：

```
build_closed_projects(pmis_dir: str, org_names: set) -> List[Dict[str, Any]]
```

- 读已关闭三表（`read_pmis_sheet` + `_index_by_pid`）。universe 遍历 `c_center.keys()`，过滤 `项目经理 ∈ org_names`（org_names 为空则不过滤，降级）。
- 每项复用现有 `_assemble(pid, c_base, c_center, c_status, {}, "已关闭")`（risk 传空 dict → risk 字段为空，但本清单不输出 risk）取得 team/customer/cost/status/progress，再映射为轻量已关闭对象（下方字段），并补 `closeInfo`（_assemble 不产出，从 c_base/c_center 行直接取）。
- 目录/文件缺失 → 返回 `[]`（`read_pmis_sheet` 已对缺失路径降级）。

**每条 `closedProjects[*]` 字段**：

| 顶层 | 来源 |
|---|---|
| projectId | 项目编号 |
| projectName | team.项目名称(center.项目名称 or base.项目名称) |
| projectManager | team.项目经理 |
| orgL4 | team.L4部门 |
| orgL3_1 | team.L3_1部门 |
| 合同编号 | customer.合同编号(center 优先→base) |
| team | {项目名称/项目经理/L4部门/L3部门/L3_1部门/AR/SR/CSR/CDR/Sponsor}（_assemble team，10 键，缺列→None） |
| customer | {最终客户/签约单位/合同总额/行业}（_assemble customer 子集） |
| status | {项目状态/项目阶段/项目类型/项目级别/评级}（_assemble status 子集；已关闭 status 表可能无「项目评级」→None） |
| cost | {总预算/核算/剩余预算/消耗比/项目超支/交付超支/成本状态}（derive_cost(status_c_row, center_c_row)，口径同在建：项目超支=剩余预算<0、交付超支=center.是否交付部门人工成本超支=="是"） |
| progress | {完工进展/里程碑进度状态}（_assemble progress 子集；不含 终验时间——已关闭不做里程碑回填） |
| closeInfo | {关闭时间=base.项目关闭时间, 是否正常关闭=base.是否正常关闭, 关闭说明=base.关闭说明, 计划终验时间=center.计划终验时间}（已关闭特有，新增） |

**日期格式化（硬要求）**：`closeInfo.关闭时间` 与 `计划终验时间` 来自 PMIS xlsx 日期列——`read_pmis_sheet` 用 openpyxl `data_only` 读出，日期单元格为 **datetime 对象**（非字符串/epoch）。而 `final_data` 先经 `AnalysisData`(pydantic，字段类型 `Optional[str]`) 校验、再 `schema.py` 的 `json.dump`（**无 `default=str`**）写出——原始 datetime 会**校验失败且不可序列化**。故 `build_closed_projects` 必须用一个日期归一化 helper 把这两列转为 `"YYYY-MM-DD"` 字符串：datetime→`strftime('%Y-%m-%d')`、字符串→strip(取前 10 位日期)、空/None→None。`是否正常关闭`/`关闭说明` 为文本列，按字符串读取（空→None）。

**preprocess_data.py 接线**：
- `final_data["closedProjects"] = build_closed_projects(os.path.join(input_dir, config.PMIS_DIRNAME), names)`（`names` = 已读的三部花名册，与 `load_dept_projects` 共用，避免重复读组织架构）。
- `meta.totalClosed = len(closedProjects)`（口径以 closedProjects 长度为准）。现有 `projects_quality.closedDeptCount`（`count_closed_dept`，同口径 center∩org_names）**保留不动**，二者相等；不新增分歧代码路径。

## 三、schema.py + 类型

新增模型并挂到根（`AnalysisData`）：

```python
class ClosedProjectCost(_Base):
    总预算: Optional[float] = None
    核算: Optional[float] = None
    剩余预算: Optional[float] = None
    消耗比: Optional[float] = None
    项目超支: Optional[bool] = None
    交付超支: Optional[bool] = None
    成本状态: Optional[str] = None

class ClosedProjectCloseInfo(_Base):
    关闭时间: Optional[str] = None
    是否正常关闭: Optional[str] = None
    关闭说明: Optional[str] = None
    计划终验时间: Optional[str] = None

class ClosedProject(_Base):
    projectId: str
    projectName: str = ""
    projectManager: str = ""
    orgL4: str = ""
    orgL3_1: str = ""
    合同编号: str = ""
    team: PmisTeam = PmisTeam()
    customer: PmisCustomer = PmisCustomer()
    status: PmisStatus = PmisStatus()
    cost: ClosedProjectCost = ClosedProjectCost()
    progress: PmisProgress = PmisProgress()
    closeInfo: ClosedProjectCloseInfo = ClosedProjectCloseInfo()
```

- 复用 `PmisTeam/PmisCustomer/PmisStatus/PmisProgress`（已含 extra="allow"，多余键无害；cost 用新 `ClosedProjectCost` 以精确表达轻量成本子集）。
- 根模型加 `closedProjects: List[ClosedProject] = []`。
- 运行 `cd frontend && npm run gen:types` 重生 `analysis.ts`。

## 四、前端

### 路由 + 导航
- 新路由：`/projects/closed` → `ClosedProjectsView.vue`；`/closed-project/:id` → `ClosedProjectDetailView.vue`。
- 导航：现「项目清单」(指向 `/projects`) 改标签为「在建项目」；新增「已关闭项目」(指向 `/projects/closed`)。（定位现有路由/导航定义文件，逐路径改。）

### `closedProjectList.ts`（新 lib）
- `buildClosedRows(closedProjects)`：扁平化为表格行（顶层 + 取 customer/status/cost/closeInfo 需要的列值）。
- `filterClosedRows(rows, filters)` + `ClosedFilters` + `distinctOptions`（复用在建同名模式）。

### `ClosedProjectsView.vue`（已关闭清单）
- 复用 `DataTable` + `el-pagination`（默认 50，sizes 20/50/80/100）扛 ≈3417 行。
- **列**：项目名称 / 项目编号 / 客户(customer.最终客户) / 签约单位 / 合同金额(万)(customer.合同总额) / 服务组(L4)(orgL4) / L3-1部门(orgL3_1) / 项目经理 / 项目类型(status) / 级别(status.项目级别) / 评级(status) / 项目阶段(status) / 项目状态(status) / 关闭时间(closeInfo.关闭时间) / 预算消耗比(cost.消耗比) / 项目超支(cost.项目超支)。
- **筛选**：搜索(名/编号/客户/经理) + 经理 / 服务组(L4) / L3-1部门 / 项目类型 / 级别 / 评级 / 项目阶段 / 项目状态。
- 行点击 → `router.push('/closed-project/' + row.projectId)`。
- 空态：无 closedProjects → 「暂无已关闭项目数据——请在数据管理提供 PMIS 已关闭三表后更新数据」。

### `ClosedProjectDetailView.vue`（精简详情）
- 按 `:id` 从 `data.data.closedProjects` 查找（`find(p => p.projectId === id)`）；未找到 → 轻量 404 文案（「该已关闭项目不在交付三部已关闭清单中」）。
- 块（无 tab）：
  - 头部：项目名称 + 编号 + 项目状态/项目阶段 徽章。
  - 基本/关闭：关闭时间 / 是否正常关闭 / 关闭说明 / 计划终验时间(closeInfo)。
  - 团队：team 9 字段（L3-1部门 标签连字符、键下划线 L3_1部门，同在建详情团队块）。
  - 客户：最终客户 / 签约单位 / 合同编号 / 行业 / 合同总额(万)。
  - 成本：总预算 / 核算 / 剩余预算 / 消耗比 / 项目超支 / 交付超支 / 成本状态。
- 复用在建详情页的 chip/section 展示样式与设计令牌。

### 在建侧
- `/projects` ProjectsView 与 `/project/:id` ProjectDetailView **不改**（仅导航标签由「项目清单」→「在建项目」）。

## 五、版本

`frontend/src/version.ts` → `V1.8.0` / `2026-06-18`（Y 级：新增整页）。PROGRESS 头部同步，上一版顺延 V1.7.1。

## 六、边界 + 测试

**边界**：
- 无已关闭文件/目录 → `build_closed_projects` 返回 `[]`，前端空态。
- org_names 空（无组织架构）→ 不过滤（降级，同在建 build_projects）。
- 已关闭 status 表无「项目评级」列 → 评级 None（前端显示 '-'）。
- 同一 pid 同时在在建与已关闭？已关闭 center 与在建 center 互斥（PMIS 导出分表），不去重；如极端重叠以各自清单独立呈现（不互相排除）。

**测试**：
- pytest（projects）：`build_closed_projects` —— universe 仅 center∩org_names、org_names 空降级、字段映射(team/customer/cost 项目超支·交付超支/closeInfo)、**closeInfo 日期归一化(datetime→"YYYY-MM-DD"、字符串截取、空→None)**、空目录返回 []、len 与 closedDeptCount 口径一致。
- pytest（preprocess）：closedProjects 进 final_data、meta.totalClosed=len(closedProjects)。
- pytest（schema）：ClosedProject 校验 + model_fields 正向断言（closeInfo/cost.项目超支 等关键键）。
- vitest：closedProjectList(buildClosedRows/filterClosedRows/distinctOptions)、ClosedProjectsView(列渲染/分页/筛选/行点击跳转)、ClosedProjectDetailView(四块渲染 + L3-1部门键守护 + 未找到 404)。
- gen:types 后 typecheck + 全量 vitest 全绿。

## 七、验证（完成定义）

- `bash verify.sh` 全绿（语法/ruff/pytest + 前端 typecheck/vitest/build）。
- 集成冒烟：跑 `preprocess_data.py`，核 `meta.totalClosed≈3417 == len(closedProjects)`、`closedProjects[0]` 含 team/customer/cost.项目超支/closeInfo.关闭时间。
- 手动：`/projects`(在建不变)、`/projects/closed`(清单+筛选+分页)、点行 → `/closed-project/:id`(四块) 正常；导航「在建项目」「已关闭项目」两入口。
- PROGRESS 更新 + V1.8.0。
