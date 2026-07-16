# 阶段验收款里程碑 + 产品超支标签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ① 把 PMIS 里程碑两表列 38/39「阶段计划/实际完成时间」拆成阶段验收款里程碑项接入 `/project/:id` 与里程碑报表（高优先、换色、按计划时间排序）；② 新增「产品超支」自动规则标签（产品成本科目剩余<0）。

**Architecture:** 后端 `milestones.py` 解析多行阶段验收款→里程碑项（新 `stage` 标记字段，同步 `schema.py`+gen:types）；前端 `MilestoneTable.vue` 按 planDate 排序 + stage 行淡强调底。标签仿佳杰：`config.py` 白名单 + `preprocess_data.py` `derive_product_overspend_tag_seed` 并入 `tagSeed`。Task 2（首页待办卡）已核查=已应用标签排除，无改动。

**Tech Stack:** Python 标准库 + pydantic（后端）；Vue3 + TS + Vitest（前端）。

## Global Constraints

- 交流/文案 **简体中文**；**不使用任何 emoji**（需符号用 `→ ↓ ❌ ✕ ▾`）。
- 换色**只引用 theme.css 令牌**（阶段行用 `--selected-tint`），**不手写散值**；状态语义色不乱用。
- 里程碑项 `stage` 用**独立布尔字段**（不靠名称前缀判断）。
- 标签走「佳杰」同构：规则标签只进 `tagSeed`、不落盘、前端合并、save 只写手动。
- 阶段项命名 = 单元格段名去「：日期」原样保留，如 `阶段验收款1（20.00%）`；`payStage=name`（→高优先）、`payRatio=PP/100`。
- `/project/:id` 里程碑明细表**整表按 planDate 升序**、缺计划日期排末尾。
- 交付**非纯前端**：升级须换 dist + 覆盖后端 4 文件 + gen:types 产物 + 重启后端 + 点「更新数据」。**无需**为 `/insight` 加里程碑维度。
- 版本 **Y 级**；`gen:types` 会重写全部类型文件，仅留 `analysis.ts` 真实增量、其余 `git checkout` 还原 EOL 扰动。

## 执行波次（供 SDD/Workflow 并行）

- **后端里程碑链**：Task 1 → 2 → 3（`milestones.py` → `schema.py`+gen:types → 报表回归验证）。
- **标签链（独立）**：Task 4（`config.py`+`preprocess_data.py`）。
- **前端**：Task 5（`MilestoneTable.vue`+`ProjectDetailView.vue`，依赖 Task 2 的 gen:types 产物 `stage` 类型）。
- 并行：Task 1、Task 4 起点互不相交可并行；Task 2 依赖 1；Task 5 依赖 2（类型）；Task 3 依赖 1/2；Task 6 收口。
- Workflow：里程碑链（1→2→3）与标签链（4）两 pipeline 并行；前端 Task 5 待 Task 2 完成后接力。子代理照计划转写 + 跑 targeted 测试 + 不提交；控制者合并验证后串行提交。

---

### Task 1: `milestones.py` 解析阶段验收款

**Files:**
- Modify: `milestones.py`（加 `STAGE_PLAN_COL`/`STAGE_ACTUAL_COL`/`_STAGE_ENTRY_RE`/`_parse_stage_entries`/`stage_milestones`；`row_to_milestones` 常规项补 `stage:False` + 追加阶段项）
- Test: `tests/test_milestones_stage.py`

**Interfaces:**
- Produces: `stage_milestones(row: dict) -> list[dict]`（阶段项，字段 `name/planDate/actualDate/payStage/pct/payRatio/priority/stage`）；`row_to_milestones` 输出每项含 `stage: bool`

- [ ] **Step 1: 写失败测试**

创建 `tests/test_milestones_stage.py`：

```python
import milestones as M


def test_parse_stage_entries_multiline_and_no_date():
    plan = "阶段验收款1（20.00%）：2026-11-30\n\n阶段验收款2（5.00%）：2027-01-29"
    actual = "阶段验收款1（20.00%）：2026-06-12\n\n阶段验收款2（5.00%）"
    ep = M._parse_stage_entries(plan)
    ea = M._parse_stage_entries(actual)
    assert ep["阶段验收款1（20.00%）"] == "2026-11-30"
    assert ep["阶段验收款2（5.00%）"] == "2027-01-29"
    assert ea["阶段验收款1（20.00%）"] == "2026-06-12"
    assert ea["阶段验收款2（5.00%）"] == ""            # 无「：日期」→ 未完成


def test_stage_milestones_pairs_and_fields():
    row = {
        "阶段计划完成时间": "阶段验收款1（20.00%）：2026-11-30\n阶段验收款2（5.00%）：2027-01-29",
        "阶段实际完成时间": "阶段验收款1（20.00%）：2026-06-12\n阶段验收款2（5.00%）",
    }
    items = M.stage_milestones(row)
    assert [i["name"] for i in items] == ["阶段验收款1（20.00%）", "阶段验收款2（5.00%）"]
    i0 = items[0]
    assert i0["planDate"] == "2026-11-30" and i0["actualDate"] == "2026-06-12"
    assert i0["payStage"] == "阶段验收款1（20.00%）"
    assert i0["payRatio"] == 0.2                       # 20.00% → 0.2
    assert i0["priority"] == "high"                    # payStage 非空 → 高
    assert i0["stage"] is True
    assert items[1]["actualDate"] == ""                # 未完成


def test_stage_milestones_empty():
    assert M.stage_milestones({}) == []
    assert M.stage_milestones({"阶段计划完成时间": "", "阶段实际完成时间": ""}) == []


def test_row_to_milestones_marks_stage_flag():
    row = {"计划终验时间": "2026-05-01", "实际终验时间": "",
           "阶段计划完成时间": "阶段验收款1（30.00%）：2026-09-30", "阶段实际完成时间": ""}
    items = M.row_to_milestones(row)
    reg = [i for i in items if not i["stage"]]
    stg = [i for i in items if i["stage"]]
    assert any(i["name"] == "终验" for i in reg)       # 常规项 stage=False
    assert len(stg) == 1 and stg[0]["name"] == "阶段验收款1（30.00%）"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_milestones_stage.py -q`
Expected: FAIL（`AttributeError: module 'milestones' has no attribute '_parse_stage_entries'` 等）

- [ ] **Step 3: 改 `milestones.py`**

在 `parse_pay_stage_ratio`（88 行）之后、`row_to_milestones`（91 行）之前插入：

```python
STAGE_PLAN_COL = "阶段计划完成时间"
STAGE_ACTUAL_COL = "阶段实际完成时间"
# 每段: 名称[：日期]。名称=冒号前(如 阶段验收款1（20.00%）);日期在中文/英文冒号后,可缺(未完成)。
_STAGE_ENTRY_RE = re.compile(r"^(.*?)\s*[：:]\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*$")


def _parse_stage_entries(cell: Any) -> Dict[str, str]:
    """'阶段计划/实际完成时间'单元格 → {段名: 日期}(多行按换行拆;无冒号日期段→日期空串=未完成)。"""
    out: Dict[str, str] = {}
    for line in str(cell or "").splitlines():
        s = line.strip()
        if not s:
            continue
        m = _STAGE_ENTRY_RE.match(s)
        if m:
            name, date = m.group(1).strip(), _norm_date(m.group(2))
        else:
            name, date = s, ""
        if name:
            out[name] = date
    return out


def stage_milestones(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """列 38/39 阶段验收款 → 里程碑项(计划为准,按段名配实际日期;视为关联回款→高优先)。"""
    plans = _parse_stage_entries(row.get(STAGE_PLAN_COL))
    actuals = _parse_stage_entries(row.get(STAGE_ACTUAL_COL))
    out: List[Dict[str, Any]] = []
    for name, plan in plans.items():
        out.append({"name": name, "planDate": plan, "actualDate": actuals.get(name, ""),
                    "payStage": name, "pct": None, "payRatio": parse_pay_stage_ratio(name),
                    "priority": milestone_priority(name, name), "stage": True})
    return out
```

`row_to_milestones` 改为（常规项补 `"stage": False`，循环后追加阶段项）：

```python
def row_to_milestones(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """一行宽表 → 非全空类目里程碑(按 MILESTONE_DEFS 顺序) + 阶段验收款项。"""
    out = []
    for name, pcol, acol, paycol, pctcol in MILESTONE_DEFS:
        plan = _norm_date(row.get(pcol))
        actual = _norm_date(row.get(acol))
        pay = _norm_stage(row.get(paycol)) if paycol else ""
        pct = _norm_pct(row.get(pctcol)) if pctcol else None
        if not (plan or actual or pay or pct is not None):
            continue
        out.append({"name": name, "planDate": plan, "actualDate": actual,
                    "payStage": pay, "pct": pct, "payRatio": parse_pay_stage_ratio(pay),
                    "priority": milestone_priority(name, pay), "stage": False})
    out.extend(stage_milestones(row))
    return out
```

- [ ] **Step 4: 跑测试确认通过 + 里程碑既有测试回归**

Run: `python -m pytest tests/test_milestones_stage.py tests/test_milestones.py -q`
Expected: PASS（新测试通过；`test_milestones.py` 既有用例——若其断言里程碑项字段完全相等，可能因新增 `stage` 键失败，需在 Step 5 处理）

- [ ] **Step 5: 若既有 `test_milestones.py` 因 `stage` 键失败则修**

Run: `python -m pytest tests/test_milestones.py -q`
若失败且是「dict 相等断言缺 `stage` 键」：在对应期望 dict 补 `"stage": False`（阶段列为空时 `row_to_milestones` 不产阶段项，常规项均 `stage=False`）。仅改测试期望值、不改断言意图。
Expected（修后）: PASS

- [ ] **Step 6: 提交**

```bash
git add milestones.py tests/test_milestones_stage.py tests/test_milestones.py
git commit -m "feat(milestone): 解析阶段验收款(列38/39)为里程碑项(高优先+stage标记)"
```

---

### Task 2: `schema.py` MilestoneItem 加 `stage` + gen:types

**Files:**
- Modify: `schema.py:234-241`（`MilestoneItem` 加 `stage: bool = False`）
- Modify: `frontend/src/types/analysis.ts`（`npm run gen:types` 重生成）
- Test: `tests/test_schema_milestone_stage.py`

**Interfaces:**
- Consumes: `milestones.stage_milestones`（Task 1，产出含 `stage`）
- Produces: `MilestoneItem` 契约含 `stage: bool`；前端 `analysis.ts` 的 `MilestoneItem` 含 `stage`

- [ ] **Step 1: 写失败测试**

创建 `tests/test_schema_milestone_stage.py`：

```python
import schema


def test_milestone_item_has_stage_field():
    m = schema.MilestoneItem(name="阶段验收款1（20.00%）", stage=True)
    assert m.stage is True
    assert schema.MilestoneItem(name="终验").stage is False    # 默认 False


def test_milestone_item_accepts_stage_payload():
    m = schema.MilestoneItem.model_validate({
        "name": "阶段验收款1（20.00%）", "planDate": "2026-11-30", "actualDate": "",
        "payStage": "阶段验收款1（20.00%）", "payRatio": 0.2, "pct": None,
        "priority": "high", "stage": True})
    assert m.stage is True and m.payRatio == 0.2
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_schema_milestone_stage.py -q`
Expected: FAIL（`MilestoneItem` 无 `stage`；若 `_Base` 禁 extra 则 model_validate 抛错）

- [ ] **Step 3: 改 `schema.py`**

`MilestoneItem`（234-241）在 `priority` 行后加：

```python
    stage: bool = False  # true=阶段验收款项(列38/39派生),供前端换色
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_schema_milestone_stage.py -q`
Expected: PASS

- [ ] **Step 5: 重生成前端类型**

Run: `cd frontend && npm run gen:types`
然后 `git status`：确认 `src/types/analysis.ts` 的 `MilestoneItem` 增了 `stage`。**其他 `types/*.ts` 若仅 EOL 扰动**：`git checkout -- <那些文件>` 还原（用 `git diff --ignore-all-space <f>` 确认零内容差异）。

- [ ] **Step 6: 提交**

```bash
git add schema.py tests/test_schema_milestone_stage.py frontend/src/types/analysis.ts
git commit -m "feat(schema): MilestoneItem 加 stage 字段 + gen:types"
```

---

### Task 3: 里程碑报表 / temp scope 回归验证（阶段项自动流入不炸）

**Files:**
- Test: `tests/`（后端无源码改动，仅确认管线产出阶段项后 schema 校验通过）+ 前端里程碑相关 vitest（Task 5 一并跑）
- （本任务**无源码修改**，是「自动流入」的验证关；若发现某报表因阶段项异常，才回到相应文件修，并在此登记）

**Interfaces:**
- Consumes: Task 1/2 产物（`projectMilestones` 含阶段项、schema 含 `stage`）

- [ ] **Step 1: 后端管线级校验**

Run: `python -m pytest tests/ -q`
Expected: 全绿。重点确认 `test_schema*` / 任何构建 `projectMilestones` 并过 schema 的测试在阶段项存在时不报 pydantic 校验错（`stage` 已入契约）。

- [ ] **Step 2: 前端里程碑口径 vitest（自动流入不炸）**

Run: `cd frontend && npm run test:run -- src/lib/milestoneAnalytics.test.ts src/lib/milestoneDetailRows.test.ts src/lib/tempScope.test.ts`
（若某文件不存在则跳过该项；以实际存在的里程碑相关测试为准，可先 `ls src/lib | grep -i milestone`）
Expected: PASS —— 阶段项字段齐全（name/planDate/actualDate/payStage/priority），`milestoneAnalytics`/`milestoneDetailRows`/`tempScope` 遍历不报错。

- [ ] **Step 3: 若有回归失败 → 在对应文件最小修 + 登记**

仅当上面失败：定位（多半是某处 `assert nodes.length === 固定值` 未计阶段项）→ 最小修其期望或加阶段项过滤，记录到本任务。无失败则本任务仅为验证关、无提交。

- [ ] **Step 4: 提交（仅当有修改）**

```bash
git add <改动文件>
git commit -m "test(milestone): 阶段项自动流入报表/temp scope 回归"
```

---

### Task 4: 产品超支自动标签（`config.py` + `preprocess_data.py`）

**Files:**
- Modify: `config.py`（`TAG_SEED_WHITELIST` 加「产品超支」+ 两常量）
- Modify: `preprocess_data.py`（新 `derive_product_overspend_tag_seed` + `merge_tag_seeds`；`tagSeed` 装配改并集）
- Test: `tests/test_product_overspend_tag.py`

**Interfaces:**
- Produces: `derive_product_overspend_tag_seed(project_profit: dict) -> dict`；`merge_tag_seeds(*seeds) -> dict`

- [ ] **Step 1: 写失败测试**

创建 `tests/test_product_overspend_tag.py`：

```python
import preprocess_data as P
import config


def test_whitelist_has_product_overspend():
    assert "产品超支" in config.TAG_SEED_WHITELIST


def test_derive_product_overspend_hits_negative_2_1():
    profit = {
        "P1": {"rows": [{"code": "2.1", "name": "产品、商品成本", "remaining": -995.73},
                        {"code": "2", "name": "成本", "remaining": 100.0}]},
        "P2": {"rows": [{"code": "2.1", "name": "产品、商品成本", "remaining": 104.42}]},  # ≥0 不打
        "P3": {"rows": [{"code": "3", "name": "毛利", "remaining": -50.0}]},                # 非 2.1 不打
        "P4": {"rows": []},
    }
    seed = P.derive_product_overspend_tag_seed(profit)
    assert seed == {"P1": ["产品超支"]}


def test_derive_product_overspend_empty():
    assert P.derive_product_overspend_tag_seed({}) == {}
    assert P.derive_product_overspend_tag_seed(None) == {}


def test_merge_tag_seeds_union_dedup():
    a = {"P1": ["佳杰"], "P2": ["佳杰"]}
    b = {"P1": ["产品超支"], "P3": ["产品超支"]}
    merged = P.merge_tag_seeds(a, b)
    assert merged["P1"] == ["佳杰", "产品超支"]      # 并集保序
    assert merged["P2"] == ["佳杰"] and merged["P3"] == ["产品超支"]


def test_merge_tag_seeds_no_dup():
    assert P.merge_tag_seeds({"P1": ["佳杰"]}, {"P1": ["佳杰"]}) == {"P1": ["佳杰"]}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_product_overspend_tag.py -q`
Expected: FAIL（`config.TAG_SEED_WHITELIST` 无「产品超支」；`preprocess_data` 无 `derive_product_overspend_tag_seed`/`merge_tag_seeds`）

- [ ] **Step 3a: 改 `config.py`**

`TAG_SEED_WHITELIST`（102）末尾加 `"产品超支"`：

```python
TAG_SEED_WHITELIST = ["BH项目", "框架合同", "退换货项目", "项目已关闭", "SM项目", "0元订单项目", "佳杰", "产品超支"]
```

`SIGN_UNIT_TAG_RULES`（105）之后加：

```python
PRODUCT_OVERSPEND_TAG = "产品超支"
PRODUCT_COST_SUBJECT_CODE = "2.1"   # 损益科目「产品、商品成本」
```

- [ ] **Step 3b: 改 `preprocess_data.py`**

`derive_sign_unit_tag_seed`（99-106）之后加：

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

`final_data` 的 `"tagSeed"` 行（267）改为：

```python
        "tagSeed": merge_tag_seeds(
            derive_sign_unit_tag_seed(dept_projects),
            derive_product_overspend_tag_seed(project_profit)),
```

（确认 `project_profit` 变量在该处作用域内可用——185 行 `project_profit, pf_stats = profit_mod.load_profit(...)`；`dept_projects` 即原 `derive_sign_unit_tag_seed` 入参，保持不变。）

- [ ] **Step 4: 跑测试确认通过 + 后端回归**

Run: `python -m pytest tests/test_product_overspend_tag.py -q`
Expected: PASS
Run: `python -m pytest tests/ -q`
Expected: 全绿（既有标签测试 `tests/test_server_tags.py` 不受影响——vocab 播种对任意白名单标签通用）

- [ ] **Step 5: 提交**

```bash
git add config.py preprocess_data.py tests/test_product_overspend_tag.py
git commit -m "feat(tags): 产品超支自动规则标签(产品成本科目2.1剩余<0)并入tagSeed"
```

---

### Task 5: 前端 `MilestoneTable.vue` 排序 + stage 换色 + 文案修正

**Files:**
- Modify: `frontend/src/components/MilestoneTable.vue`（sorted computed + stage 行类 + 样式）
- Modify: `frontend/src/views/ProjectDetailView.vue:375`（陈旧小标题文案）
- Test: `frontend/src/components/MilestoneTable.test.ts`（若存在则追加，否则新建）

**Interfaces:**
- Consumes: `MilestoneItem.stage`（Task 2 gen:types 产物）

- [ ] **Step 1: 写失败测试**

创建/追加 `frontend/src/components/MilestoneTable.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MilestoneTable from './MilestoneTable.vue'

const items = [
  { name: '终验', planDate: '2026-05-01', actualDate: '', payStage: '', payRatio: null, pct: null, priority: 'high', stage: false },
  { name: '阶段验收款1（20.00%）', planDate: '2026-03-01', actualDate: '', payStage: '阶段验收款1（20.00%）', payRatio: 0.2, pct: null, priority: 'high', stage: true },
  { name: '项目启动', planDate: '', actualDate: '2026-01-01', payStage: '', payRatio: null, pct: null, priority: 'low', stage: false },
] as never[]

describe('MilestoneTable', () => {
  it('按计划时间升序、缺计划时间排末尾', () => {
    const w = mount(MilestoneTable, { props: { items } })
    const names = w.findAll('.ms-name').map((n) => n.text())
    expect(names).toEqual(['阶段验收款1（20.00%）', '终验', '项目启动'])  // 03-01 < 05-01 < 空
  })

  it('stage 行加 ms-stage 类,常规行不加', () => {
    const w = mount(MilestoneTable, { props: { items } })
    const rows = w.findAll('tbody tr')
    const stageRow = rows.find((r) => r.text().includes('阶段验收款1'))
    const regRow = rows.find((r) => r.text().includes('终验'))
    expect(stageRow!.classes()).toContain('ms-stage')
    expect(regRow!.classes()).not.toContain('ms-stage')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- src/components/MilestoneTable.test.ts`
Expected: FAIL（当前无排序、无 `ms-stage` 类）

- [ ] **Step 3: 改 `MilestoneTable.vue`**

完整替换为：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { MilestoneItem } from '@/types/analysis'

// 项目里程碑表:整表按计划时间升序(缺计划时间排末尾);阶段验收款项(stage)整行淡强调底区分。
const props = defineProps<{ items: MilestoneItem[] }>()
const done = (i: MilestoneItem) => !!i.actualDate
const sorted = computed(() => [...props.items].sort((a, b) => {
  const pa = a.planDate || '', pb = b.planDate || ''
  if (!pa && !pb) return 0
  if (!pa) return 1
  if (!pb) return -1
  return pa < pb ? -1 : pa > pb ? 1 : 0
}))
</script>

<template>
  <table class="ms-table">
    <thead>
      <tr><th>里程碑</th><th>计划时间</th><th>实际时间</th><th>关联回款阶段</th><th>状态</th></tr>
    </thead>
    <tbody>
      <tr v-for="(i, idx) in sorted" :key="idx" :class="{ 'ms-stage': i.stage }">
        <td class="ms-name">{{ i.name }}</td>
        <td class="u-num">{{ i.planDate || '-' }}</td>
        <td class="u-num">{{ i.actualDate || '-' }}</td>
        <td>{{ i.payStage || '-' }}</td>
        <td><span class="ms-status" :class="{ done: done(i) }">{{ done(i) ? '已完成' : '未完成' }}</span></td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.ms-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.ms-table th, .ms-table td { padding: var(--sp-2) var(--sp-3); text-align: left; border-bottom: 1px solid var(--line); }
.ms-table th { color: var(--sub); font-weight: 600; font-size: var(--fs-1); }
.ms-name { color: var(--txt); font-weight: 600; }
.ms-status { color: var(--mut); font-size: var(--fs-1); }
.ms-status.done { color: var(--ok-text); font-weight: 600; }
/* 阶段验收款项整行淡强调底(引用令牌,与状态语义色分离) */
.ms-stage { background: var(--selected-tint); }
</style>
```

- [ ] **Step 4: 修正陈旧文案 `ProjectDetailView.vue:375`**

先 Read `ProjectDetailView.vue` 375 行附近，定位「行色=优先级 红高/棕中/绿低」文案，改为反映现状，例如：
```
「进度里程碑（按计划时间排序；阶段验收款节点高亮）」
```
（保持与周边小标题写法一致；只改这句陈旧描述，不动其他。）

- [ ] **Step 5: 跑测试确认通过 + 前端 typecheck**

Run: `cd frontend && npm run test:run -- src/components/MilestoneTable.test.ts`
Expected: PASS
Run: `cd frontend && npm run typecheck`
Expected: 无错误（`MilestoneItem.stage` 已由 Task 2 gen:types 生成）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/MilestoneTable.vue frontend/src/views/ProjectDetailView.vue frontend/src/components/MilestoneTable.test.ts
git commit -m "feat(milestone): /project/:id 里程碑表按计划时间排序 + 阶段项换色 + 文案修正"
```

---

### Task 6: 版本 + PROGRESS + 全量验证（收口）

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 版本号**

`frontend/src/version.ts`：`APP_VERSION` `V3.3.0` → `V3.4.0`（Y 级）；`RELEASE_DATE` → `2026-07-16`。

- [ ] **Step 2: PROGRESS 条目**

`PROGRESS.md` 顶部插 `- 当前版本：**V3.4.0**（Y 级·**阶段验收款里程碑接入 + 产品超支标签**）...`，原 `- 当前版本：**V3.3.0**` 改 `- 上一版本`。条目写：Task1（列38/39 拆多行阶段验收款→里程碑项、高优先/换色/整表按计划时间排序、schema `stage` 字段、自动流入 `/insight/milestone` 与 temp scope）；Task2（首页待办卡已应用标签排除、无改动）；Task3（产品成本 2.1 剩余<0 自动打「产品超支」seed 标签、并入 tagSeed）；交付非纯前端（换 dist + 覆盖 milestones/schema/config/preprocess + gen:types + 重启 + 点更新数据）。

- [ ] **Step 3: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。
或分步：`python -m pytest -q` + `cd frontend && npm run typecheck && npm run test:run && npm run build`。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V3.4.0 阶段验收款里程碑 + 产品超支标签 + PROGRESS"
```

---

## Self-Review（写计划后自检）

- **Spec 覆盖**：Task1 解析（Task 1）+ schema/gen:types（Task 2）+ 前端排序换色文案（Task 5）+ 报表自动流入验证（Task 3）；Task3 标签（Task 4）；Task2 无改动（spec §0 记录，计划不设任务）；版本/交付（Task 6）。无遗漏。
- **占位扫描**：无 TBD/TODO；代码完整。Task 5 Step 4 文案需先 Read 定位（给了替换文案与定位锚点，非占位）。
- **类型一致**：`stage` 字段贯穿 milestones.py（Task1 产 `stage:bool`）→ schema.py（Task2 `stage: bool = False`）→ analysis.ts（gen:types）→ MilestoneTable（Task5 `i.stage`）；`derive_product_overspend_tag_seed`/`merge_tag_seeds` 签名在 Task4 定义与 spec 一致；`config.PRODUCT_OVERSPEND_TAG`/`PRODUCT_COST_SUBJECT_CODE` 跨 config/preprocess 一致。
- **风险点**：既有 `tests/test_milestones.py` 可能因新增 `stage` 键做整 dict 相等断言而失败 → Task 1 Step 5 已预置修法。
```
