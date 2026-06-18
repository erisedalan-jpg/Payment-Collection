# PMIS 数据血缘扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 projectPmis / projects / meta 的字段口径扩展并换源到 PMIS 九表，脱离 WPS 与历史 bug 字段。

**Architecture:** 后端纯函数为主（pmis/milestones/projects 三模块 + preprocess 编排），改字段映射与口径；schema.py 单一类型源经 gen:types 同步到前端 analysis.ts；前端按新键改展示与日历筛选。先后端→schema→前端，TDD 每步先改/补测试。

**Tech Stack:** Python 3.8+（stdlib + openpyxl + pydantic）、Vue3 + Vite + TS + Pinia + Element Plus、pytest、vitest。

## Global Constraints

- 简体中文沟通；**全程禁用 emoji**，符号用 `→ ↓ ❌ ✕ ▾`。
- 根目录未跟踪文件 `看板数据取值条件与计算公式.md` **永不提交**：禁止 `git add -A` / `git add .`，每次提交只逐路径 `git add`。
- 版本单一来源 `frontend/src/version.ts`；本子项目 Y 级，落版本只改此处 + PROGRESS 头部同步。
- 提交信息结尾恒为：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- PMIS/preprocess 运行命令前缀：`PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python ...`。
- 删除/迁移类任务（本计划 Task 3/5/7）必须跑**全量** pytest + 全量 vitest，不止窄单测。
- **projectPmis.team 的 L3-1 字段 JSON 键用下划线 `L3_1部门`**（Python/TS 标识符合法、可声明可生成类型）；源列仍为 `base.项目经理L3-1部门`；前端展示标签写 "L3-1部门"。projects 层字段为 `orgL3_1`。
- 售前判定常量 `config.PRESALE_PROJECT_TYPE = "售前服务类"`，与终验时间取列共用。
- PMIS 表头第 2 行（`config.PMIS_HEADER_ROW=2`）；join key=项目编号。源列精确名见 spec `docs/superpowers/specs/2026-06-18-pmis-lineage-expansion-design.md` §3。
- schema 所有模型含 `extra="allow"` → 生成的 TS interface 均带 `[k: string]: unknown` 索引签名：**删/改字段不会触发 typecheck 报错**（会静默落到 unknown），故前端换名必须逐点手改，不能依赖 typecheck 兜底。

---

### Task 1: pmis.py — projectPmis 字段扩展 + 在建 universe 收敛

**Files:**
- Modify: `pmis.py`（`derive_cost` 97-108、`_assemble` 154-198、`build_project_pmis` 310-330）
- Test: `tests/test_pmis.py`

**Interfaces:**
- Produces: `_assemble(...)` 返回的 dict 中 `team` 含键 `项目名称/项目经理/L4部门/L3部门/L3_1部门/AR/SR/CSR/CDR/Sponsor`；`customer` 含 `最终客户/合同编号(center优先)/签约单位/行业/合同总额`（不含 `签约形式`）；`status` 增 `关键动作/交付物`；`cost` 含 `项目超支/交付超支`（不含 `超支`）；`progress` 不再含 `计划终验`（`终验时间` 由 Task 4 回填）。
- Produces: `build_project_pmis` 在建集 = `center.keys()`（已关闭逻辑不变）。
- Consumes（Task 3/4）：`pm["team"]["L3_1部门"]`、`pm["status"]["项目类型"]`、`pm["cost"]["项目超支"]`、`pm["customer"]["合同编号"]`。

- [ ] **Step 1: 改测试 — derive_cost 新口径（项目超支/交付超支）**

替换 `tests/test_pmis.py` 的 `class TestDeriveCost`（约 79-90 行）为：

```python
class TestDeriveCost:
    def test_consume_ratio_overrun_and_delivery(self):
        row = {"项目总预算（元）": "1000", "项目核算（元）": "600", "剩余预算（元）": "-50",
               "成本状态": "黄色预警"}
        center = {"是否交付部门人工成本超支": "是"}
        cost = M.derive_cost(row, center)
        assert cost["消耗比"] == pytest.approx(0.6)
        assert cost["项目超支"] is True       # 剩余预算 -50 < 0
        assert cost["交付超支"] is True        # 中心:是否交付部门人工成本超支==是
        assert cost["成本状态"] == "黄色预警"
        assert "超支" not in cost              # 旧键已移除

    def test_no_overrun(self):
        cost = M.derive_cost({"剩余预算（元）": "400"}, {"是否交付部门人工成本超支": "否"})
        assert cost["项目超支"] is False and cost["交付超支"] is False

    def test_zero_budget_ratio_none(self):
        cost = M.derive_cost({"项目总预算（元）": "0", "项目核算（元）": "0"}, {})
        assert cost["消耗比"] is None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_pmis.py::TestDeriveCost -q`
Expected: FAIL（cost 仍含 `超支`，无 `项目超支/交付超支`）

- [ ] **Step 3: 改 derive_cost 实现**

`pmis.py` 替换 `derive_cost`（97-108）为：

```python
def derive_cost(status_row: Dict[str, Any], center_row: Dict[str, Any]) -> Dict[str, Any]:
    """成本维度:消耗比、项目超支(剩余预算<0)、交付超支(中心交付部门人工成本超支)、各金额。"""
    total = parse_pmis_money(status_row.get("项目总预算（元）"))
    used = parse_pmis_money(status_row.get("项目核算（元）"))
    remain = parse_pmis_money(status_row.get("剩余预算（元）"))
    ratio = (used / total) if (total and total > 0 and used is not None) else None
    over_project = (remain is not None and remain < 0)
    over_delivery = (str(center_row.get("是否交付部门人工成本超支") or "").strip() == "是")
    return {"总预算": total, "核算": used, "剩余预算": remain, "消耗比": ratio,
            "项目超支": over_project, "交付超支": over_delivery,
            "成本状态": (status_row.get("成本状态") or None)}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_pmis.py::TestDeriveCost -q`
Expected: PASS

- [ ] **Step 5: 改测试 — _assemble team/customer/status 新字段**

在 `tests/test_pmis.py` 的 `class TestAssembleTeamAndRisks` 内：把 `test_team_from_center_then_base`（222-226）的最后一行 `assert out["team"] == {...}` 改为逐字段断言，并新增三个测试：

```python
    def test_team_from_center_then_base(self):
        base_i = {"P1": {"项目经理（FR）": "李四", "项目经理L4部门": "银行服务组", "项目名称": "B名"}}
        center_i = {"P1": {"项目经理": "张三", "项目名称": "C名"}}
        out = M._assemble("P1", base_i, center_i, {}, {}, "在建")
        assert out["team"]["项目名称"] == "C名"
        assert out["team"]["项目经理"] == "张三"
        assert out["team"]["L4部门"] == "银行服务组"
        assert out["team"]["AR"] is None        # base 无该列 → None

    def test_team_extended_fields_from_base(self):
        base_i = {"P1": {"项目经理L3部门": "三部", "项目经理L3-1部门": "三部一组",
                         "客户经理（AR）": "AR人", "方案经理（SR）": "SR人",
                         "安全运行经理（CSR）": "CSR人", "定制经理（CDR）": "CDR人",
                         "Sponsor": "老板"}}
        t = M._assemble("P1", base_i, {}, {}, {}, "在建")["team"]
        assert t["L3部门"] == "三部" and t["L3_1部门"] == "三部一组"
        assert t["AR"] == "AR人" and t["SR"] == "SR人" and t["CSR"] == "CSR人"
        assert t["CDR"] == "CDR人" and t["Sponsor"] == "老板"

    def test_customer_signing_unit_and_contract_center_priority(self):
        base_i = {"P1": {"签约单位": "甲方单位", "合同编号": "B-001", "最终客户": "客A",
                         "行业中类": "金融", "合同总额（元）": "1000"}}
        center_i = {"P1": {"合同编号": "C-001"}}
        cust = M._assemble("P1", base_i, center_i, {}, {}, "在建")["customer"]
        assert cust["签约单位"] == "甲方单位"
        assert cust["合同编号"] == "C-001"      # center 优先
        assert "签约形式" not in cust
        cust2 = M._assemble("P1", base_i, {}, {}, {}, "在建")["customer"]
        assert cust2["合同编号"] == "B-001"      # center 缺 → 回退 base

    def test_status_key_action_and_deliverable(self):
        status_i = {"P1": {"关键动作完成情况(必须-考核)": "已完成",
                           "交付物上传情况(必须-考核)": "3/3"}}
        st = M._assemble("P1", {}, {}, status_i, {}, "在建")["status"]
        assert st["关键动作"] == "已完成" and st["交付物"] == "3/3"
```

- [ ] **Step 6: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_pmis.py::TestAssembleTeamAndRisks -q`
Expected: FAIL（新字段未实现）

- [ ] **Step 7: 改 _assemble 实现**

`pmis.py` 中 `_assemble` 的 `return {...}`（167-198）替换 `progress`/`status`/`customer`/`team` 四块为：

```python
        "progress": {
            "完工进展": parse_pmis_pct(s.get("项目累计完工进展百分比")),
            "里程碑进度状态": (s.get("里程碑进度状态") or None),
            "项目阶段": (s.get("项目阶段") or c.get("项目阶段") or None),
        },
        "risk": risk,
        "status": {
            "项目状态": (b.get("项目状态") or s.get("项目状态") or None),
            "是否暂停": paused,
            "评级": (s.get("项目评级") or None),
            "项目级别": (b.get("项目级别") or s.get("项目级别") or None),
            "项目类型": (b.get("项目类型") or s.get("项目类型") or None),
            "评分": parse_pmis_money(b.get("项目评分")),
            "关键动作": (s.get("关键动作完成情况(必须-考核)") or None),
            "交付物": (s.get("交付物上传情况(必须-考核)") or None),
        },
        "customer": {
            "最终客户": (b.get("最终客户") or None),
            "合同编号": (c.get("合同编号") or b.get("合同编号") or None),
            "签约单位": (b.get("签约单位") or None),
            "行业": (b.get("行业中类") or None),
            "合同总额": parse_pmis_money(b.get("合同总额（元）")),
        },
        "team": {
            "项目名称": (c.get("项目名称") or b.get("项目名称") or None),
            "项目经理": (c.get("项目经理") or b.get("项目经理（FR）") or None),
            "L4部门": (b.get("项目经理L4部门") or None),
            "L3部门": (b.get("项目经理L3部门") or None),
            "L3_1部门": (b.get("项目经理L3-1部门") or None),
            "AR": (b.get("客户经理（AR）") or None),
            "SR": (b.get("方案经理（SR）") or None),
            "CSR": (b.get("安全运行经理（CSR）") or None),
            "CDR": (b.get("定制经理（CDR）") or None),
            "Sponsor": (b.get("Sponsor") or None),
        },
```

（注：删掉了 `progress` 里旧的 `"计划终验": (...)` 行；删掉了 `customer` 里旧的 `"签约形式": (...)` 行。）

- [ ] **Step 8: 跑测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_pmis.py::TestAssembleTeamAndRisks -q`
Expected: PASS

- [ ] **Step 9: 改测试 — build_project_pmis 在建 universe=center.keys()**

`tests/test_pmis.py` 的 `TestBuildProjectPmis.test_pause_false_and_risk_override`（137-147）给 SS-2 补 center 行（否则 center-only 后 SS-2 不入在建）：

```python
    def test_pause_false_and_risk_override(self):
        active = {
            "base": [{"项目编号": "SS-2", "是否暂停": "否", "项目状态": "实施中"}],
            "center": [{"项目编号": "SS-2"}],
            "status": [{"项目编号": "SS-2", "未关闭风险数量": "3/5"}],
            "risk": [{"项目编号": "SS-2", "风险等级": "低", "风险状态": "已识别"}],
        }
        pm = M.build_project_pmis(active, {}, set())
        assert pm["SS-2"]["status"]["是否暂停"] is False
        assert pm["SS-2"]["risk"]["未关闭风险数"] == 3
```

并新增一个测试，证明仅在 center 的 pid 入在建、仅在 base/status 的不入：

```python
    def test_active_universe_is_center_only(self):
        active = {
            "base": [{"项目编号": "ONLY-BASE", "项目名称": "x"},
                     {"项目编号": "IN-CENTER", "项目名称": "c"}],
            "center": [{"项目编号": "IN-CENTER"}],
            "status": [{"项目编号": "ONLY-STATUS"}],
            "risk": [],
        }
        pm = M.build_project_pmis(active, {}, set())
        assert "IN-CENTER" in pm
        assert "ONLY-BASE" not in pm and "ONLY-STATUS" not in pm
```

- [ ] **Step 10: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_pmis.py::TestBuildProjectPmis -q`
Expected: FAIL（`test_active_universe_is_center_only` 失败：ONLY-BASE 仍入在建）

- [ ] **Step 11: 改 build_project_pmis 实现**

`pmis.py` 中 `build_project_pmis` 的在建循环（320-321）：

```python
    # 旧: for pid in a_base.keys() | a_center.keys() | a_status.keys():
    for pid in a_center.keys():
        out[pid] = _assemble(pid, a_base, a_center, a_status, a_risk, "在建")
```

- [ ] **Step 12: 跑全量 pmis 测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_pmis.py -q`
Expected: PASS（全绿）

- [ ] **Step 13: Commit**

```bash
git add pmis.py tests/test_pmis.py
git commit -m "feat(pmis): projectPmis 字段扩展(team+7/签约单位/合同编号center优先/关键动作交付物/项目超支交付超支)+在建universe仅中心

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: config 常量 + milestones.final_acceptance_date

**Files:**
- Modify: `config.py`（PMIS 区，约 56-86 行附近）
- Modify: `milestones.py`（文件末尾追加）
- Test: `tests/test_milestones.py`

**Interfaces:**
- Produces: `config.PRESALE_PROJECT_TYPE = "售前服务类"`。
- Produces: `milestones.final_acceptance_date(items, project_type) -> Optional[str]`，售前服务类取 `服务完成.planDate`，否则取 `终验.planDate`，缺/空 → None。
- Consumes: `milestones.row_to_milestones` 产出的 item 含 `name` / `planDate`（已存在）。

- [ ] **Step 1: 加 config 常量**

`config.py` 在 `PRESALE_PREFIX = "售前服务"`（86 行）下一行追加：

```python
PRESALE_PROJECT_TYPE = "售前服务类"  # 售前判定(取代 name.startswith);与终验时间取列共用
```

- [ ] **Step 2: 写失败测试**

`tests/test_milestones.py` 文件末尾追加：

```python
def test_final_acceptance_date():
    import milestones as M
    items = [{"name": "终验", "planDate": "2026-07-01"},
             {"name": "服务完成", "planDate": "2026-08-01"}]
    assert M.final_acceptance_date(items, "实施项目") == "2026-07-01"      # 非售前→终验
    assert M.final_acceptance_date(items, "售前服务类") == "2026-08-01"    # 售前→服务完成
    assert M.final_acceptance_date([{"name": "初验", "planDate": "2026-06-01"}], "实施项目") is None
    assert M.final_acceptance_date([{"name": "终验", "planDate": ""}], "实施项目") is None
    assert M.final_acceptance_date([], "售前服务类") is None
```

- [ ] **Step 3: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_milestones.py::test_final_acceptance_date -q`
Expected: FAIL（`AttributeError: module 'milestones' has no attribute 'final_acceptance_date'`）

- [ ] **Step 4: 实现 final_acceptance_date**

`milestones.py` 文件末尾追加：

```python
def final_acceptance_date(items: List[Dict[str, Any]], project_type: Any) -> Optional[str]:
    """按项目类型取里程碑计划日:售前服务类→服务完成.planDate,否则→终验.planDate。缺/空→None。"""
    target = "服务完成" if str(project_type or "").strip() == config.PRESALE_PROJECT_TYPE else "终验"
    for it in items or []:
        if it.get("name") == target:
            return it.get("planDate") or None
    return None
```

- [ ] **Step 5: 跑测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_milestones.py -q`
Expected: PASS（含新测试，旧测试不受影响）

- [ ] **Step 6: Commit**

```bash
git add config.py milestones.py tests/test_milestones.py
git commit -m "feat(milestones): final_acceptance_date(按项目类型取终验/服务完成计划日)+config.PRESALE_PROJECT_TYPE

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: projects.py — orgL3_1/合同编号/isPresale 换源 + 已关闭计数 + 完成率统一

**Files:**
- Modify: `projects.py`（`read_org_l3_map` 69-80 删除、`build_payment_summary` 148-163、`compute_health` 182-195、`build_projects` 198-241、`load_dept_projects` 291-303、顶部 import 10）
- Test: `tests/test_projects.py`

**Interfaces:**
- Consumes（Task 1）：`pm["team"]["L3_1部门"]`、`pm["status"]["项目类型"]`、`pm["cost"]["项目超支"]`、`pm["customer"]["合同编号"]`。
- Consumes：`config.PRESALE_PROJECT_TYPE`（Task 2）。
- Produces：`build_projects(project_pmis, org_names, org_l4s, mapping, delivery_rows)`（**去掉 org_l3_map 形参**），输出 project 含 `orgL3_1` / `合同编号` / `isPresale`（按项目类型）。
- Produces：`count_closed_dept(pmis_dir, org_names) -> int`。
- Produces：`load_dept_projects` 的 quality 增 `closedDeptCount`。
- Produces：`build_payment_summary` 返回 dict **不含 paymentRatio**。
- Produces：`compute_health` 的 costAbnormal 以 `cost["项目超支"]` 判定。

- [ ] **Step 1: 改测试 — compute_health 用 项目超支**

`tests/test_projects.py` 的 `class TestComputeHealth`：把 `_pm` 里 `"cost": {"超支": False, ...}` 改 `"项目超支"`，并改 `test_cost_abnormal_by_ratio_or_overrun`：

```python
    def _pm(self, **over):
        pm = {"progress": {"里程碑进度状态": "正常"},
              "risk": {"最高等级": "低", "未关闭风险数": 0},
              "cost": {"项目超支": False, "消耗比": 0.5}}
        pm.update(over)
        return pm
```
```python
    def test_cost_abnormal_by_ratio_or_overrun(self):
        assert P.compute_health(self._pm(cost={"项目超支": True, "消耗比": 0.2}), 0)["costAbnormal"]
        assert P.compute_health(self._pm(cost={"项目超支": None, "消耗比": 1.2}), 0)["costAbnormal"]
        assert not P.compute_health(self._pm(cost={"项目超支": None, "消耗比": None}), 0)["costAbnormal"]
```

- [ ] **Step 2: 改测试 — _pm_active 带 status/L3_1 + build_projects 5 参 + orgL3_1/合同编号/isPresale**

替换 `tests/test_projects.py` 的 `_pm_active` 辅助（143-150）：

```python
def _pm_active(name, manager, l4="黑龙江服务组", project_type="实施项目", l3_1="三部一组", **over):
    pm = {"matched": True, "source": "在建",
          "team": {"项目名称": name, "项目经理": manager, "L4部门": l4, "L3_1部门": l3_1},
          "progress": {"里程碑进度状态": "正常"},
          "risk": {"最高等级": None, "未关闭风险数": 0},
          "cost": {"项目超支": None, "消耗比": None},
          "status": {"项目类型": project_type},
          "customer": {"合同编号": "HT-" + (name or "x")}}
    pm.update(over)
    return pm
```

`TestBuildProjects.test_presale_mapping_and_payment`（168-179）：售前需带类型，断言新字段：

```python
    def test_presale_mapping_and_payment(self):
        ppm = {"SF-1": _pm_active("售前服务A", "佘海龙", project_type="售前服务类")}
        mapping = [{"current": "SF-1", "owner": "于江", "closed": "SS-99"}]
        delivery = [{"项目编号": "SF-1", "项目名称": "售前服务A", "差旅费_预算金额": 100}]
        out = P.build_projects(ppm, {"佘海龙"}, {"黑龙江服务组"}, mapping, delivery)
        p = out[0]
        assert p["isPresale"] is True
        assert p["relatedClosedId"] == "SS-99"
        assert p["orgL3_1"] == "三部一组"
        assert p["合同编号"] == "HT-售前服务A"
        assert "orgL3" not in p
        assert next(i for i in p["deliveryCosts"] if i["类别"] == "差旅费")["预算金额"] == 100.0
```

`TestProjectsQuality.test_quality_counts_and_alerts`（195-212）：SF-1 改带售前类型（否则 presaleTotal=0）：

```python
        ppm = {
            "SF-1": _pm_active("售前服务A", "佘海龙", project_type="售前服务类"),
            "SS-2": _pm_active("漏网项目", "王漏网", l4="黑龙江服务组"),
        }
```

- [ ] **Step 3: 改测试 — 删 read_org_l3_map 测试、改 orgL3 测试为 orgL3_1、删 paymentRatio 断言、加 count_closed_dept**

`tests/test_projects.py` 删除整个 `class TestOrgL3Map`（297-314），替换为：

```python
class TestOrgL31AndContract:
    def test_build_projects_sets_orgL3_1_and_contract(self):
        pmis = {"P1": {"source": "在建", "matched": True,
                       "team": {"项目经理": "张三", "项目名称": "甲", "L4部门": "北京服务组",
                                "L3_1部门": "三部一组"},
                       "status": {"项目类型": "实施项目"},
                       "customer": {"合同编号": "HT-1"}}}
        projs = P.build_projects(pmis, {"张三"}, {"北京服务组"}, [], [])
        assert projs[0]["orgL3_1"] == "三部一组"
        assert projs[0]["合同编号"] == "HT-1"
        assert projs[0]["isPresale"] is False

    def test_isPresale_by_project_type(self):
        pmis = {"P1": {"source": "在建", "matched": True,
                       "team": {"项目经理": "张三", "项目名称": "未命名", "L4部门": "北京服务组",
                                "L3_1部门": "组"},
                       "status": {"项目类型": "售前服务类"}, "customer": {}}}
        projs = P.build_projects(pmis, {"张三"}, set(), [], [])
        assert projs[0]["isPresale"] is True


class TestCountClosedDept:
    def test_counts_manager_in_org(self, tmp_path):
        import openpyxl, os as _os
        d = tmp_path / "pmis"; d.mkdir()
        wb = openpyxl.Workbook(); ws = wb.active
        ws.cell(row=1, column=1, value="标题")
        ws.cell(row=2, column=1, value="项目编号"); ws.cell(row=2, column=2, value="项目经理")
        ws.cell(row=3, column=1, value="C-1"); ws.cell(row=3, column=2, value="张三")
        ws.cell(row=4, column=1, value="C-2"); ws.cell(row=4, column=2, value="外部人")
        wb.save(str(d / config.PMIS_FILES_CLOSED["center"]))
        assert P.count_closed_dept(str(d), {"张三"}) == 1
        assert P.count_closed_dept(str(d), set()) == 0
        assert P.count_closed_dept(str(tmp_path / "none"), {"张三"}) == 0
```

`TestBuildPaymentSummary`（274-294）删去 paymentRatio 断言：

```python
    def test_summary_from_nodes(self):
        import projects as PJ
        nodes = [self._node("到货款", 700000.0, True, "已回款"),
                 self._node("终验款", 300000.0, False, "延期")]
        rec = {"total": 700000.0, "count": 2, "lastDate": "2026-06-04"}
        s = PJ.build_payment_summary(1000000.0, nodes, rec)
        assert s["contract"] == 1000000.0 and s["actualTotal"] == 700000.0 and s["paymentCount"] == 2
        assert "paymentRatio" not in s
        assert s["expectedTotal"] == 1000000.0
        assert s["nodeCount"] == 2 and s["reachedCount"] == 1 and s["delayedCount"] == 1
        assert s["lastPaymentDate"] == "2026-06-04" and s["fromOrigin"] is False

    def test_robust_none(self):
        import projects as PJ
        s = PJ.build_payment_summary(None, [], None)
        assert "paymentRatio" not in s and s["actualTotal"] is None
        assert s["expectedTotal"] == 0 and s["nodeCount"] == 0
        assert s["reachedCount"] == 0 and s["delayedCount"] == 0
```

- [ ] **Step 4: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py -q`
Expected: FAIL（多处：orgL3_1/合同编号/isPresale 未实现、count_closed_dept 不存在、build_payment_summary 仍含 paymentRatio、build_projects 仍要 6 参 / read_org_l3_map 被删测试引用）

- [ ] **Step 5: 实现 — 顶部 import 增 read_pmis_sheet**

`projects.py` 第 10 行：

```python
from pmis import parse_pmis_money, parse_pmis_pct, read_pmis_sheet
```

- [ ] **Step 6: 实现 — 删 read_org_l3_map**

删除 `projects.py` 的 `read_org_l3_map`（69-80 整个函数）。

- [ ] **Step 7: 实现 — build_payment_summary 去 paymentRatio**

`projects.py` 中 `build_payment_summary` 的 return（152-163）删去 `"paymentRatio": ...` 一行：

```python
    return {
        "contract": contract,
        "actualTotal": actual_total,
        "paymentCount": (pay_record or {}).get("count", 0),
        "expectedTotal": round(sum(n["expectedPayment"] for n in nodes), 2),
        "nodeCount": len(nodes),
        "reachedCount": sum(1 for n in nodes if n["reached"]),
        "delayedCount": sum(1 for n in nodes if n["status"] == "延期"),
        "lastPaymentDate": (pay_record or {}).get("lastDate", ""),
        "fromOrigin": False,
    }
```

- [ ] **Step 8: 实现 — compute_health 用 项目超支**

`projects.py` 中 `compute_health` 的 cost_ab（190）：

```python
    cost_ab = bool(cost.get("项目超支")) or (ratio is not None and ratio > 1)
```

- [ ] **Step 9: 实现 — build_projects 换源 + count_closed_dept**

`projects.py` 中 `build_projects` 签名（198-200）改为去掉 `org_l3_map`：

```python
def build_projects(project_pmis: Dict[str, Dict[str, Any]], org_names: set, org_l4s: set,
                   mapping: List[Dict[str, str]], delivery_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
```
删除函数体内 `org_l3_map = org_l3_map or {}`（204）一行。把 `out.append({...})`（229-239）改为：

```python
        out.append({
            "projectId": pid,
            "projectName": name,
            "projectManager": manager,
            "orgL4": str(team.get("L4部门") or "").strip(),
            "orgL3_1": str(team.get("L3_1部门") or "").strip(),
            "合同编号": str((pm.get("customer") or {}).get("合同编号") or "").strip(),
            "isPresale": ((pm.get("status") or {}).get("项目类型") == config.PRESALE_PROJECT_TYPE),
            "relatedClosedId": (m["closed"] if m else ""),
            "deliveryCosts": delivery_costs_for(drow) if drow else [],
            "health": health,
        })
```

在 `build_projects` 之后（约 242 行）新增：

```python
def count_closed_dept(pmis_dir: str, org_names: set) -> int:
    """已关闭 ∩ 交付三部 计数:项目中心-已关闭.xlsx 中 项目经理 ∈ org_names 的项目数。无人员清单→0。"""
    if not org_names:
        return 0
    rows = read_pmis_sheet(os.path.join(pmis_dir, config.PMIS_FILES_CLOSED["center"]))
    return sum(1 for r in rows if str(r.get("项目经理") or "").strip() in org_names)
```

- [ ] **Step 10: 实现 — load_dept_projects 去 l3_map、加 closedDeptCount**

`projects.py` 中 `load_dept_projects`（291-303）替换为：

```python
def load_dept_projects(input_dir: str, project_pmis: Dict[str, Dict[str, Any]],
                       mapping: List[Dict[str, str]] = None,
                       ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """读组织架构+delivery → build_projects + 质量。mapping 由调用方先读(9a 也要用)。"""
    if mapping is None:
        mapping = []
    names, l4s, org_rows = read_org_names(os.path.join(input_dir, config.ORG_FILE))
    delivery = read_delivery(os.path.join(input_dir, config.DELIVERY_FILE))
    projects = build_projects(project_pmis, names, l4s, mapping, delivery)
    quality = compute_projects_quality(projects, project_pmis, names, l4s, org_rows,
                                       mapping, delivery)
    quality["closedDeptCount"] = count_closed_dept(
        os.path.join(input_dir, config.PMIS_DIRNAME), names)
    return projects, quality
```

- [ ] **Step 11: 跑全量 projects 测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_projects.py -q`
Expected: PASS（全绿）

- [ ] **Step 12: 全量 pytest（迁移类任务，防牵连）**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest -q`
Expected: PASS（全绿；若 test_preprocess/test_pipeline_integration 因 build_projects 签名变更报错，记录并在 Task 4 修，但本步应不涉及——它们不直调 build_projects）

- [ ] **Step 13: Commit**

```bash
git add projects.py tests/test_projects.py
git commit -m "feat(projects): orgL3_1/合同编号/isPresale 换源PMIS+count_closed_dept+回款完成率统一节点级(删build_payment_summary.paymentRatio)+删read_org_l3_map

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: preprocess_data.py — 终验时间回填 + meta 计数脱 WPS

**Files:**
- Modify: `preprocess_data.py`（模块级加 helper；main() 终验时间回填 ~866、meta ~921-924）
- Test: `tests/test_preprocess.py`

**Interfaces:**
- Consumes：`milestones_mod.final_acceptance_date`（Task 2）、`project_pmis`（Task 1，progress 无终验时间）、`project_milestones`（已有）、`dept_projects`、`projects_quality["closedDeptCount"]`（Task 3）。
- Produces：模块级 `backfill_final_acceptance(project_pmis, project_milestones)` 就地写 `progress["终验时间"]`。
- Produces：`meta.totalProjects = len(dept_projects)`、`meta.totalClosed = projects_quality["closedDeptCount"]`。

- [ ] **Step 1: 写失败测试**

`tests/test_preprocess.py` 末尾追加：

```python
def test_backfill_final_acceptance():
    import preprocess_data as P
    project_pmis = {
        "A": {"status": {"项目类型": "实施项目"}, "progress": {"项目阶段": "执行"}},
        "B": {"status": {"项目类型": "售前服务类"}, "progress": {}},
        "C": {"status": {"项目类型": "实施项目"}},  # 无 progress 键
    }
    project_milestones = {
        "A": [{"name": "终验", "planDate": "2026-07-01"}],
        "B": [{"name": "服务完成", "planDate": "2026-08-01"}],
    }
    P.backfill_final_acceptance(project_pmis, project_milestones)
    assert project_pmis["A"]["progress"]["终验时间"] == "2026-07-01"
    assert project_pmis["B"]["progress"]["终验时间"] == "2026-08-01"
    assert project_pmis["C"]["progress"]["终验时间"] is None  # 无里程碑 + 自动建 progress 键
```

- [ ] **Step 2: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_preprocess.py::test_backfill_final_acceptance -q`
Expected: FAIL（`backfill_final_acceptance` 不存在）

- [ ] **Step 3: 实现 backfill helper**

`preprocess_data.py` 模块级（紧挨 `import milestones as milestones_mod` 所在区之后，main() 之前）新增：

```python
def backfill_final_acceptance(project_pmis, project_milestones):
    """把里程碑计划终验/服务完成日回填到 project_pmis[pid].progress.终验时间(就地修改)。"""
    for pid, pm in project_pmis.items():
        ptype = (pm.get("status") or {}).get("项目类型")
        (pm.setdefault("progress", {}))["终验时间"] = milestones_mod.final_acceptance_date(
            project_milestones.get(pid, []), ptype)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_preprocess.py::test_backfill_final_acceptance -q`
Expected: PASS

- [ ] **Step 5: 接线 main() — 回填调用**

`preprocess_data.py` main() 中 `project_milestones, ms_a, ms_c = milestones_mod.load_milestones(...)`（约 860 行）之后、`projects_quality["milestoneActive"] = ms_a` 之前，插入一行：

```python
    backfill_final_acceptance(project_pmis, project_milestones)
```

- [ ] **Step 6: 接线 main() — meta 计数**

`preprocess_data.py` main() 的 `final_data` meta（约 921-924）：

```python
        "meta": {
            "lastUpdate": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "totalProjects": len(dept_projects),
            "totalClosed": projects_quality.get("closedDeptCount", 0),
            "totalPaymentNodes": sum(len(v) for v in payment_nodes.values()),
        },
```

- [ ] **Step 7: 集成冒烟 — 跑真实 preprocess 并核对产物**

Run:
```bash
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python preprocess_data.py
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -c "import json; d=json.load(open('data/analysis_data.json',encoding='utf-8')); m=d['meta']; print('totalProjects',m['totalProjects'],'totalClosed',m.get('totalClosed')); p=d['projects'][0]; print('proj keys ok', 'orgL3_1' in p and '合同编号' in p and 'orgL3' not in p); pm=next(iter(d['projectPmis'].values())); print('pmis ok', '终验时间' in pm['progress'] and '项目超支' in pm['cost'] and 'L3_1部门' in pm['team'] and '签约单位' in pm['customer'])"
```
Expected: `totalProjects` 约 624、`totalClosed` 约 3416、`proj keys ok True`、`pmis ok True`。

- [ ] **Step 8: 全量 pytest**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest -q`
Expected: PASS（全绿）

- [ ] **Step 9: Commit**

```bash
git add preprocess_data.py tests/test_preprocess.py
git commit -m "feat(preprocess): 终验时间里程碑回填+meta totalProjects/totalClosed 改PMIS口径(脱WPS)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: schema.py + gen:types

**Files:**
- Modify: `schema.py`（PmisCost 31-37、PmisProgress 40-44、PmisStatus 54-60、PmisCustomer 63-68、PmisTeam 71-74、Meta 20-23、Project 161-173、ProjectPaymentPmis 148-158）
- Generated: `frontend/src/types/analysis.ts`（由 gen:types 重写）
- Test: `tests/test_schema.py`

**Interfaces:**
- Produces：与 Task 1/3/4 产出的 JSON 键一致的 pydantic 模型；`json2ts` 重生 `analysis.ts`。
- Consumes（Task 6/7）：`PmisTeam.L3_1部门`、`PmisProgress.终验时间`、`PmisCustomer.签约单位`、`PmisStatus.关键动作/交付物`、`PmisCost.项目超支/交付超支`、`Project.orgL3_1/合同编号`、`Meta.totalClosed`。

- [ ] **Step 1: 写/改 schema 测试**

`tests/test_schema.py` 的 `TestPmisSchema.test_with_pmis_and_quality` 内 projectPmis 子树补新字段断言；并新增一个测试。在该方法 `d["projectPmis"] = {...}` 改为带新字段，并追加断言：

```python
        d["projectPmis"] = {"SS-1": {"matched": True, "source": "在建",
                                     "cost": {"消耗比": 0.5, "项目超支": True, "交付超支": False},
                                     "progress": {"终验时间": "2026-07-01"},
                                     "risk": {},
                                     "status": {"关键动作": "已完成", "交付物": "3/3"},
                                     "customer": {"签约单位": "甲单位"},
                                     "team": {"L3部门": "三部", "L3_1部门": "三部一组", "AR": "a",
                                              "SR": "s", "CSR": "c", "CDR": "d", "Sponsor": "p"}}}
```
```python
        assert m.projectPmis["SS-1"].cost.项目超支 is True
        assert m.projectPmis["SS-1"].progress.终验时间 == "2026-07-01"
        assert m.projectPmis["SS-1"].customer.签约单位 == "甲单位"
        assert m.projectPmis["SS-1"].team.L3_1部门 == "三部一组"
        assert m.projectPmis["SS-1"].status.关键动作 == "已完成"
```

`TestProjectsContract.test_minimal_project_validates` 的 proj 增 `"orgL3_1": "三部一组", "合同编号": "HT-1"`，去掉任何 `orgL3` 引用（原本无）。Meta 测试中 `_minimal_valid` 不含 totalClosed —— 故 schema 的 `totalClosed` 必须有默认值（见 Step 3），不改这些最小用例。

- [ ] **Step 2: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_schema.py -q`
Expected: FAIL（新字段属性不存在）

- [ ] **Step 3: 改 schema.py 模型**

`schema.py` 各类按下替换：

```python
class Meta(_Base):
    lastUpdate: str
    totalProjects: int
    totalClosed: int = 0
    totalPaymentNodes: int


class PmisCost(_Base):
    总预算: Optional[float] = None
    核算: Optional[float] = None
    剩余预算: Optional[float] = None
    消耗比: Optional[float] = None
    项目超支: Optional[bool] = None
    交付超支: Optional[bool] = None
    成本状态: Optional[str] = None


class PmisProgress(_Base):
    完工进展: Optional[float] = None
    里程碑进度状态: Optional[str] = None
    项目阶段: Optional[str] = None
    终验时间: Optional[str] = None


class PmisStatus(_Base):
    项目状态: Optional[str] = None
    是否暂停: Optional[bool] = None
    评级: Optional[str] = None
    项目级别: Optional[str] = None
    项目类型: Optional[str] = None
    评分: Optional[float] = None
    关键动作: Optional[str] = None
    交付物: Optional[str] = None


class PmisCustomer(_Base):
    最终客户: Optional[str] = None
    合同编号: Optional[str] = None
    签约单位: Optional[str] = None
    行业: Optional[str] = None
    合同总额: Optional[float] = None


class PmisTeam(_Base):
    项目名称: Optional[str] = None
    项目经理: Optional[str] = None
    L4部门: Optional[str] = None
    L3部门: Optional[str] = None
    L3_1部门: Optional[str] = None
    AR: Optional[str] = None
    SR: Optional[str] = None
    CSR: Optional[str] = None
    CDR: Optional[str] = None
    Sponsor: Optional[str] = None
```

`ProjectPaymentPmis`：删除 `paymentRatio: Optional[float] = None`（152）。

`Project`：把 `orgL3: str = ""`（166）改为 `orgL3_1: str = ""`，并在其下加 `合同编号: str = ""`：

```python
class Project(_Base):
    projectId: str
    projectName: str = ""
    projectManager: str = ""
    orgL4: str = ""
    orgL3_1: str = ""
    合同编号: str = ""
    isPresale: bool = False
    relatedClosedId: str = ""
    payment: ProjectPayment = ProjectPayment()
    deliveryCosts: List[DeliveryCostItem] = []
    overspendAmount: Optional[float] = None
    paymentPmis: Optional[ProjectPaymentPmis] = None
    health: ProjectHealth = ProjectHealth()
```

- [ ] **Step 4: 跑 schema 测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_schema.py -q`
Expected: PASS

- [ ] **Step 5: 重生类型**

Run: `cd frontend && npm run gen:types`
Expected: 无报错；`frontend/src/types/analysis.ts` 重写。核对：`PmisTeam` 含 `L3_1部门?`/`AR?` 等，`PmisProgress` 含 `终验时间?` 无 `计划终验?`，`PmisCustomer` 含 `签约单位?` 无 `签约形式?`，`PmisCost` 含 `项目超支?`/`交付超支?` 无 `超支?`，`Project` 含 `orgL3_1?`/`合同编号?` 无 `orgL3?`，`Meta` 含 `totalClosed?`，`ProjectPaymentPmis` 无 `paymentRatio?`。

- [ ] **Step 6: Commit**

```bash
git add schema.py tests/test_schema.py frontend/src/types/analysis.ts
git commit -m "feat(schema): 同步PMIS血缘扩展字段+gen:types(team+7/终验时间/签约单位/项目超支交付超支/orgL3_1/合同编号/totalClosed,删paymentRatio)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 前端 lib — orgL3 → orgL3_1 端到端（paymentPmis.ts / calendar.ts）

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts`（`PayNodeRow` 178、enrich 214）
- Modify: `frontend/src/lib/calendar.ts`（`CalFilters` 8、`calFilterOptions` 11-19、`applyCalFilters` 22-25）
- Test: `frontend/src/lib/paymentPmis.test.ts`、`frontend/src/lib/calendar.test.ts`

**Interfaces:**
- Consumes：`Project.orgL3_1`（Task 5 类型）。
- Produces：`PayNodeRow.orgL3_1`、`CalFilters.orgL3_1`、`calFilterOptions(...).orgL3_1`、`applyCalFilters` 按 `f.orgL3_1` 过滤。

- [ ] **Step 1: 改测试 — calendar.test.ts orgL3→orgL3_1**

`frontend/src/lib/calendar.test.ts`：把 `pn(...)` 默认里 `orgL3: '三部一组'` 改 `orgL3_1`，所有 `pn({ orgL3: ... })`、`o.orgL3`、`applyCalFilters(rows, { orgL3: ..., orgL4: '', pm: '' })`、`calDashboardStats(rows, { orgL3: '', ... })`、`calUpcoming(rows, { orgL3: '', ... })` 全部 `orgL3`→`orgL3_1`。（11、15、19、22-25 行对应断言键同步。）

- [ ] **Step 2: 改测试 — paymentPmis.test.ts orgL3→orgL3_1**

`frontend/src/lib/paymentPmis.test.ts`：`paymentNodeRows（扁平化 + 维度 join）` 用例中 projects fixture 的 `orgL3` 改 `orgL3_1`，断言 `rows[...].orgL3` 改 `orgL3_1`。

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- calendar paymentPmis`
Expected: FAIL（实现仍用 orgL3）

- [ ] **Step 4: 实现 — paymentPmis.ts**

`PayNodeRow` 接口（178）`orgL3: string` → `orgL3_1: string`；enrich（214）`orgL3: (p.orgL3 ?? '').trim()` → `orgL3_1: (p.orgL3_1 ?? '').trim()`。

- [ ] **Step 5: 实现 — calendar.ts**

```typescript
export interface CalFilters { orgL3_1: string; orgL4: string; pm: string }

export function calFilterOptions(nodes: PayNodeRow[]): { orgL3_1: string[]; orgL4: string[]; pm: string[] } {
  const l3 = new Set<string>(), l4 = new Set<string>(), pm = new Set<string>()
  for (const n of nodes) {
    if (n.orgL3_1) l3.add(n.orgL3_1)
    if (n.orgL4) l4.add(n.orgL4)
    if (n.projectManager) pm.add(n.projectManager)
  }
  return { orgL3_1: [...l3].sort(), orgL4: [...l4].sort(), pm: [...pm].sort() }
}
```
`applyCalFilters`（22-25）：`if (f.orgL3) out = out.filter((n) => n.orgL3 === f.orgL3)` → `if (f.orgL3_1) out = out.filter((n) => n.orgL3_1 === f.orgL3_1)`。
若 `calDashboardStats`/`calUpcoming` 也接收 `CalFilters`，其内部对 orgL3 的引用同步改 orgL3_1（按编译错误定位；注意索引签名不报错，需 grep `orgL3` 全文件逐个确认）。

- [ ] **Step 6: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- calendar paymentPmis`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/lib/calendar.ts frontend/src/lib/calendar.test.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "refactor(fe-lib): 日历 orgL3→orgL3_1 端到端(PayNodeRow/CalFilters/筛选)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 前端 views — 日历筛选 + 详情页字段 + 全前端转绿

**Files:**
- Modify: `frontend/src/views/CalendarView.vue`（43、139）
- Modify: `frontend/src/views/ProjectDetailView.vue`（metrics 74-81、progressInfo 126-131、costSummary 203-210、pmisPaySummary 100-111、pd-meta 260-266、模板新增团队块）
- Modify（fixture 直读改名/删除字段）：`frontend/src/views/CalendarView.test.ts`、`frontend/src/views/ProjectDetailView.test.ts`，以及全量 vitest 暴露的其它 fixture（如 BoardView/filter）
- Test: 全量 `npm run test:run` + `npm run typecheck`

**Interfaces:**
- Consumes：`CalFilters.orgL3_1`、`calFilterOptions(...).orgL3_1`（Task 6）；`m.team.*`/`m.progress.终验时间`/`m.customer.签约单位`/`m.status.关键动作|交付物`/`m.cost.项目超支|交付超支`（Task 5 类型）。

- [ ] **Step 1: 改测试 — CalendarView/ProjectDetailView fixture**

`frontend/src/views/CalendarView.test.ts`：fixture 项目里 `orgL3: '三部一组'` 改 `orgL3_1`。
`frontend/src/views/ProjectDetailView.test.ts`：第 48 行 `progress: { ..., 计划终验: '2028-01-31' }` 改 `终验时间: '2028-01-31'`；若有断言渲染出 "计划终验" 改为 "终验时间"；`paymentPmis` fixture 的 `paymentRatio` 字段删除（如 312 行）；若存在对"流水完成率"行的断言则删除。

- [ ] **Step 2: 跑这两个测试确认失败**

Run: `cd frontend && npm run test:run -- CalendarView ProjectDetailView`
Expected: FAIL（视图仍用旧键）

- [ ] **Step 3: 实现 — CalendarView.vue**

第 43 行 `orgL3: state.filterOrgL3` → `orgL3_1: state.filterOrgL3`（传给 CalFilters 的键名改；`state.filterOrgL3` 这个 store 字段名可保留不动，只改对象键）。第 139 行 `v-for="o in options.orgL3"` → `v-for="o in options.orgL3_1"`。若 store filter 选项绑定 `options.orgL3`，同步改。grep 本文件 `orgL3` 全部确认。

- [ ] **Step 4: 实现 — ProjectDetailView.vue 字段改名/新增**

(a) `metrics`（77）：`{ k: '计划终验', v: fmtDateCell(m.value.progress?.计划终验) }` → `{ k: '终验时间', v: fmtDateCell(m.value.progress?.终验时间) }`。

(b) `progressInfo`（126-131）改为：
```javascript
const progressInfo = computed(() => [
  { k: '完工进展', v: fmtRatio(m.value.progress?.完工进展) },
  { k: '项目阶段', v: m.value.progress?.项目阶段 || '-' },
  { k: '里程碑进度状态', v: m.value.progress?.里程碑进度状态 || '-' },
  { k: '终验时间', v: fmtDateCell(m.value.progress?.终验时间) },
  { k: '关键动作', v: m.value.status?.关键动作 || '-' },
  { k: '交付物', v: m.value.status?.交付物 || '-' },
])
```

(c) `costSummary`（203-210）把最后 `{ k: '超支', ... }` 一行换成两行：
```javascript
  { k: '项目超支', v: m.value.cost?.项目超支 === true ? '是' : '否' },
  { k: '交付超支', v: m.value.cost?.交付超支 === true ? '是' : '否' },
```

(d) `pmisPaySummary`（100-111）删除 `{ k: '完成率', v: fmtRatio(s.paymentRatio) }` 一行（流水÷合同口径已下线）。

(e) 模板第 295 行 note 改写（去掉"完成率=流水÷合同"）：
```html
            <div class="pd-note">回款阶段来源 input/collection_stages.csv；流水来源 payment_records.csv（售前项目取原项目）。</div>
```

(f) pd-meta（262 行客户 span 之后）加签约单位：
```html
            <span>签约单位 <b>{{ m.customer?.签约单位 || '-' }}</b></span>
```

(g) 新增 `teamInfo` computed（放在 `costRows` 计算属性之后，约 218 行后）：
```javascript
const teamInfo = computed(() => [
  { k: '项目经理', v: m.value.team?.项目经理 || '-' },
  { k: 'L4部门', v: m.value.team?.L4部门 || '-' },
  { k: 'L3部门', v: m.value.team?.L3部门 || '-' },
  { k: 'L3-1部门', v: m.value.team?.L3_1部门 || '-' },
  { k: 'AR', v: m.value.team?.AR || '-' },
  { k: 'SR', v: m.value.team?.SR || '-' },
  { k: 'CSR', v: m.value.team?.CSR || '-' },
  { k: 'CDR', v: m.value.team?.CDR || '-' },
  { k: 'Sponsor', v: m.value.team?.Sponsor || '-' },
])
```

(h) 模板:在 `pd-metrics` 块（268-273）之后、`pd-tags`（275）之前插入团队块：
```html
          <section class="pd-team">
            <div class="pd-section-title">团队</div>
            <div class="pd-chips">
              <div v-for="it in teamInfo" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v">{{ it.v }}</span></div>
            </div>
          </section>
```

- [ ] **Step 5: 跑这两个测试确认通过**

Run: `cd frontend && npm run test:run -- CalendarView ProjectDetailView`
Expected: PASS

- [ ] **Step 6: typecheck + 全量 vitest（迁移类任务，全前端转绿）**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: PASS。若失败：
- typecheck 报 `orgL3`/`计划终验`/`签约形式`/`paymentRatio` 等残留引用 → 逐个改为新键。
- vitest fixture（BoardView.test.ts 的 `paymentPmis.paymentRatio`、filter.test.ts、OverviewView/InsightView/ProjectsView/ActivityView.test.ts 等）若运行期读旧键失败 → 把 fixture 改名/删字段（不弱化断言）。逐文件修到全绿。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/CalendarView.vue frontend/src/views/ProjectDetailView.vue frontend/src/views/CalendarView.test.ts frontend/src/views/ProjectDetailView.test.ts
# 若还改了其它 *.test.ts(BoardView/filter 等),一并逐路径 add
git commit -m "feat(fe-views): 日历 orgL3_1 筛选+详情页终验时间/签约单位/团队块/关键动作交付物/项目超支交付超支+删流水完成率行

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 版本号 + verify.sh 全绿 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

**Interfaces:** 无（收尾）。

- [ ] **Step 1: 升版本（Y 级）**

`frontend/src/version.ts`：
```typescript
export const APP_VERSION = 'V1.7.0'
export const RELEASE_DATE = '2026-06-18'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）。任何红条先修到绿再继续。

- [ ] **Step 3: 更新 PROGRESS.md**

`PROGRESS.md` 头部：当前版本改 `V1.7.0`，最近更新写一句结论（子项目1 PMIS 数据血缘扩展：projectPmis team+7/签约单位/合同编号center优先/关键动作交付物/项目超支交付超支、终验时间里程碑换源、在建universe仅中心、orgL3→orgL3_1换源PMIS、回款完成率统一节点级、meta totalProjects/totalClosed脱WPS）；上一版本顺延记 V1.6.9。在合适清单区加一行 `[x] 子项目1 PMIS 数据血缘扩展`（合并 SHA 在 finishing 后回填）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: 版本 V1.7.0 + PROGRESS(子项目1 PMIS 数据血缘扩展)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成后

跑完 Task 8 进入 superpowers:finishing-a-development-branch（option 1：merge --no-ff 到 master、在合并结果上跑 verify.sh、回填 PROGRESS 合并 SHA、删分支）。
