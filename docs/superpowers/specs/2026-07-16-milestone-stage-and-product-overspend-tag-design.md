# 阶段验收款里程碑接入 + 产品超支标签 — 设计规格

> 状态：设计经 brainstorm 多轮确认，待转 writing-plans。分支：master。日期：2026-07-16。
> 本 spec 覆盖用户一次给的三项：Task 1（阶段里程碑）、Task 2（首页待办卡 × 标签排除，已核查=无改动）、Task 3（产品超支标签）。

## 0. Task 2 结论（已核查，无需实现）

首页「待办/临期」卡（`TodoQueue.vue` + `lib/todoQueue.ts`）**已应用**「按标签排除」：三条输入臂（回款节点 / 里程碑 / 成本超支）全部从 `OverviewView.vue:46-49` 的 `baseProjects`（`filter.excludeOn` 时已 `filter(!excludedIds[pid])`）派生，被排除项目不出现在待办卡。**按用户「如不受影响则调整」的条件，本项无改动**，仅记录结论。

---

## Task 1 — 阶段验收款里程碑接入

### 1.1 数据真相（已实测两表列 38/39）
两表（`在建项目里程碑计划数据.xlsx` / `已结项里程碑计划数据.xlsx`，同构，表头第 2 行，宽表一行一项目）最后两列：
- 列 38「阶段计划完成时间」、列 39「阶段实际完成时间」。
- **单元格是多行**（`\n` 分隔）的阶段验收款清单，每段格式：`阶段验收款N（PP.PP%）：YYYY-MM-DD`。
- 实际列同名段可能**无「：日期」**（= 未完成）。计划与实际**按段名 `阶段验收款N（PP.PP%）` 配对**。
- 一个项目常有 1–5+ 个阶段；段在单元格内**不按日期排序**。
- 现 `milestones.py` 只解析 13 类里程碑（`MILESTONE_DEFS`），**完全没读列 38/39**。

### 1.2 决策（brainstorm 确认）
- 每个「阶段验收款N（PP%）」→ 一个独立里程碑项，`name` **原样保留段名（去掉「：日期」）**，如 `阶段验收款1（20.00%）`。
- `planDate` = 计划段日期；`actualDate` = 实际同名段日期（无则空=未完成）。
- **视为关联回款 → 高优先**：`payStage = name`（→ `milestone_priority` 判高）、`payRatio = PP/100`。
- 新增标记字段 **`stage: bool`**（`true` 仅阶段项），供前端整行换色识别（**独立字段，不靠名称前缀**）。
- `/project/:id` 进度里程碑明细表**整体按 `planDate` 升序**（缺计划日期排末尾）；`stage=true` 行加**整行淡强调色底**（`--selected-tint`，主题感知、与状态语义色分离）。
- 报表/scope **自动流入**：阶段项进 `projectMilestones[pid]` 后自动被 `/insight/milestone`（到期提醒高桶 / 关键节点分布 / 延期清单）与 `/projects/temp` 里程碑谓词遍历；**不做特殊排除**。`/insight`（项目透视）不含里程碑维度，不动。「在建里程碑计划」tab 是固定 12 类列，阶段项不落该表列（设计边界）。

### 1.3 后端 `milestones.py`
新增常量与函数（放在 `parse_pay_stage_ratio` 之后、`row_to_milestones` 之前）：
```python
STAGE_PLAN_COL = "阶段计划完成时间"
STAGE_ACTUAL_COL = "阶段实际完成时间"
# 每段: 名称[：日期]。名称=冒号前(如 阶段验收款1（20.00%）);日期在中文/英文冒号后,可缺(未完成)。
_STAGE_ENTRY_RE = re.compile(r"^(.*?)\s*[：:]\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*$")

def _parse_stage_entries(cell):
    """'阶段计划/实际完成时间'单元格 → {段名: 日期}(多行按换行拆;无冒号日期段→日期空串)。"""
    out = {}
    for line in str(cell or "").splitlines():
        s = line.strip()
        if not s:
            continue
        m = _STAGE_ENTRY_RE.match(s)
        if m:
            name, date = m.group(1).strip(), _norm_date(m.group(2))
        else:
            name, date = s, ""     # 无日期段:整段即名称(未完成)
        if name:
            out[name] = date
    return out

def stage_milestones(row):
    """列 38/39 → 阶段验收款里程碑项(计划为准,按段名配实际日期)。"""
    plans = _parse_stage_entries(row.get(STAGE_PLAN_COL))
    actuals = _parse_stage_entries(row.get(STAGE_ACTUAL_COL))
    out = []
    for name, plan in plans.items():
        out.append({"name": name, "planDate": plan, "actualDate": actuals.get(name, ""),
                    "payStage": name, "pct": None, "payRatio": parse_pay_stage_ratio(name),
                    "priority": milestone_priority(name, name), "stage": True})
    return out
```
`row_to_milestones`：现有 13 类项每项补 `"stage": False`；循环后 `out.extend(stage_milestones(row))`。

### 1.4 `schema.py`
`MilestoneItem`（234-241）加：`stage: bool = False`（放 `priority` 后）。改后 `cd frontend && npm run gen:types` 重生成 `types/analysis.ts`（`MilestoneItem` 得 `stage`）。**注意 gen:types 会重写全部类型文件，仅保留 `analysis.ts` 的真实增量、`git checkout` 还原纯 EOL 扰动的其他文件**。

### 1.5 前端 `MilestoneTable.vue`
- 加 `computed sorted`：`[...items].sort` 按 `planDate` 升序、空串排末尾。
- `v-for` 改遍历 `sorted`；`<tr>` 加 `:class="{ 'ms-stage': i.stage }"`。
- scoped 样式加 `.ms-stage { background: var(--selected-tint); }`（淡强调底；引用令牌，不手写散值）。
- 修正 `ProjectDetailView.vue:375` 陈旧小标题「行色=优先级 红高/棕中/绿低」→ 改为反映现状（如「按计划时间排序；阶段验收款节点高亮」）。

### 1.6 报表回归（不改口径，仅验证不炸）
`/insight/milestone` 各块（`milestoneAnalytics.ts`/`milestoneDetailRows.ts`）与 `/projects/temp`（`tempScope.ts`/`tempFollowup.ts`）遍历 `projectMilestones` 逐项，阶段项字段齐全（name/planDate/actualDate/payStage/priority）→ 自动纳入。验证：里程碑相关 vitest 全绿、无运行期错误。

---

## Task 3 — 产品超支自动标签

### 2.1 决策（brainstorm 确认）
仿「佳杰」规则标签：只存 `tagSeed`（不落盘、前端合并、save 只写手动、自愈）。规则：`projectProfit[pid].rows` 中 `code=='2.1'（产品、商品成本）` 且 `remaining < 0` → 打「产品超支」。因走数据管线，**须点「更新数据」生效**。

### 2.2 `config.py`
- `TAG_SEED_WHITELIST`（102）加 `"产品超支"`。
- 加常量（放 `SIGN_UNIT_TAG_RULES` 附近）：
  ```python
  PRODUCT_OVERSPEND_TAG = "产品超支"
  PRODUCT_COST_SUBJECT_CODE = "2.1"   # 损益科目「产品、商品成本」
  ```

### 2.3 `preprocess_data.py`
新增（放 `derive_sign_unit_tag_seed` 后）：
```python
def derive_product_overspend_tag_seed(project_profit):
    """损益科目「产品、商品成本」(code==PRODUCT_COST_SUBJECT_CODE)剩余<0 → {pid:['产品超支']}。规则派生,不写标签文件。"""
    seed = {}
    for pid, data in (project_profit or {}).items():
        for r in (data or {}).get("rows", []):
            if r.get("code") == config.PRODUCT_COST_SUBJECT_CODE:
                rem = r.get("remaining")
                if isinstance(rem, (int, float)) and rem < 0:
                    seed[pid] = [config.PRODUCT_OVERSPEND_TAG]
                break     # 2.1 单行
    return seed

def merge_tag_seeds(*seeds):
    """合并多个 {pid:[tag]} 规则种子,按 pid 并集去重保序。"""
    out = {}
    for seed in seeds:
        for pid, tags in seed.items():
            cur = out.setdefault(pid, [])
            for t in tags:
                if t not in cur:
                    cur.append(t)
    return out
```
`final_data` 的 `"tagSeed"`（267）改为：
```python
"tagSeed": merge_tag_seeds(
    derive_sign_unit_tag_seed(dept_projects),
    derive_product_overspend_tag_seed(project_profit)),
```
（`project_profit` 在 185 行已可用；`dept_projects` 即原 sign-unit 入参。）

### 2.4 后端/前端无其他改动
`server.py:353-368` vocab 播种、`stores/projectTags.ts` seed∪manual 并集**已通用于任何白名单标签**，不改。「产品超支」自动进标签库 vocab、可用于 `/data` 按标签排除与各页标签筛选。

---

## 交付 / 验证

- **两项都非纯前端、都走数据管线**：升级须换 dist + 覆盖 `milestones.py`/`schema.py`/`config.py`/`preprocess_data.py`（+ `gen:types` 产物 `types/analysis.ts`）+ **重启后端 + 点一次「更新数据」** 才生效。无新页面/路由/pageKey/授权。
- 版本：**Y 级**（里程碑新增一类节点数据、跨 `/project/:id` + 里程碑报表；+ 新自动标签）。
- **验证**：
  - 后端 pytest：`stage_milestones`/`_parse_stage_entries`（多行拆分、计划实际按名配对、实际无日期→未完成、`payRatio` 从 PP% 抽取、`priority=high`、`stage=True`）；`row_to_milestones` 常规项带 `stage=False` 且行为不变；`derive_product_overspend_tag_seed`（2.1 剩余<0 命中、≥0 不命中、无 profit 空）；`merge_tag_seeds`（并集去重）。
  - 前端 vitest：`MilestoneTable` 按 planDate 排序（空串末尾）+ `stage` 行加 `ms-stage` 类；里程碑报表相关组件不因新增阶段项报错。
  - `verify.sh` 全绿（含 gen:types 后 typecheck/vitest/build）。
  - **真实数据冒烟**（人工，用户验收）：点「更新数据」后 `/project/:id` 看阶段验收款节点按计划时间排序、高亮；`/insight/milestone` 到期提醒含阶段项；某产品成本超支项目挂上「产品超支」标签。

## 不在本次范围（YAGNI）
- `/insight`（项目透视）加里程碑维度（用户确认只做 `/insight/milestone`）。
- 「在建里程碑计划」tab 为阶段项加固定列（阶段数不定，不适合固定列）。
- 阶段验收款与既有回款节点（`collection_stages`）的语义合并/去重（二者来源不同，本次只把阶段项作为里程碑展示）。
