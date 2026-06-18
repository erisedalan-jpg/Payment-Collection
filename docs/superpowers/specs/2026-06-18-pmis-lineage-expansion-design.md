# 子项目1：PMIS 数据血缘扩展 — 设计 spec

> 状态：已与用户确认（含 6 项结构决策）。本 spec 为 writing-plans 的输入。
> 日期：2026-06-18 ｜ 版本影响：Y 级（多处字段口径调整，跨页面）

## 1. 目标与范围

把 projectPmis / projects / meta 的字段口径扩展并换源到 PMIS 九表，使「项目数、组织、售前识别、终验时间、超支、回款完成率」全部脱离 WPS 与历史 bug 字段。

**范围内**：projectPmis 字段（team/customer/progress/status/cost）、projects[*] 字段（projectId universe/orgL3_1/合同编号/isPresale）、终验时间里程碑 join、回款完成率统一节点级、meta 在建/已关闭计数、schema + 前端类型与展示。

**范围外（子项目2）**：已关闭项目全量摄取（∩交付三部 3416 个）、项目清单 在建/已关闭 两子页。本 spec 只把 meta.totalClosed 作为**计数**输出，不扩大已关闭项目的摄取范围（仍为 回款∪售前映射）。

## 2. 全局约束（Global Constraints）

- 简体中文沟通；**全程禁用 emoji**，需符号用 `→ ↓ ❌ ✕ ▾`。
- 根目录未跟踪文件 `看板数据取值条件与计算公式.md` **永不提交**：禁止 `git add -A` / `git add .`，只逐路径 add。
- 版本单一来源 `frontend/src/version.ts`；本子项目为 Y 级，落版本时只改此处。
- PMIS 校验命令前缀：`PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python ...`。
- 删除/迁移类改动必须跑**全量** pytest + 全量 vitest（不止窄单测）。
- 提交信息结尾：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 完成口径：代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。

## 3. 数据源（已逐列核证真实存在）

PMIS 表头第 2 行（`config.PMIS_HEADER_ROW=2`）；join key = 项目编号。

| 逻辑名 | 文件 | 用到的列（精确列名） |
|---|---|---|
| base（在建/已关闭） | 项目基础信息数据.xlsx / -已关闭 | 项目经理L3部门、项目经理L3-1部门、客户经理（AR）、方案经理（SR）、**安全运行经理（CSR）**、定制经理（CDR）、Sponsor、签约单位、合同编号、合同总额（元）、项目名称、项目经理（FR）、项目经理L4部门、最终客户、行业中类 |
| center（在建/已关闭） | 项目中心.xlsx / -已关闭 | 项目编号、项目名称、项目经理、合同编号、是否交付部门人工成本超支、项目阶段 |
| status（在建/已关闭） | 项目状态信息数据.xlsx / -已关闭 | 项目类型、关键动作完成情况(必须-考核)、交付物上传情况(必须-考核)、剩余预算（元）、项目核算（元）、项目总预算（元）、成本状态、项目累计完工进展百分比、里程碑进度状态、项目状态、项目评级、项目级别、项目评分、未关闭风险数量 |
| 里程碑（在建/已结项） | 在建项目里程碑计划数据.xlsx / 已结项里程碑计划数据.xlsx | 计划终验时间、计划服务完成时间（经 `milestones.py` 转为 items 的 `终验.planDate` / `服务完成.planDate`） |

注：`签约形式分类` 列**不存在**（印证旧 bug）；`方案运行经理（CSR）` 不存在，真实为 `安全运行经理（CSR）`。`关键动作完成情况(必须-考核)`/`交付物上传情况(必须-考核)` 在 status 表为**半角括号**（与本 spec 一致）。

## 4. 后端改动

### 4.1 `pmis.py` — `_assemble` projectPmis 字段

字段键（=前端消费键），源列见 §3。

**team**（新增 7，均取 base `b`）：
```
项目名称  ← c.项目名称 or b.项目名称        (不变)
项目经理  ← c.项目经理 or b.项目经理（FR）  (不变)
L4部门    ← b.项目经理L4部门                (不变)
L3部门    ← b.项目经理L3部门                (新)
L3_1部门  ← b.项目经理L3-1部门              (新; JSON 键用下划线,标识符合法;展示标签写"L3-1部门")
AR        ← b.客户经理（AR）                (新)
SR        ← b.方案经理（SR）                (新)
CSR       ← b.安全运行经理（CSR）           (新)
CDR       ← b.定制经理（CDR）               (新)
Sponsor   ← b.Sponsor                       (新)
```

**customer**：
```
最终客户  ← b.最终客户          (不变)
合同编号  ← c.合同编号 or b.合同编号   (改:center 优先, 决策2)
签约单位  ← b.签约单位          (新, 取代旧 签约形式)
行业      ← b.行业中类          (不变)
合同总额  ← parse_pmis_money(b.合同总额（元）)  (不变)
```
删除旧 `签约形式`（读不存在的 `签约形式分类`，恒 None）。

**status**（新增 2）：
```
...原有字段不变...
关键动作  ← s.关键动作完成情况(必须-考核)   (新)
交付物    ← s.交付物上传情况(必须-考核)     (新)
```

**progress**：`计划终验` → `终验时间`（值由 §4.4 里程碑 join 回填；`_assemble` 内先不再读 `c.计划终验时间 or s.合同目标终验时间`，该键移除）。

**cost**（`derive_cost` 重定义）：
```
总预算/核算/剩余预算/消耗比/成本状态  (不变, 剩余预算 ← s.剩余预算（元）)
项目超支  ← (剩余预算 is not None and 剩余预算 < 0)   (取代旧 超支:扫 center "超支"列)
交付超支  ← (str(center.是否交付部门人工成本超支).strip() == "是")  (新)
```
`derive_cost(status_row, center_row)` 签名不变；移除 `overrun_keys` 动态扫描。

### 4.2 `pmis.py` — 在建 universe = 仅项目中心（决策1）

`build_project_pmis` 在建循环：
```python
# 旧: for pid in a_base.keys() | a_center.keys() | a_status.keys():
for pid in a_center.keys():
    out[pid] = _assemble(pid, a_base, a_center, a_status, a_risk, "在建")
```
已关闭循环不变（仍 ∩ 回款∪extra_closed_ids）。在建集 902→895。

### 4.3 `milestones.py` — 终验时间纯函数

新增：
```python
def final_acceptance_date(items, project_type):
    """按项目类型取里程碑计划日:售前服务类→服务完成.planDate,否则→终验.planDate。无→None。"""
    target = "服务完成" if str(project_type or "").strip() == config.PRESALE_PROJECT_TYPE else "终验"
    for it in items or []:
        if it.get("name") == target:
            return it.get("planDate") or None
    return None
```

### 4.4 `preprocess_data.py` — 终验时间回填

`project_milestones` 载入后（现 ~860 行之后）回填，复用已载数据：
```python
for pid, pm in project_pmis.items():
    ptype = (pm.get("status") or {}).get("项目类型")
    (pm.setdefault("progress", {}))["终验时间"] = milestones_mod.final_acceptance_date(
        project_milestones.get(pid, []), ptype)
```
非 keep_ids 的在建项目（不在交付三部）无里程碑数据 → 终验时间 None（不展示，可接受）。

### 4.5 `projects.py` — projects[*]

`build_projects`：
```
orgL3 → orgL3_1 :  org_l3_1 ← pm.team.L3-1部门   (换源 PMIS,删 org_l3_map 参数)
合同编号(新)     :  pm.customer.合同编号           (= center 优先值)
isPresale(改源)  :  (pm.status.项目类型 == config.PRESALE_PROJECT_TYPE)
```
删除 `read_org_l3_map` 函数 + `load_dept_projects` 中调用 + `build_projects` 的 `org_l3_map` 形参。`compute_health`：`cost_ab = bool(cost.项目超支) or (消耗比 is not None and 消耗比 > 1)`。

### 4.6 `projects.py` — 已关闭计数

`load_dept_projects` 内读 `input/pmis/项目中心-已关闭.xlsx`，计 `项目经理 ∈ org_names` 的 pid 数，写入 `quality["closedDeptCount"]`（在建计数已 = `len(projects)`）。新增纯函数：
```python
def count_closed_dept(pmis_dir, org_names):
    rows = read_pmis_sheet(os.path.join(pmis_dir, config.PMIS_FILES_CLOSED["center"]))
    return sum(1 for r in rows if str(r.get("项目经理") or "").strip() in org_names)
```

### 4.7 `projects.py` — 回款完成率统一（决策含义）

`build_payment_summary` 删除 `paymentRatio` 键（流水÷合同）。唯一口径 = `aggregate_payment_pmis().paymentRatio`（节点级 Σ已收÷Σ计划），不动。

### 4.8 `preprocess_data.py` — meta

```
totalProjects = len(dept_projects)             # = center ∩ 三部 = 624(实测)
totalClosed   = projects_quality["closedDeptCount"]   # = center-已关闭 ∩ 三部 = 3416(实测)  (新键)
```
（meta 不再依赖 `project_overview`。）

### 4.9 `config.py`

新增 `PRESALE_PROJECT_TYPE = "售前服务类"`。`PRESALE_PREFIX` 若仅 isPresale 使用则保留备查（不删，避免牵连）。

## 5. schema + 前端

### 5.1 `schema.py` + 类型

同步 §4 全部字段（team +7、customer 签约单位/合同编号、progress 终验时间、status 关键动作/交付物、cost 项目超支/交付超支、projects orgL3_1/合同编号、meta totalClosed、paymentPmis 删 paymentRatio）。后运行 `cd frontend && npm run gen:types` 重生 `src/types/analysis.ts`。

### 5.2 前端展示（决策3：orgL3 端到端改名）

- `frontend/src/lib/paymentPmis.ts`：`PayNodeRow.orgL3 → orgL3_1`；enrich `orgL3_1: (p.orgL3_1 ?? '').trim()`（:214）。
- `frontend/src/lib/calendar.ts`：`CalFilters.orgL3 → orgL3_1`、`calFilterOptions`、`applyCalFilters` 全改。
- `frontend/src/views/CalendarView.vue`：:43/:139 `orgL3 → orgL3_1`（筛选 state 键与 el-option）。
- `frontend/src/views/ProjectDetailView.vue`：
  - `metrics` :77 `计划终验`→`终验时间`（键+取值 `progress?.终验时间`）。
  - `progressInfo` :130 同上。
  - `pmisPaySummary` :107 删除 `{ k:'完成率', v:fmtRatio(s.paymentRatio) }` 行；:295 note 改写（去掉"完成率=流水÷合同"描述）。
  - 客户块新增 `签约单位`（`m.customer?.签约单位`）。
  - **单开一个「团队」展示块**（独立于客户块），含 项目经理/L4部门/L3部门/L3-1部门/AR/SR/CSR/CDR/Sponsor（`m.team?.*`，空值 `-`）。
  - status 块新增 关键动作/交付物（`m.status?.*`）。
  - 预算核算 tab 新增 项目超支/交付超支（`m.cost?.项目超支`/`m.cost?.交付超支`，布尔→"是/否/-"）。
- `frontend/src/views/BoardView.test.ts` 等 fixture：删除 `paymentPmis.paymentRatio` 种子或随类型更新。

### 5.3 决策4：交付超支徽章互不干扰

头部 `deliveryOverBadges`（ProjectDetailView.vue:67-72，基于 delivery_analysis 白名单）+ `overBudget`（overspendAmount）机制**不动**。新 `cost.交付超支` 仅作预算核算 tab 展示字段。`health.costAbnormal` 用 `cost.项目超支`。

## 6. 测试与验证

- `pmis.py`：补/改 `_assemble` 单测覆盖 team 7 新字段、customer 签约单位/合同编号 center 优先、cost 项目超支(剩余<0)/交付超支(center=="是")；`build_project_pmis` 在建 universe = center.keys()。
- `milestones.py`：`final_acceptance_date` 单测（售前服务类→服务完成、其他→终验、缺→None）。
- `projects.py`：`build_projects` orgL3_1/合同编号/isPresale(项目类型)；`count_closed_dept`；`build_payment_summary` 无 paymentRatio；`compute_health` costAbnormal 用项目超支。
- 集成：跑一次 `preprocess_data.py` 产出 `data/analysis_data.json`，核 `meta.totalProjects/totalClosed`、`projects[0]` 含 orgL3_1/合同编号、`projectPmis` 任一含 team 新字段/progress.终验时间/cost.项目超支。
- 前端：`npm run typecheck` + 全量 `npm run test:run` + `npm run build`；日历 orgL3_1 筛选、详情页新字段无报错。
- 全量：`bash verify.sh` 全绿。

## 7. 实现顺序（writing-plans 细化）

1. config.PRESALE_PROJECT_TYPE → 2. pmis.py（team/customer/status/cost/universe）→ 3. milestones.final_acceptance_date → 4. projects.py（build_projects/count_closed_dept/build_payment_summary/compute_health/删 read_org_l3_map）→ 5. preprocess_data.py（终验时间回填/meta）→ 6. schema.py + gen:types → 7. 前端 lib（paymentPmis/calendar）→ 8. 前端 views（CalendarView/ProjectDetailView）→ 9. 前端 fixture/test → 10. verify.sh + PROGRESS。
