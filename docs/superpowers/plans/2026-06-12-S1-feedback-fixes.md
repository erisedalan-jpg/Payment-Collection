# S1 反馈修缮批次 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 落地 spec `2026-06-12-S1-feedback-fixes-design.md`：动态事件规则与 tone 染色、清单分页/多选筛选/列调整/健康度悬浮、科目树全量、回款完成率迁流水口径、分析配色。版本 V1.0.1。

**Architecture:** Event 模型加 tone 字段，后端 diff 决定颜色前端只染色；快照项目条目加 overspendAmount/deliveryOver(Cats) 两字段供 diff；回款完成率在 preprocess 9e 段回填（纯函数 pytest 先行）；前端清单分页+筛选数组化。

**Tech Stack:** 既有栈。分支 `feat/phase-s1-feedback-fixes`。

## 实测事实（写代码前必读）

- snapshots.py 现状：`_ev(date,etype,domain,pid,pname,summary,prev,curr,amount)`（129-132）；diff_snapshots 项目循环 141-165（字段循环含 rating、超支 160-162、进入/移出主域 145/165）、节点循环 167-194（延期发生 181-183）；build_snapshot 30-70（项目条目 9 字段含 rating/overspend）。
- ActivityView **复用 EventTimeline**（views/ActivityView.vue:72）→ tone 染色只改 EventTimeline.vue（type 徽章 18 行,样式 31-33）。
- ProjectsView 现状：filters 全单值 string（22 行）、QUERY_KEYS 10 键（25）、7 个单选 el-select（66-94）、columns 14 列含 customer（40-56）、DataTable 直收 filtered 全量（103）。
- DataTable（components/DataTable.vue）el-table-column 仅默认 cell 插槽,无 header 插槽——需加 `header-${col.key}` 透传。
- profit.py 剪枝行：`if r["level"] > 1 and not any(v for v in vals): continue`（71-75 区）。
- 9e 段变量名：`payment_records, pr_stat`、`project_profit, pf_stats`、`dept_projects`、`project_pmis`（preprocess_data.py 9e 段）。
- config.MILESTONE_DELAYED_KEYWORDS 已存在（健康度进度维同款关键词,含"滞后/延期/超期"）。
- 超支金额字段源：direct 顶部「剩余预算」列 225/632 与两列差不一致 → 一律 `实际成本-预算成本` 自算；售前 bridge 科目 2 剩余预算 276/276 可得。
- 现有 tests/test_snapshots.py 含「进入主域/移出主域/评级变化」断言——T2 必须同步改名与删除。

## 分级调度

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | 三纯函数（超支金额/交付超支类目/新口径 ratio）+ 剪枝改全 None + pytest | 高 | opus | 主循环真实数据核验 |
| T2 | snapshots diff 规则 + schema Event.tone + build_snapshot 扩字段 + 9e 回填 + gen:types + 真实管线 | 高 | opus | 主循环核验 |
| T3 | 清单：分页/筛选数组化/新筛选/列调整/健康度悬浮 + projectList + DataTable header 插槽 | 高 | opus | 主循环核验 |
| T4 | EventTimeline 染色 + MilestoneTable 去色 + Insight colorBy + 关于页健康度段 + 测试 | 中 | sonnet | 主循环核验 |
| T5 | 版本 V1.0.1 + PROGRESS + verify + 终审 | 低 | 主循环 | opus 终审 |

---

### Task 1: 后端三纯函数 + 剪枝（TDD）

**Files:** Modify `profit.py`、`projects.py`、`tests/test_profit.py`、`tests/test_projects.py`

- [ ] **Step 1: 失败测试——tests/test_profit.py 追加**

```python
class TestOverspendAmount:
    def _entry(self, actual, budget, bridge_remaining=None):
        e = {"summary": {"实际成本": actual, "预算成本": budget}, "rows": [], "bridge": None}
        if bridge_remaining is not None:
            e["bridge"] = {"ssId": "SS-X", "summary": {},
                           "rows": [{"code": "2", "name": "项目成本", "level": 1,
                                     "remaining": bridge_remaining}]}
        return e

    def test_normal_actual_minus_budget(self):
        assert P.overspend_amount(self._entry(7000.0, 1000.0)) == 6000.0
        assert P.overspend_amount(self._entry(500.0, 1000.0)) == -500.0   # 未超支为负

    def test_presale_uses_bridge_remaining(self):
        # 售前:当前消耗 - 原剩余预算
        assert P.overspend_amount(self._entry(8000.0, 1.0, bridge_remaining=2000.0)) == 6000.0

    def test_presale_without_bridge_falls_back(self):
        e = self._entry(7000.0, 1000.0)
        e["bridge"] = {"ssId": "SS-X", "summary": {}, "rows": []}   # 有桥但无科目2 → 退非售前式
        assert P.overspend_amount(e) == 6000.0

    def test_missing_data_none(self):
        assert P.overspend_amount(None) is None
        assert P.overspend_amount({"summary": {}, "rows": [], "bridge": None}) is None


class TestZeroRowsKept:
    def test_all_zero_kept_all_none_pruned(self):
        row = {
            "本项目_2.2.1_自有产品外包服务成本_预算金额": "0.0",
            "本项目_2.2.1_自有产品外包服务成本_实际发生": "0.0",
            "本项目_2.2.1_自有产品外包服务成本_剩余预算": "0.0",
            "本项目_2.2.1_自有产品外包服务成本_消耗率": "0.0",
            "本项目_2.9.9_幽灵科目_预算金额": "",
            "本项目_2.9.9_幽灵科目_实际发生": "",
            "本项目_2.9.9_幽灵科目_剩余预算": "",
            "本项目_2.9.9_幽灵科目_消耗率": "",
        }
        codes = [r["code"] for r in P.parse_profit_rows(row, "本项目_")]
        assert "2.2.1" in codes      # 全零保留(S1:科目全量展示)
        assert "2.9.9" not in codes  # 全 None 仍剪
```

同文件既有 `test_tree_levels_and_zero_pruning` 的断言 `codes == ["1", "2", "2.3.2", "3"]` 改为 `codes == ["1", "2", "2.3.2", "2.4.1", "3"]`（2.4.1 全零现保留），用例名改 `test_tree_levels_and_all_none_pruning`，行尾注释改「2.4.1 全 0 保留(S1),一级行保留」。

**tests/test_projects.py 追加：**

```python
class TestDeliveryOverspendCats:
    def test_over_categories_listed(self):
        costs = [
            {"类别": "交付外包服务成本", "预算金额": 100.0, "实际发生": 150.0},
            {"类别": "差旅费", "预算金额": 200.0, "实际发生": 100.0},
            {"类别": "项目直接成本", "预算金额": 0.0, "实际发生": 50.0},   # 预算0实际>0 也算超
            {"类别": "其他", "预算金额": None, "实际发生": 10.0},          # 预算缺失不算
        ]
        assert PJ.delivery_overspend_cats(costs) == ["交付外包服务成本", "项目直接成本"]
        assert PJ.delivery_overspend_cats([]) == []


class TestPaymentRatioFromRecords:
    def test_normal_and_presale_fallback(self):
        assert PJ.payment_ratio_from_records(500.0, 1000.0, None) == 0.5
        assert PJ.payment_ratio_from_records(1151500.0, None, 1151500.0) == 1.0   # 售前取原项目
        assert PJ.payment_ratio_from_records(None, 1000.0, None) == 0.0           # 无流水=0%
        assert PJ.payment_ratio_from_records(500.0, None, None) is None           # 分母缺失
        assert PJ.payment_ratio_from_records(500.0, 0, 0) is None
```

（PJ 为该文件中 projects 模块的既有 import 别名，沿用文件内写法。）

- [ ] **Step 2: 跑红** `python -m pytest tests/test_profit.py tests/test_projects.py -q` → FAIL

- [ ] **Step 3: 实现**

profit.py 文件尾追加：

```python
def overspend_amount(profit_entry: Optional[Dict[str, Any]]) -> Optional[float]:
    """整体超支金额(元,S1 用户口径;可为负=未超支):
    非售前 = direct 顶部 实际成本-预算成本(不用"剩余预算"列——225/632 与两列差不一致);
    售前(bridge 科目2剩余预算可得) = 当前消耗(实际成本) - 原剩余预算;否则退非售前式。"""
    if not profit_entry:
        return None
    s = profit_entry.get("summary") or {}
    actual = s.get("实际成本")
    if actual is None:
        return None
    bridge = profit_entry.get("bridge")
    if bridge:
        r2 = next((r for r in (bridge.get("rows") or []) if r.get("code") == "2"), None)
        if r2 is not None and r2.get("remaining") is not None:
            return round(actual - r2["remaining"], 2)
    budget = s.get("预算成本")
    if budget is None:
        return None
    return round(actual - budget, 2)
```

profit.py 剪枝行改为：

```python
        if r["level"] > 1 and all(v is None for v in vals):
            continue
```

（其上注释同步改为「level>1 且四指标全 None 的剪掉(全零保留——S1 科目全量展示);一级行恒保留」。）

projects.py 在 delivery_costs_for 之后追加：

```python
def delivery_overspend_cats(delivery_costs: List[Dict[str, Any]]) -> List[str]:
    """交付费用超支类目(S1):实际发生 > 预算金额 的类目名(预算缺失不判)。"""
    out = []
    for c in delivery_costs or []:
        b, a = c.get("预算金额"), c.get("实际发生")
        if b is not None and a is not None and a > b:
            out.append(str(c.get("类别") or ""))
    return out


def payment_ratio_from_records(records_total: Optional[float], contract: Optional[float],
                               closed_contract: Optional[float]) -> Optional[float]:
    """回款完成率新口径(S1):流水累计 ÷ 合同总额(本项目优先,售前回退原项目)。
    分母缺失/0 → None(前端显 '-');无流水但有合同 → 0。"""
    denom = contract if contract else closed_contract
    if not denom or denom <= 0:
        return None
    return round((records_total or 0) / denom, 4)
```

- [ ] **Step 4: 跑绿** `python -m pytest -q` → 全绿不回归
- [ ] **Step 5: Commit** `git add profit.py projects.py tests/ && git commit -m "feat(s1): 超支金额双口径/交付超支类目/回款完成率新口径三纯函数+科目树全零保留(仅剪全None)"`

---

### Task 2: snapshots diff 规则 + schema + 9e 回填（依赖 T1）

**Files:** Modify `snapshots.py`、`schema.py`、`preprocess_data.py`、`tests/test_snapshots.py`、`frontend/src/types/analysis.ts`(生成)

- [ ] **Step 1: 失败测试——tests/test_snapshots.py**

先读该文件：把既有断言中的 `"进入主域"` 改 `"新增项目"`、`"移出主域"` 改 `"关闭项目"`、删除评级变化相关断言/用例（fixture 里 rating 字段可留）。再追加（fixture 风格沿用文件内既有 helper）：

```python
class TestS1EventRules:
    def _proj(self, **kw):
        base = {"name": "甲", "stage": "项目执行", "milestone": "正常", "status": "实施中",
                "paused": False, "rating": "C", "openRisks": 0, "overspend": False,
                "costRatio": 0.5, "overspendAmount": None, "deliveryOver": False,
                "deliveryOverCats": []}
        base.update(kw)
        return base

    def _snap(self, date, projs):
        return {"date": date, "projects": projs, "nodes": {}, "agg": {}}

    def test_rating_change_no_event(self):
        evs = M.diff_snapshots(self._snap("2026-06-11", {"P1": self._proj(rating="C")}),
                               self._snap("2026-06-12", {"P1": self._proj(rating="A")}))
        assert evs == []

    def test_new_and_closed_project_renamed_green(self):
        evs = M.diff_snapshots(self._snap("2026-06-11", {"P1": self._proj()}),
                               self._snap("2026-06-12", {"P2": self._proj(name="乙")}))
        types = {e["type"]: e for e in evs}
        assert types["新增项目"]["tone"] == "ok" and "进入项目主域" in types["新增项目"]["summary"]
        assert types["关闭项目"]["tone"] == "ok" and "移出项目主域" in types["关闭项目"]["summary"]

    def test_milestone_bad_red_normal_plain(self):
        evs = M.diff_snapshots(self._snap("2026-06-11", {"P1": self._proj(milestone="正常")}),
                               self._snap("2026-06-12", {"P1": self._proj(milestone="严重延期")}))
        assert evs[0]["type"] == "里程碑状态变更" and evs[0]["tone"] == "danger"
        evs2 = M.diff_snapshots(self._snap("2026-06-11", {"P1": self._proj(milestone="延期")}),
                                self._snap("2026-06-12", {"P1": self._proj(milestone="正常")}))
        assert evs2[0]["tone"] == ""

    def test_risk_up_red_down_green(self):
        up = M.diff_snapshots(self._snap("2026-06-11", {"P1": self._proj(openRisks=1)}),
                              self._snap("2026-06-12", {"P1": self._proj(openRisks=3)}))
        assert up[0]["type"] == "风险数增减" and up[0]["tone"] == "danger"
        down = M.diff_snapshots(self._snap("2026-06-11", {"P1": self._proj(openRisks=3)}),
                                self._snap("2026-06-12", {"P1": self._proj(openRisks=1)}))
        assert down[0]["tone"] == "ok"

    def test_overspend_amount_threshold(self):
        big = M.diff_snapshots(
            self._snap("2026-06-11", {"P1": self._proj()}),
            self._snap("2026-06-12", {"P1": self._proj(overspend=True, overspendAmount=6000.0)}))
        assert big[0]["type"] == "超支出现" and big[0]["tone"] == "danger"
        assert "0.6 万" in big[0]["summary"] and big[0]["amount"] == 6000.0
        small = M.diff_snapshots(
            self._snap("2026-06-11", {"P1": self._proj()}),
            self._snap("2026-06-12", {"P1": self._proj(overspend=True, overspendAmount=4000.0)}))
        assert small[0]["tone"] == "warn"
        gone = M.diff_snapshots(
            self._snap("2026-06-11", {"P1": self._proj(overspend=True)}),
            self._snap("2026-06-12", {"P1": self._proj(overspend=False)}))
        assert gone[0]["type"] == "超支解除" and gone[0]["tone"] == "ok"
        # PMIS 分项标超但整体金额为负(实测 38/45):warn 且摘要不带负数金额
        neg = M.diff_snapshots(
            self._snap("2026-06-11", {"P1": self._proj()}),
            self._snap("2026-06-12", {"P1": self._proj(overspend=True, overspendAmount=-500.0)}))
        assert neg[0]["tone"] == "warn" and "万" not in neg[0]["summary"]

    def test_delivery_overspend_event_and_upgrade_guard(self):
        evs = M.diff_snapshots(
            self._snap("2026-06-11", {"P1": self._proj(deliveryOver=False)}),
            self._snap("2026-06-12", {"P1": self._proj(deliveryOver=True, deliveryOverCats=["交付外包服务成本"])}))
        assert evs[0]["type"] == "交付费用超支" and evs[0]["tone"] == "danger"
        assert "交付外包服务成本" in evs[0]["summary"]
        # 旧快照无该字段(升级首跑) → 不触发
        old = self._proj(); old.pop("deliveryOver"); old.pop("deliveryOverCats")
        evs2 = M.diff_snapshots(self._snap("2026-06-11", {"P1": old}),
                                self._snap("2026-06-12", {"P1": self._proj(deliveryOver=True, deliveryOverCats=["差旅费"])}))
        assert all(e["type"] != "交付费用超支" for e in evs2)

    def test_delay_event_red(self):
        a = {"date": "2026-06-11", "projects": {}, "agg": {},
             "nodes": {"P1|款#0": {"pid": "P1", "pname": "甲", "node": "款", "status": "正常实施中",
                                    "planDate": "", "actual": 0, "expected": 100}}}
        b = json.loads(json.dumps(a)); b["date"] = "2026-06-12"
        b["nodes"]["P1|款#0"]["status"] = "延期"
        evs = M.diff_snapshots(a, b)
        assert evs[0]["type"] == "延期发生" and evs[0]["tone"] == "danger"

    def test_build_snapshot_new_fields(self):
        projects = [{"projectId": "P1", "projectName": "甲",
                     "deliveryCosts": [{"类别": "差旅费", "预算金额": 10.0, "实际发生": 20.0}]}]
        profit = {"P1": {"summary": {"实际成本": 9000.0, "预算成本": 1000.0}, "rows": [], "bridge": None}}
        snap = M.build_snapshot("2026-06-12", projects, {}, [], profit)
        e = snap["projects"]["P1"]
        assert e["overspendAmount"] == 8000.0
        assert e["deliveryOver"] is True and e["deliveryOverCats"] == ["差旅费"]
```

（M 为该文件中 snapshots 的既有 import 别名；`import json` 若缺则补。）

- [ ] **Step 2: 跑红** `python -m pytest tests/test_snapshots.py -q` → FAIL

- [ ] **Step 3: snapshots.py 实现**

顶部 import 追加：`from profit import overspend_amount`、`from projects import delivery_overspend_cats`。

build_snapshot 签名加第 5 参 `project_profit: Optional[Dict[str, dict]] = None`，项目条目（49-50 行 overspend/costRatio 之后）追加：

```python
            "overspendAmount": overspend_amount((project_profit or {}).get(pid)),
            "deliveryOver": bool(delivery_overspend_cats(p.get("deliveryCosts") or [])),
            "deliveryOverCats": delivery_overspend_cats(p.get("deliveryCosts") or []),
```

（避免双调用可先 `cats = delivery_overspend_cats(p.get("deliveryCosts") or [])` 再取。）

_ev 签名加 `tone: str = ""`，返回 dict 加 `"tone": tone`。

diff_snapshots 改造（逐处）：

```python
        if a is None:
            evs.append(_ev(d, "新增项目", "project", pid, name, "新增项目（进入项目主域）", tone="ok"))
            continue
        for field, etype in (("stage", "阶段变更"), ("milestone", "里程碑状态变更"),
                             ("status", "项目状态变更")):
            if a.get(field) != b.get(field):
                tone = ""
                if field == "milestone" and any(
                        kw in str(b.get(field) or "") for kw in config.MILESTONE_DELAYED_KEYWORDS):
                    tone = "danger"
                evs.append(_ev(d, etype, "project", pid, name,
                               f"{a.get(field) or '-'} → {b.get(field) or '-'}",
                               prev=a.get(field), curr=b.get(field), tone=tone))
```

（评级变化元组删除——S1 用户决策：评级变化不展示。）风险块：

```python
        if ra != rb:
            evs.append(_ev(d, "风险数增减", "project", pid, name,
                           f"未关闭风险 {ra} → {rb}", prev=ra, curr=rb,
                           tone="danger" if rb > ra else "ok"))
```

超支块整体替换（160-162）：

```python
        if bool(a.get("overspend")) != bool(b.get("overspend")):
            if b.get("overspend"):
                amt = b.get("overspendAmount")
                # 整体超支金额>0 才入摘要与阈值判色;PMIS 分项超支但整体未超(实测 38/45 为负)只标 warn 不显负数
                if amt is not None and amt > 0:
                    evs.append(_ev(d, "超支出现", "project", pid, name,
                                   f"超支出现,整体超支 {round(amt / 10000, 2)} 万",
                                   amount=amt, tone="danger" if amt > 5000 else "warn"))
                else:
                    evs.append(_ev(d, "超支出现", "project", pid, name, "超支出现", tone="warn"))
            else:
                evs.append(_ev(d, "超支解除", "project", pid, name, "超支解除", tone="ok"))
        # 交付费用超支(S1 新事件;旧快照缺字段=升级首跑,不触发)
        if "deliveryOver" in a and not a.get("deliveryOver") and b.get("deliveryOver"):
            evs.append(_ev(d, "交付费用超支", "project", pid, name,
                           f"交付费用超支：{'、'.join(b.get('deliveryOverCats') or []) or '-'}",
                           tone="danger"))
```

移出主域（165）：`evs.append(_ev(d, "关闭项目", "project", pid, a.get("name") or "", "关闭项目（移出项目主域）", tone="ok"))`。
延期发生（182）加 `tone="danger"`。

- [ ] **Step 4: schema.py + preprocess**

Event 模型加 `tone: str = ""`。
preprocess_data.py：grep `build_snapshot(` 找调用处（run_snapshot_pipeline 内），加第 5 实参 `final_data.get("projectProfit")`。9e 段（projects_quality 六统计赋值后）追加回款完成率回填：

```python
    # === S1: 回款完成率切流水口径(流水累计÷合同总额,售前回退原项目;文件缺失保留旧口径) ===
    if pr_stat["provided"]:
        def _contract(pid):
            return ((project_pmis.get(pid) or {}).get("customer") or {}).get("合同总额")
        for p in dept_projects:
            rec = payment_records.get(p["projectId"]) or {}
            p["payment"]["paymentRatio"] = projects_mod.payment_ratio_from_records(
                rec.get("total"), _contract(p["projectId"]),
                _contract(p.get("relatedClosedId") or ""))
        print("  [OK] 回款完成率已切换为 流水累计÷合同总额 口径")
```

- [ ] **Step 5: 跑绿 + 真实管线 + gen:types**

```bash
python -m pytest -q                                  # 全绿
PYTHONIOENCODING=utf-8 python preprocess_data.py     # 看 9e 新 [OK] 行;脏数据项目 WSGF-SF-202502100199 的 paymentRatio 应为 1.0
cd frontend && npm run gen:types && npm run typecheck
```

验证命令（贴报告）：`PYTHONIOENCODING=utf-8 python -c "import json; d=json.load(open('data/analysis_data.json',encoding='utf-8')); p=[x for x in d['projects'] if x['projectId']=='WSGF-SF-202502100199'][0]; print(p['payment']['paymentRatio'])"` → 期望 `1.0`。

- [ ] **Step 6: Commit** `git add snapshots.py schema.py preprocess_data.py tests/ frontend/src/types/analysis.ts && git commit -m "feat(s1): 动态事件规则(tone染色/新增关闭项目改名/超支金额摘要/交付费用超支/评级停发)+回款完成率9e回填流水口径"`

---

### Task 3: 清单改造（分页/多选/列/悬浮）

**Files:** Modify `frontend/src/lib/projectList.ts`、`frontend/src/lib/projectList.test.ts`、`frontend/src/views/ProjectsView.vue`、`frontend/src/views/ProjectsView.test.ts`、`frontend/src/components/DataTable.vue`

- [ ] **Step 1: projectList.ts 筛选数组化（先改测试跑红再实现）**

ProjectFilters 改为：

```ts
export interface ProjectFilters {
  search: string
  manager: string[]
  orgL4: string[]
  stage: string[]
  projectStatus: string[]
  riskLevel: string[]
  projectLevel: string[]
  paymentStatus: string[]
  health: string[]
  presale: string  // '' | 'yes' | 'no'
  paused: string   // '' | 'yes'
  overspend: string // '' | 'yes'
}
```

filterProjectRows 多选判定（替换原 7 个单值相等判断）：

```ts
  const hit = (sel: string[], v: string) => !sel.length || sel.includes(v)
  return rows.filter((r) => {
    if (q && ![r.projectName, r.projectId, r.customer, r.projectManager].some((s) => s !== '-' && s.toLowerCase().includes(q))) return false
    if (!hit(f.manager, r.projectManager)) return false
    if (!hit(f.orgL4, r.orgL4)) return false
    if (!hit(f.stage, r.stage)) return false
    if (!hit(f.projectStatus, r.projectStatus)) return false
    if (!hit(f.riskLevel, r.riskLevel)) return false
    if (!hit(f.projectLevel, r.projectLevel)) return false
    if (!hit(f.paymentStatus, r.paymentStatus)) return false
    if (!hit(f.health, r.health)) return false
    if (f.paused === 'yes' && !r.paused) return false
    if (f.overspend === 'yes' && !r.overspend) return false
    if (f.presale === 'yes' && !r.isPresale) return false
    if (f.presale === 'no' && r.isPresale) return false
    return true
  })
```

distinctOptions 的 key 联合类型扩为 `'stage' | 'projectStatus' | 'riskLevel' | 'orgL4' | 'projectManager' | 'projectLevel'`。
projectList.test.ts：所有构造 ProjectFilters 的工厂/对象同步为数组形态（如 `riskLevel: ['高']`、空 `[]`），并加两断言：多选 `stage: ['项目执行','项目收尾']` 命中两类、`manager: ['何平']` 单选命中。

- [ ] **Step 2: DataTable.vue 加 header 插槽**

el-table-column 内 default 模板之前加：

```html
        <template #header>
          <slot :name="`header-${col.key}`" :col="col">{{ col.label }}</slot>
        </template>
```

- [ ] **Step 3: ProjectsView.vue 改造（先改测试——见 Step 4——可同步进行）**

script：

```ts
import { computed, onMounted, reactive, ref, watch } from 'vue'
// filters 改数组形态
const filters = reactive<ProjectFilters>({ search: '', manager: [], orgL4: [], stage: [], projectStatus: [], riskLevel: [], projectLevel: [], paymentStatus: [], health: [], presale: '', paused: '', overspend: '' })
// query 初始化:多选键收单值/数组,单值键收 string
const MULTI_KEYS = ['manager', 'orgL4', 'stage', 'projectStatus', 'riskLevel', 'projectLevel', 'paymentStatus', 'health'] as const
const SINGLE_KEYS = ['search', 'presale', 'paused', 'overspend'] as const
for (const k of MULTI_KEYS) {
  const v = route.query[k]
  if (typeof v === 'string' && v) filters[k] = [v]
  else if (Array.isArray(v)) filters[k] = v.filter((x): x is string => typeof x === 'string' && !!x)
}
for (const k of SINGLE_KEYS) {
  const v = route.query[k]
  if (typeof v === 'string' && v) filters[k] = v
}
const managerOpts = computed(() => distinctOptions(rows.value, 'projectManager'))
const levelOpts = computed(() => distinctOptions(rows.value, 'projectLevel'))
// 分页(S1:633 行全量渲染是卡慢根因)
const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })
```

columns：删 customer 行；projectName 行去 `sortable: true`。
toolbar 重排（搜索 → 项目经理 → 服务组 → 阶段 → 项目状态 → 风险 → 级别 → 回款状态 → 健康度 → 售前），多选统一形态：

```html
      <el-select v-model="filters.manager" size="small" multiple collapse-tags clearable placeholder="项目经理" style="width: 130px">
        <el-option v-for="o in managerOpts" :key="o" :value="o" :label="o" />
      </el-select>
```

（orgL4/stage/projectStatus/riskLevel/projectLevel/paymentStatus/health 七个同形态，宽度沿用现值或 120px；级别选项 `levelOpts`；售前保持单选原样。多选 select 删除原 `:empty-values/:value-on-clear` 两属性——那是单值空串模型的修补，数组模型不需要。）

DataTable 行改 `:rows="paged" :show-count="false"`，其后加：

```html
    <div v-if="rows.length" class="pv-pager">
      <span class="pv-total u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
```

健康度列头悬浮（DataTable 内）：

```html
      <template #header-health>
        <span class="pv-health-head">健康度
          <el-tooltip placement="top">
            <template #content>
              四维异常——进度:里程碑进度状态含滞后/延期/超期;风险:最高等级高且未关闭&gt;0;成本:超支或消耗比&gt;100%;回款:存在延期回款节点。<br />总评:0 项异常=健康 / 1 项=关注 / ≥2 项=风险;PMIS 未匹配=无数据。
            </template>
            <span class="pv-info">i</span>
          </el-tooltip>
        </span>
      </template>
```

样式追加：

```css
.pv-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pv-total { font-size: var(--fs-1); color: var(--sub); }
.pv-health-head { display: inline-flex; align-items: center; gap: var(--sp-1); }
.pv-info { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: var(--r-full); border: 1px solid var(--sub); color: var(--sub); font-size: 10px; font-style: italic; cursor: help; line-height: 1; }
```

- [ ] **Step 4: ProjectsView.test.ts 同步**

- seed 不变；「搜索过滤」等交互用例不受影响；涉及 filters 赋值的用例改数组形态。
- 删 customer 断言（若有 `海聚博源` 列断言改为不再出现在表格?客户仍可被搜索——保留搜索用例,删除列文本断言改为 `expect(w.text()).not.toContain('海聚博源')` 仅当原用例断言了该文本时调整）。
- 追加用例：

```ts
  it('S1:分页器与总数,客户列已删,项目名不可排序', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.find('.pv-pager').exists()).toBe(true)
    expect(w.text()).toContain('共 2 条')
    expect(w.find('.el-pagination').exists()).toBe(true)
    const headers = w.findAll('th').map((n) => n.text())
    expect(headers.some((t) => t.includes('客户'))).toBe(false)
    expect(w.text()).toContain('健康度')
  })

  it('S1:经理/级别多选筛选', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    ;(w.vm as any).filters.manager = ['何平']
    await flushPromises()
    expect(w.text()).toContain('共 1 条')
    ;(w.vm as any).filters.manager = []
    ;(w.vm as any).filters.projectLevel = ['P3']
    await flushPromises()
    expect(w.text()).toContain('共 1 条')
  })
```

（seed fixture：P-1 经理=何平、status 含 项目级别 'P3'；P-2 经理=李四、无级别。）

- [ ] **Step 5: 跑绿** `cd frontend && npx vitest run src/lib/projectList.test.ts src/views/ProjectsView.test.ts src/views/OverviewView.test.ts && npm run typecheck`（OverviewView 的 KPI 链接 query 单值进多选键,断言不变应仍绿。）
- [ ] **Step 6: Commit** `git add frontend/src && git commit -m "feat(s1): 清单分页(20/50/80/100默认50)+筛选全多选(增经理/级别)按列序重排+删客户列+项目名去排序+健康度列头悬浮定义"`

---

### Task 4: 前端杂项（染色/去色/配色/关于页）

**Files:** Modify `frontend/src/components/EventTimeline.vue`、`EventTimeline.test.ts`、`frontend/src/components/MilestoneTable.vue`、`MilestoneTable.test.ts`、`frontend/src/views/ProjectDetailView.test.ts`、`frontend/src/views/InsightView.vue`、`frontend/src/views/AboutView.vue`、`AboutView.test.ts`

- [ ] **Step 1: EventTimeline tone 染色（先测试跑红）**

EventTimeline.test.ts 追加：

```ts
  it('S1:tone 染色优先于 domain 缺省色', () => {
    const w = mount(EventTimeline, { props: { events: [
      { date: '2026-06-12', type: '延期发生', domain: 'payment', projectId: '', projectName: '', summary: 'x', tone: 'danger' },
      { date: '2026-06-12', type: '新增项目', domain: 'project', projectId: '', projectName: '', summary: 'y', tone: 'ok' },
      { date: '2026-06-12', type: '阶段变更', domain: 'project', projectId: '', projectName: '', summary: 'z' },
    ] as any } })
    const chips = w.findAll('.ev-type')
    expect(chips[0].classes()).toContain('tone-danger')
    expect(chips[1].classes()).toContain('tone-ok')
    expect(chips[2].classes()).toContain('proj')   // 无 tone 走 domain 缺省
  })
```

（mount 方式沿用该测试文件既有写法。）实现——18 行改：

```html
        <span class="ev-type" :class="(e as any).tone ? `tone-${(e as any).tone}` : (e.domain === 'payment' ? 'pay' : 'proj')">{{ e.type }}</span>
```

（gen:types 后 Event 已含 tone 字段则去掉 as any。）样式追加：

```css
.ev-type.tone-ok { background: var(--ok-bg); color: var(--ok-text); }
.ev-type.tone-warn { background: var(--warn-bg); color: var(--warn-text); }
.ev-type.tone-danger { background: var(--danger-bg); color: var(--danger-text); }
```

- [ ] **Step 2: MilestoneTable 去三色**

模板 `<tr ... :class="`ms-${i.priority}`">` 去掉 :class；样式块删 `.ms-high td/.ms-high .ms-name/.ms-mid */.ms-low *` 六条规则（保留 .ms-table/.ms-status 等）。MilestoneTable.test.ts：删 ms-high/ms-mid/ms-low 三断言，保留列内容/完成状态断言，用例名改「列内容与完成状态(S1 去色,priority 仅数据保留)」。ProjectDetailView.test.ts：删 `expect(w.find('tr.ms-high').exists()).toBe(true)` 一行（其余断言保留）。

- [ ] **Step 3: InsightView 配色**

65 行 series 改：

```ts
    series: [{ name: label, type: 'bar', colorBy: 'data', data: top.value.map((g) => +(((g[metricKey.value] ?? 0) as number) / div).toFixed(4)) }],
```

- [ ] **Step 4: 关于页健康度段**

AboutView.vue 最后一个 about-feat-box 后追加：

```html
    <div class="about-feat-box">
      <div class="about-feat-title">健康度规则</div>
      <ul class="about-features">
        <li>四维异常：进度=里程碑进度状态含滞后/延期/超期；风险=最高等级高且未关闭风险数&gt;0；成本=超支或消耗比&gt;100%；回款=存在延期回款节点</li>
        <li>总评：0 项异常=健康 / 1 项=关注 / ≥2 项=风险；PMIS 未匹配=无数据（不计三态）</li>
      </ul>
    </div>
```

AboutView.test.ts 第二用例追加 `expect(w.text()).toContain('健康度规则')`。

- [ ] **Step 5: 跑绿** `cd frontend && npm run test:run 2>&1 | tail -3 && npm run typecheck` → 全绿
- [ ] **Step 6: Commit** `git add frontend/src && git commit -m "feat(s1): 事件 tone 三态染色+里程碑表去色(priority留数据)+分析柱图逐柱配色+关于页健康度规则段"`

---

### Task 5: 版本 + PROGRESS + verify + 终审（主循环）

- [ ] **Step 1**: version.ts → `V1.0.1`
- [ ] **Step 2**: PROGRESS——头部/「进行中」S1 完成待合并；Handoff S1（调查结论五条+用户决策四条引 spec、超支双口径、烟雾清单：① /activity 新事件染色与改名（需两次同步后对比）② 清单分页/多选/无客户列/健康度悬浮 ③ 详情页科目树 24 行全量与里程碑无色 ④ WSGF-SF-202502100199 回款完成率=100% ⑤ /insight 柱图多色）。
- [ ] **Step 3**: `bash verify.sh` 全绿 → Commit `chore(s1): 版本 V1.0.1 + PROGRESS`
- [ ] **Step 4**: opus 整体终审（diff master..HEAD 对照 spec 全节 + 真实数据抽查超支金额/新口径 ratio/事件 tone）→ finishing-a-development-branch 四选项菜单。
