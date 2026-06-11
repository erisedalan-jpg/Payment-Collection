# P3 快照/diff/事件流 + 项目动态页 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每次数据处理写精简快照，diff 引擎产出项目/回款两类事件流（events.json ≤500 条、analysis_data 内嵌最近 100），预计算三基线周期对比；新增 `/activity` 项目动态页（周期对比卡 + 按日时间线），并补上 P2 推迟的详情页右栏动态。

**Architecture:** 后端新模块 `snapshots.py`（纯函数：build_snapshot/diff_snapshots/compute_period_compare + 文件 IO），preprocess 第 10 步组装 final_data 后、schema 校验前接入（快照对比在覆盖写之前完成）。前端 `lib/activity` 纯函数 + 共享 `EventTimeline` 组件（/activity 与详情页右栏同构）。

**Tech Stack:** Python 标准库（json/datetime）+ pydantic v2 契约 + pytest；Vue3+TS+vitest；SegToggle/theme.css 令牌复用。

---

## 设计决策（评审依据）

1. **节点稳定键 = `projectId|nodeName#k`**（spec 3.3 留本期确认）。真实数据核实：955 节点中 `projectId+nodeName` 25 组重复（84 行，同名"阶段验收款"×4 等），加 planDate 仍 3 组重复，无序号/期次字段——不存在天然唯一键。k 取该 (projectId,nodeName) 在 rawNodes **原始行序**中的第 k 次出现（仅 isPaymentRelated 节点）。行序来自源表格，跨同步最稳；局限：重复组中间插行会使组内后续 ordinal 偏移、单次误配（影响半径=该组），记入文档不做更复杂匹配（YAGNI）。
2. **快照仅存精简状态**（spec 3.3）：每项目 8 字段（stage/milestone/status/paused/rating/openRisks/overspend/costRatio + name 供事件文案）、每回款节点 7 字段（pid/pname/node/status/planDate/actual/expected）、agg 部门汇总 7 项。
3. **diff 时序**：先 diff 旧快照（含同日早前一次，实现"上次同步"语义）→ 算周期对比 → 再覆盖写当日快照 + 清理 >90 天。首次运行（无快照）：0 事件、三基线全 null（前端置灰/空态），**不产出 640 条"进入主域"**。
4. **事件判定全部用 config 常量**：延期发生=nodeStatus 变为 `STATUS_DELAYED`；回款完成=变为 `STATUS_FULL_PAID`；到账=actualPayment 增加（差额入 amount）。新增 `config.STAGE_ORDER = ("项目启动","项目规划","项目执行","项目收尾")` 供"阶段推进"判定（真实取值域已核实）。
5. **事件字段避开 Python 保留字**：变化前后用 `prev`/`curr`（不用 from）。events.json 旧→新追加、超 500 截头；内嵌 `final_data["events"]` 取**最新 100、新在前**。
6. **周期对比直接 diff 快照**（不累加事件）：基线=lastSync（最新一份）/lastWeek（≤今天-7 天最近）/lastMonth（≤今天-30 天）；六指标：阶段推进项目数/新增延期节点数/回款新增额/风险净增/新超支项目数/回款达成率变化（百分点）。
7. **frozen 双模式**：snapshots/events 路径基于既有 `OUTPUT_DIR`（已 BASE_DIR 感知）；`PaymentReviewApp.spec` datas 必须加 `('snapshots.py', '.')`（P1 同款坑）；`.gitignore` 加 `data/snapshots/` 与 `data/events.json`（运行时数据）。
8. **前端**：`/activity`（meta hideFilter）= 周期对比卡条（SegToggle 三基线，null 基线置灰"快照不足"）+ 筛选（全部/项目类/回款类 + 搜索）+ 按日分组时间线；事件点击跳 `/project/:id`（移出主域项目自然落详情页 404 空态，可接受）；详情页右栏（spec 4.2 布局 B 补全）= 该项目事件时间线，≤1200px 退化为落底。
9. **spec 4.4 时间范围筛选本期裁剪**（YAGNI）：前端只拿内嵌最近 100 条事件（跨度通常数日），时间范围筛选无区分度；待事件量积累后随 events.json 全量接口再加，记 PROGRESS backlog。

## 分级调度（per 用户指令）

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | schema Event/PeriodCompare + gen:types | 低中 | sonnet | 主循环核实 |
| T2 | snapshots.py 快照构建/IO/基线选择 | 高(核心) | opus | opus 质量审(并入 T3) |
| T3 | diff_snapshots 事件引擎 | 高(核心) | opus | opus 质量审(T2+T3 真实数据) |
| T4 | compute_period_compare | 中 | sonnet | 并入 T5 审 |
| T5 | preprocess 集成 + events.json + spec datas + gitignore | 高(frozen坑) | opus | opus 双审(spec+质量) |
| T6 | lib/activity + EventTimeline 组件 | 中 | sonnet | 主循环核实 |
| T7 | ActivityView + 路由 + 导航 | 中 | sonnet | sonnet 质量审(T7+T8) |
| T8 | 详情页右栏动态 | 中 | sonnet | sonnet 质量审(T7+T8) |
| T9 | 版本 V7.2.0 + PROGRESS + verify | 低 | 主循环亲做 | verify.sh |

子代理产出一律 git/pytest/vitest 直接核实，不采信自述。

---

### Task 1: schema 契约 — Event / PeriodCompare + 类型同源

**Files:**
- Modify: `config.py`（尾部加 STAGE_ORDER）
- Modify: `schema.py`（三新模型 + AnalysisData 两字段）
- Modify: `frontend/src/types/analysis.ts`（gen:types 再生成）
- Test: `tests/test_schema.py`（追加）

- [ ] **Step 1: 失败测试** — `tests/test_schema.py` 追加：

```python
class TestEventsContract:
    def test_analysis_data_accepts_events_and_period_compare(self):
        data = _minimal_analysis_data()
        data["events"] = [{
            "date": "2026-06-11", "type": "到账", "domain": "payment",
            "projectId": "P-1", "projectName": "甲", "summary": "初验款 到账 50.0万",
            "prev": 0, "curr": 500000.0, "amount": 500000.0,
        }]
        data["periodCompare"] = {
            "lastSync": {"baseDate": "2026-06-10", "advancedProjects": 1, "newDelayedNodes": 2,
                         "paymentGained": 500000.0, "riskNetChange": -1, "newOverspendProjects": 0,
                         "paymentRatioChange": 1.5},
            "lastWeek": None, "lastMonth": None,
        }
        m = schema.AnalysisData.model_validate(data)
        assert m.events[0].type == "到账"
        assert m.periodCompare.lastSync.paymentGained == 500000.0
        assert m.periodCompare.lastWeek is None

    def test_events_default_empty(self):
        m = schema.AnalysisData.model_validate(_minimal_analysis_data())
        assert m.events == [] and m.periodCompare is None
```

（`_minimal_analysis_data` 为该文件既有 helper；若命名不同，沿用既有最小数据构造方式。）

- [ ] **Step 2: 确认失败** — `python -m pytest tests/test_schema.py -q` → FAIL
- [ ] **Step 3: 实现**

`config.py` 尾部追加：

```python
# 项目阶段推进顺序(周期对比"阶段推进"判定;真实取值域: 启动/规划/执行/收尾)
STAGE_ORDER = ("项目启动", "项目规划", "项目执行", "项目收尾")
```

`schema.py` 在 ProjectsQuality 之后、AnalysisData 之前加：

```python
class Event(_Base):
    date: str
    type: str
    domain: str  # project | payment
    projectId: str = ""
    projectName: str = ""
    summary: str = ""
    prev: Optional[Any] = None
    curr: Optional[Any] = None
    amount: Optional[float] = None


class PeriodCompareEntry(_Base):
    baseDate: str
    advancedProjects: int = 0
    newDelayedNodes: int = 0
    paymentGained: float = 0
    riskNetChange: int = 0
    newOverspendProjects: int = 0
    paymentRatioChange: Optional[float] = None  # 百分点


class PeriodCompare(_Base):
    lastSync: Optional[PeriodCompareEntry] = None
    lastWeek: Optional[PeriodCompareEntry] = None
    lastMonth: Optional[PeriodCompareEntry] = None
```

`AnalysisData` 尾部加两字段：

```python
    events: List[Event] = []
    periodCompare: Optional[PeriodCompare] = None
```

- [ ] **Step 4: 通过 + 再生成类型** — `python -m pytest tests/test_schema.py -q` PASS；`cd frontend && npm run gen:types`；`npm run typecheck` 无错。
- [ ] **Step 5: Commit**

```bash
git add config.py schema.py tests/test_schema.py frontend/src/types/analysis.ts
git commit -m "feat(p3): schema Event/PeriodCompare 契约 + STAGE_ORDER + 类型同源再生成

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: snapshots.py — 快照构建 / IO / 基线选择

**Files:**
- Create: `snapshots.py`
- Test: `tests/test_snapshots.py`（新建）

- [ ] **Step 1: 失败测试** — 新建 `tests/test_snapshots.py`：

```python
import json
import snapshots


def _projects():
    return [{"projectId": "P-1", "projectName": "甲"}, {"projectId": "P-2", "projectName": "乙"}]


def _pmis():
    return {
        "P-1": {
            "progress": {"项目阶段": "项目执行", "里程碑进度状态": "正常"},
            "status": {"项目状态": "实施中", "是否暂停": False, "评级": "C"},
            "risk": {"未关闭风险数": 2},
            "cost": {"超支": False, "消耗比": 0.3},
        },
    }


def _nodes():
    return [
        {"projectId": "P-1", "projectName": "甲", "nodeName": "初验款", "isPaymentRelated": True,
         "nodeStatus": "正常实施中", "planDate": "2026-03-31", "expectedPayment": 500000, "actualPayment": 100000},
        {"projectId": "P-1", "projectName": "甲", "nodeName": "阶段验收款", "isPaymentRelated": True,
         "nodeStatus": "延期", "planDate": "2026-01-31", "expectedPayment": 200000, "actualPayment": 0},
        {"projectId": "P-1", "projectName": "甲", "nodeName": "阶段验收款", "isPaymentRelated": True,
         "nodeStatus": "正常实施中", "planDate": "2026-09-30", "expectedPayment": 300000, "actualPayment": 0},
        {"projectId": "P-1", "projectName": "甲", "nodeName": "里程碑", "isPaymentRelated": False},
    ]


class TestBuildSnapshot:
    def test_project_fields_and_pmis_missing_defaults(self):
        snap = snapshots.build_snapshot("2026-06-11", _projects(), _pmis(), _nodes())
        assert snap["date"] == "2026-06-11"
        p1 = snap["projects"]["P-1"]
        assert p1["stage"] == "项目执行" and p1["paused"] is False and p1["openRisks"] == 2
        p2 = snap["projects"]["P-2"]  # 无 pmis → 默认
        assert p2["stage"] is None and p2["openRisks"] == 0 and p2["overspend"] is False

    def test_node_key_ordinal_and_payment_filter(self):
        snap = snapshots.build_snapshot("2026-06-11", _projects(), _pmis(), _nodes())
        keys = sorted(snap["nodes"].keys())
        assert "P-1|初验款#0" in keys
        assert "P-1|阶段验收款#0" in keys and "P-1|阶段验收款#1" in keys  # 同名按行序编号
        assert len(snap["nodes"]) == 3  # isPaymentRelated=False 被排除
        assert snap["nodes"]["P-1|阶段验收款#0"]["planDate"] == "2026-01-31"  # 行序在前的是 #0

    def test_agg(self):
        snap = snapshots.build_snapshot("2026-06-11", _projects(), _pmis(), _nodes())
        agg = snap["agg"]
        assert agg["projectCount"] == 2
        assert agg["expectedTotal"] == 1000000 and agg["actualTotal"] == 100000
        assert agg["paymentRatio"] == 0.1
        assert agg["delayedNodes"] == 1 and agg["openRiskTotal"] == 2 and agg["overspendCount"] == 0


class TestSnapshotIO:
    def test_save_load_roundtrip_and_overwrite(self, tmp_path):
        d = str(tmp_path)
        snap = snapshots.build_snapshot("2026-06-11", _projects(), _pmis(), _nodes())
        snapshots.save_snapshot(d, snap)
        snapshots.save_snapshot(d, snap)  # 同日覆盖不报错
        dates = snapshots.list_snapshot_dates(d)
        assert dates == ["2026-06-11"]
        loaded = snapshots.load_snapshot(d, "2026-06-11")
        assert loaded["agg"]["projectCount"] == 2

    def test_prune_old(self, tmp_path):
        d = str(tmp_path)
        for ds in ["2026-01-01", "2026-06-01", "2026-06-11"]:
            snapshots.save_snapshot(d, {"date": ds, "projects": {}, "nodes": {}, "agg": {}}, today="2026-06-11", keep_days=90)
        assert snapshots.list_snapshot_dates(d) == ["2026-06-01", "2026-06-11"]  # 1 月 1 日(>90天)被清

    def test_list_ignores_invalid_names(self, tmp_path):
        d = str(tmp_path)
        snapshots.save_snapshot(d, {"date": "2026-06-11", "projects": {}, "nodes": {}, "agg": {}})
        (tmp_path / "junk.json").write_text("{}", encoding="utf-8")
        (tmp_path / "not-a-date.json").write_text("{}", encoding="utf-8")
        assert snapshots.list_snapshot_dates(d) == ["2026-06-11"]


class TestPickBaselines:
    def test_pick(self):
        dates = ["2026-03-01", "2026-05-10", "2026-06-04", "2026-06-10", "2026-06-11"]
        b = snapshots.pick_baseline_dates(dates, "2026-06-11")
        assert b["lastSync"] == "2026-06-11"      # 最新一份(同日早前运行)
        assert b["lastWeek"] == "2026-06-04"       # ≤ 今天-7
        assert b["lastMonth"] == "2026-05-10"      # ≤ 今天-30
    def test_insufficient(self):
        assert snapshots.pick_baseline_dates([], "2026-06-11") == {"lastSync": None, "lastWeek": None, "lastMonth": None}
        b = snapshots.pick_baseline_dates(["2026-06-10"], "2026-06-11")
        assert b["lastSync"] == "2026-06-10" and b["lastWeek"] is None and b["lastMonth"] is None
```

- [ ] **Step 2: 确认失败** — `python -m pytest tests/test_snapshots.py -q` → FAIL（模块不存在）
- [ ] **Step 3: 实现** — 新建 `snapshots.py`：

```python
"""项目域快照/事件流(Phase P3, spec 3.3)。

快照=每次数据处理后的精简状态(data/snapshots/YYYY-MM-DD.json,同日覆盖,保留 90 天)。
节点稳定键: "projectId|nodeName#k", k=该(projectId,nodeName)按 rawNodes 原始行序的第 k 次出现
(真实数据无天然唯一键: projectId+nodeName 25 组重复/84 行,无期次字段;行序跨同步最稳,
重复组中间插行仅影响该组内匹配,误差半径有限——P3 设计决策 1)。
"""
import json
import os
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import config


def _agg(projects: Dict[str, dict], nodes: Dict[str, dict]) -> Dict[str, Any]:
    exp = sum(n.get("expected") or 0 for n in nodes.values())
    act = sum(n.get("actual") or 0 for n in nodes.values())
    return {
        "projectCount": len(projects),
        "expectedTotal": round(exp, 2),
        "actualTotal": round(act, 2),
        "paymentRatio": round(act / exp, 4) if exp > 0 else None,
        "delayedNodes": sum(1 for n in nodes.values() if n.get("status") == config.STATUS_DELAYED),
        "openRiskTotal": sum(p.get("openRisks") or 0 for p in projects.values()),
        "overspendCount": sum(1 for p in projects.values() if p.get("overspend")),
    }


def build_snapshot(date_str: str, dept_projects: List[dict], project_pmis: Dict[str, dict],
                   raw_nodes: List[dict]) -> Dict[str, Any]:
    """从 final_data 三块构建精简快照(纯函数)。"""
    projs: Dict[str, dict] = {}
    for p in dept_projects:
        pid = p["projectId"]
        m = project_pmis.get(pid) or {}
        prog = m.get("progress") or {}
        st = m.get("status") or {}
        risk = m.get("risk") or {}
        cost = m.get("cost") or {}
        projs[pid] = {
            "name": p.get("projectName") or "",
            "stage": prog.get("项目阶段"),
            "milestone": prog.get("里程碑进度状态"),
            "status": st.get("项目状态"),
            "paused": bool(st.get("是否暂停")),
            "rating": st.get("评级"),
            "openRisks": int(risk.get("未关闭风险数") or 0),
            "overspend": bool(cost.get("超支")),
            "costRatio": cost.get("消耗比"),
        }
    nodes: Dict[str, dict] = {}
    seen: Dict[tuple, int] = {}
    for n in raw_nodes:
        if not n.get("isPaymentRelated"):
            continue
        pid = str(n.get("projectId") or "")
        nm = str(n.get("nodeName") or "")
        k = seen.get((pid, nm), 0)
        seen[(pid, nm)] = k + 1
        nodes[f"{pid}|{nm}#{k}"] = {
            "pid": pid,
            "pname": str(n.get("projectName") or ""),
            "node": nm,
            "status": n.get("nodeStatus") or "",
            "planDate": n.get("planDate") or "",
            "actual": float(n.get("actualPayment") or 0),
            "expected": float(n.get("expectedPayment") or 0),
        }
    return {"date": date_str, "projects": projs, "nodes": nodes, "agg": _agg(projs, nodes)}


# ── 文件 IO(目录由调用方传入,frozen 安全由 preprocess 的 OUTPUT_DIR 保证) ──

def _is_date_name(s: str) -> bool:
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


def list_snapshot_dates(dirpath: str) -> List[str]:
    if not os.path.isdir(dirpath):
        return []
    out = [f[:-5] for f in os.listdir(dirpath) if f.endswith(".json") and _is_date_name(f[:-5])]
    return sorted(out)


def load_snapshot(dirpath: str, date_str: str) -> Optional[dict]:
    path = os.path.join(dirpath, f"{date_str}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_snapshot(dirpath: str, snap: dict, today: Optional[str] = None, keep_days: int = 90) -> None:
    """写当日快照(同日覆盖),并清理 today-keep_days 之前的旧份。"""
    os.makedirs(dirpath, exist_ok=True)
    with open(os.path.join(dirpath, f"{snap['date']}.json"), "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, separators=(",", ":"))
    cutoff = date.fromisoformat(today or snap["date"]) - timedelta(days=keep_days)
    for ds in list_snapshot_dates(dirpath):
        if date.fromisoformat(ds) < cutoff:
            os.remove(os.path.join(dirpath, f"{ds}.json"))


def pick_baseline_dates(dates: List[str], today: str) -> Dict[str, Optional[str]]:
    """三基线: lastSync=最新一份; lastWeek=≤今天-7 最近; lastMonth=≤今天-30 最近(spec 3.3)。"""
    dates = sorted(dates)
    t = date.fromisoformat(today)

    def latest_at_or_before(cutoff: date) -> Optional[str]:
        cands = [d for d in dates if date.fromisoformat(d) <= cutoff]
        return cands[-1] if cands else None

    return {
        "lastSync": dates[-1] if dates else None,
        "lastWeek": latest_at_or_before(t - timedelta(days=7)),
        "lastMonth": latest_at_or_before(t - timedelta(days=30)),
    }
```

- [ ] **Step 4: 通过** — `python -m pytest tests/test_snapshots.py -q` PASS（9 cases）
- [ ] **Step 5: Commit**

```bash
git add snapshots.py tests/test_snapshots.py
git commit -m "feat(p3): snapshots.py 快照构建/IO/90天保留/三基线选择(节点稳定键 projectId|nodeName#k)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: diff 引擎 — 事件流

**Files:**
- Modify: `snapshots.py`（追加 diff_snapshots / append_events）
- Test: `tests/test_snapshots.py`（追加）

- [ ] **Step 1: 失败测试** — `tests/test_snapshots.py` 追加：

```python
def _snap(date_str, projects=None, nodes=None):
    projects = projects or {}
    nodes = nodes or {}
    return {"date": date_str, "projects": projects, "nodes": nodes,
            "agg": snapshots._agg(projects, nodes)}


def _proj(name="甲", stage="项目执行", milestone="正常", status="实施中",
          paused=False, rating="C", openRisks=0, overspend=False, costRatio=0.3):
    return {"name": name, "stage": stage, "milestone": milestone, "status": status,
            "paused": paused, "rating": rating, "openRisks": openRisks,
            "overspend": overspend, "costRatio": costRatio}


def _node(pid="P-1", pname="甲", node="初验款", status="正常实施中",
          planDate="2026-03-31", actual=0.0, expected=500000.0):
    return {"pid": pid, "pname": pname, "node": node, "status": status,
            "planDate": planDate, "actual": actual, "expected": expected}


class TestDiffProjects:
    def test_enter_and_leave_domain(self):
        prev = _snap("2026-06-10", {"P-1": _proj()})
        cur = _snap("2026-06-11", {"P-2": _proj(name="乙")})
        evs = snapshots.diff_snapshots(prev, cur)
        types = {(e["type"], e["projectId"]) for e in evs}
        assert ("进入主域", "P-2") in types and ("移出主域", "P-1") in types

    def test_stage_milestone_status_rating_changes(self):
        prev = _snap("2026-06-10", {"P-1": _proj()})
        cur = _snap("2026-06-11", {"P-1": _proj(stage="项目收尾", milestone="延期", status="待验收", rating="B")})
        evs = snapshots.diff_snapshots(prev, cur)
        by = {e["type"]: e for e in evs}
        assert by["阶段变更"]["prev"] == "项目执行" and by["阶段变更"]["curr"] == "项目收尾"
        assert by["里程碑状态变更"]["curr"] == "延期"
        assert by["项目状态变更"]["curr"] == "待验收"
        assert by["评级变化"]["curr"] == "B"
        assert all(e["domain"] == "project" for e in evs)

    def test_pause_resume_risk_overspend(self):
        prev = _snap("2026-06-10", {"P-1": _proj(openRisks=1, overspend=False),
                                    "P-2": _proj(name="乙", paused=True, overspend=True)})
        cur = _snap("2026-06-11", {"P-1": _proj(openRisks=3, overspend=True),
                                   "P-2": _proj(name="乙", paused=False, overspend=False)})
        types = {(e["type"], e["projectId"]) for e in snapshots.diff_snapshots(prev, cur)}
        assert ("风险数增减", "P-1") in types and ("超支出现", "P-1") in types
        assert ("恢复", "P-2") in types and ("超支解除", "P-2") in types

    def test_no_change_no_events_and_none_stage_not_event(self):
        prev = _snap("2026-06-10", {"P-1": _proj(stage=None)})
        cur = _snap("2026-06-11", {"P-1": _proj(stage=None)})
        assert snapshots.diff_snapshots(prev, cur) == []


class TestDiffNodes:
    def test_payment_received_with_amount(self):
        prev = _snap("2026-06-10", {"P-1": _proj()}, {"P-1|初验款#0": _node(actual=100000)})
        cur = _snap("2026-06-11", {"P-1": _proj()}, {"P-1|初验款#0": _node(actual=350000)})
        evs = snapshots.diff_snapshots(prev, cur)
        assert len(evs) == 1
        e = evs[0]
        assert e["type"] == "到账" and e["domain"] == "payment" and e["amount"] == 250000
        assert e["projectId"] == "P-1" and "初验款" in e["summary"]

    def test_delay_full_paid_plan_date_change(self):
        prev = _snap("2026-06-10", {"P-1": _proj()}, {
            "P-1|a#0": _node(node="a", status="正常实施中"),
            "P-1|b#0": _node(node="b", status="正常实施中", actual=0),
            "P-1|c#0": _node(node="c", planDate="2026-03-31"),
        })
        cur = _snap("2026-06-11", {"P-1": _proj()}, {
            "P-1|a#0": _node(node="a", status="延期"),
            "P-1|b#0": _node(node="b", status="已全额回款", actual=500000),
            "P-1|c#0": _node(node="c", planDate="2026-06-30"),
        })
        types = {e["type"] for e in snapshots.diff_snapshots(prev, cur)}
        assert {"延期发生", "回款完成", "到账", "计划回款日变更"} <= types

    def test_node_added_removed(self):
        prev = _snap("2026-06-10", {"P-1": _proj()}, {"P-1|旧#0": _node(node="旧")})
        cur = _snap("2026-06-11", {"P-1": _proj()}, {"P-1|新#0": _node(node="新")})
        types = {e["type"] for e in snapshots.diff_snapshots(prev, cur)}
        assert {"回款节点新增", "回款节点移除"} <= types


class TestAppendEvents:
    def test_append_and_cap(self, tmp_path):
        path = str(tmp_path / "events.json")
        first = [{"date": "2026-06-10", "type": "到账", "domain": "payment",
                  "projectId": "P-1", "projectName": "甲", "summary": "s", "amount": 1.0}]
        out = snapshots.append_events(path, first, cap=3)
        assert len(out) == 1
        more = [dict(first[0], date="2026-06-11", summary=f"s{i}") for i in range(3)]
        out = snapshots.append_events(path, more, cap=3)
        assert len(out) == 3 and out[0]["summary"] == "s0"  # 旧的被截掉,保留最新 3 条(旧→新)
        with open(path, encoding="utf-8") as f:
            assert len(json.load(f)) == 3
```

- [ ] **Step 2: 确认失败** — `python -m pytest tests/test_snapshots.py -q` → 新增 FAIL
- [ ] **Step 3: 实现** — `snapshots.py` 追加：

```python
def _ev(date_str: str, etype: str, domain: str, pid: str, pname: str, summary: str,
        prev: Any = None, curr: Any = None, amount: Optional[float] = None) -> dict:
    return {"date": date_str, "type": etype, "domain": domain, "projectId": pid,
            "projectName": pname, "summary": summary, "prev": prev, "curr": curr, "amount": amount}


def diff_snapshots(prev: dict, cur: dict) -> List[dict]:
    """两快照 diff → 事件列表(spec 3.3 事件类型;纯函数,事件日期取 cur 日期)。"""
    evs: List[dict] = []
    d = cur["date"]
    pp, cp = prev.get("projects") or {}, cur.get("projects") or {}

    for pid, b in cp.items():
        name = b.get("name") or ""
        a = pp.get(pid)
        if a is None:
            evs.append(_ev(d, "进入主域", "project", pid, name, "新进入项目主域"))
            continue
        for field, etype in (("stage", "阶段变更"), ("milestone", "里程碑状态变更"),
                             ("status", "项目状态变更"), ("rating", "评级变化")):
            if a.get(field) != b.get(field):
                evs.append(_ev(d, etype, "project", pid, name,
                               f"{a.get(field) or '-'} → {b.get(field) or '-'}",
                               prev=a.get(field), curr=b.get(field)))
        if bool(a.get("paused")) != bool(b.get("paused")):
            etype = "暂停" if b.get("paused") else "恢复"
            evs.append(_ev(d, etype, "project", pid, name, f"项目{etype}"))
        ra, rb = int(a.get("openRisks") or 0), int(b.get("openRisks") or 0)
        if ra != rb:
            evs.append(_ev(d, "风险数增减", "project", pid, name,
                           f"未关闭风险 {ra} → {rb}", prev=ra, curr=rb))
        if bool(a.get("overspend")) != bool(b.get("overspend")):
            etype = "超支出现" if b.get("overspend") else "超支解除"
            evs.append(_ev(d, etype, "project", pid, name, etype))
    for pid, a in pp.items():
        if pid not in cp:
            evs.append(_ev(d, "移出主域", "project", pid, a.get("name") or "", "移出项目主域"))

    pn, cn = prev.get("nodes") or {}, cur.get("nodes") or {}
    for key, b in cn.items():
        a = pn.get(key)
        pid, pname, node = b.get("pid") or "", b.get("pname") or "", b.get("node") or ""
        if a is None:
            evs.append(_ev(d, "回款节点新增", "payment", pid, pname, f"新增节点「{node}」"))
            continue
        delta = round((b.get("actual") or 0) - (a.get("actual") or 0), 2)
        if delta > 0:
            evs.append(_ev(d, "到账", "payment", pid, pname,
                           f"「{node}」到账 {round(delta / 10000, 2)} 万",
                           prev=a.get("actual"), curr=b.get("actual"), amount=delta))
        sa, sb = a.get("status"), b.get("status")
        if sa != sb:
            if sb == config.STATUS_DELAYED:
                evs.append(_ev(d, "延期发生", "payment", pid, pname,
                               f"「{node}」{sa or '-'} → 延期", prev=sa, curr=sb))
            elif sb == config.STATUS_FULL_PAID:
                evs.append(_ev(d, "回款完成", "payment", pid, pname,
                               f"「{node}」已全额回款", prev=sa, curr=sb))
        if (a.get("planDate") or "") != (b.get("planDate") or ""):
            evs.append(_ev(d, "计划回款日变更", "payment", pid, pname,
                           f"「{node}」计划日 {a.get('planDate') or '-'} → {b.get('planDate') or '-'}",
                           prev=a.get("planDate"), curr=b.get("planDate")))
    for key, a in pn.items():
        if key not in cn:
            evs.append(_ev(d, "回款节点移除", "payment", a.get("pid") or "",
                           a.get("pname") or "", f"节点「{a.get('node') or ''}」移除"))
    return evs


def append_events(path: str, new_events: List[dict], cap: int = 500) -> List[dict]:
    """events.json 旧→新追加,超 cap 截头;返回截断后的全量列表。"""
    existing: List[dict] = []
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                existing = json.load(f)
        except (json.JSONDecodeError, OSError):
            existing = []
    merged = (existing + new_events)[-cap:]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
    return merged
```

- [ ] **Step 4: 通过** — `python -m pytest tests/test_snapshots.py -q` PASS
- [ ] **Step 5: Commit**

```bash
git add snapshots.py tests/test_snapshots.py
git commit -m "feat(p3): diff_snapshots 事件引擎(项目8类/回款5类,config常量判定) + events.json 追加截断

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: compute_period_compare 周期对比

**Files:**
- Modify: `snapshots.py`（追加）
- Test: `tests/test_snapshots.py`（追加）

- [ ] **Step 1: 失败测试** — 追加：

```python
class TestPeriodCompare:
    def _base(self):
        return _snap("2026-06-04",
                     {"P-1": _proj(stage="项目规划", openRisks=1, overspend=False),
                      "P-2": _proj(name="乙", stage="项目执行", overspend=False)},
                     {"P-1|a#0": _node(node="a", actual=100000, status="正常实施中")})

    def _cur(self):
        return _snap("2026-06-11",
                     {"P-1": _proj(stage="项目执行", openRisks=3, overspend=True),
                      "P-2": _proj(name="乙", stage="项目执行", overspend=False),
                      "P-3": _proj(name="丙", overspend=True)},  # 新项目超支也计新超支
                     {"P-1|a#0": _node(node="a", actual=400000, status="延期"),
                      "P-1|b#0": _node(node="b", actual=50000, status="延期")})

    def test_entry_metrics(self):
        e = snapshots.compute_period_compare_entry("2026-06-04", self._base(), self._cur())
        assert e["baseDate"] == "2026-06-04"
        assert e["advancedProjects"] == 1          # P-1 规划→执行
        assert e["newDelayedNodes"] == 2           # a 转延期 + b 新增即延期
        assert e["paymentGained"] == 350000        # a +30万, b 新节点 5万
        assert e["riskNetChange"] == 2             # openRiskTotal 1→3
        assert e["newOverspendProjects"] == 2      # P-1 false→true + P-3 新入即超支
        # paymentRatio: base 100000/500000=0.2, cur 450000/1000000=0.45 → +25.0pp
        assert e["paymentRatioChange"] == 25.0

    def test_ratio_none_when_base_missing(self):
        base = _snap("2026-06-04", {"P-1": _proj()}, {})  # exp=0 → ratio None
        e = snapshots.compute_period_compare_entry("2026-06-04", base, self._cur())
        assert e["paymentRatioChange"] is None
```

- [ ] **Step 2: 确认失败**（同前）
- [ ] **Step 3: 实现** — `snapshots.py` 追加：

```python
def compute_period_compare_entry(base_date: str, base: dict, cur: dict) -> dict:
    """单基线六指标(spec 3.3): 直接 diff 快照,不累加事件。"""
    order = {s: i for i, s in enumerate(config.STAGE_ORDER)}
    bp, cp = base.get("projects") or {}, cur.get("projects") or {}
    advanced = sum(
        1 for pid, b in cp.items()
        if pid in bp and bp[pid].get("stage") in order and b.get("stage") in order
        and order[b["stage"]] > order[bp[pid]["stage"]]
    )
    bn, cn = base.get("nodes") or {}, cur.get("nodes") or {}
    new_delayed = sum(
        1 for k, v in cn.items()
        if v.get("status") == config.STATUS_DELAYED
        and (k not in bn or bn[k].get("status") != config.STATUS_DELAYED)
    )
    gained = round(sum(
        max((v.get("actual") or 0) - ((bn.get(k) or {}).get("actual") or 0), 0)
        for k, v in cn.items()
    ), 2)
    risk_net = int((cur.get("agg") or {}).get("openRiskTotal") or 0) - int((base.get("agg") or {}).get("openRiskTotal") or 0)
    new_overspend = sum(1 for pid, v in cp.items()
                        if v.get("overspend") and not (bp.get(pid) or {}).get("overspend"))
    rb = (base.get("agg") or {}).get("paymentRatio")
    rc = (cur.get("agg") or {}).get("paymentRatio")
    ratio_change = round((rc - rb) * 100, 1) if (rb is not None and rc is not None) else None
    return {
        "baseDate": base_date,
        "advancedProjects": advanced,
        "newDelayedNodes": new_delayed,
        "paymentGained": gained,
        "riskNetChange": risk_net,
        "newOverspendProjects": new_overspend,
        "paymentRatioChange": ratio_change,
    }
```

- [ ] **Step 4: 通过** — `python -m pytest tests/test_snapshots.py -q` PASS
- [ ] **Step 5: Commit**

```bash
git add snapshots.py tests/test_snapshots.py
git commit -m "feat(p3): compute_period_compare_entry 周期对比六指标(直接diff快照)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: preprocess 集成 + events.json + 打包/忽略清单

**Files:**
- Modify: `preprocess_data.py`（第 10 步 final_data 组装后、校验前插入 9d 段）
- Modify: `PaymentReviewApp.spec`（datas 加 snapshots.py）
- Modify: `.gitignore`（data/snapshots/、data/events.json）
- Test: `tests/test_preprocess_snapshots.py`（新建，集成测试用 tmp 目录 monkeypatch）

- [ ] **Step 1: 失败测试** — 新建 `tests/test_preprocess_snapshots.py`：

```python
"""9d 集成段的可测核心: run_snapshot_pipeline(独立函数,目录可注入)。"""
import json
import os
import snapshots
from preprocess_data import run_snapshot_pipeline


def _final_data(actual=0.0):
    return {
        "projects": [{"projectId": "P-1", "projectName": "甲"}],
        "projectPmis": {"P-1": {"progress": {"项目阶段": "项目执行"}, "status": {}, "risk": {}, "cost": {}}},
        "rawNodes": [{"projectId": "P-1", "projectName": "甲", "nodeName": "初验款",
                      "isPaymentRelated": True, "nodeStatus": "正常实施中",
                      "planDate": "2026-03-31", "expectedPayment": 500000, "actualPayment": actual}],
    }


class TestRunSnapshotPipeline:
    def test_first_run_no_events(self, tmp_path):
        d = str(tmp_path)
        fd = _final_data()
        events, period = run_snapshot_pipeline(fd, d, today="2026-06-10")
        assert events == []
        assert period == {"lastSync": None, "lastWeek": None, "lastMonth": None}
        assert snapshots.list_snapshot_dates(os.path.join(d, "snapshots")) == ["2026-06-10"]

    def test_second_run_emits_events_and_compare(self, tmp_path):
        d = str(tmp_path)
        run_snapshot_pipeline(_final_data(actual=0.0), d, today="2026-06-10")
        events, period = run_snapshot_pipeline(_final_data(actual=200000.0), d, today="2026-06-11")
        assert any(e["type"] == "到账" and e["amount"] == 200000 for e in events)
        assert events[0]["date"] == "2026-06-11"  # 内嵌新在前
        assert period["lastSync"]["baseDate"] == "2026-06-10"
        assert period["lastSync"]["paymentGained"] == 200000
        assert period["lastWeek"] is None
        # events.json 落盘
        with open(os.path.join(d, "events.json"), encoding="utf-8") as f:
            assert len(json.load(f)) >= 1

    def test_same_day_rerun_overwrites_snapshot(self, tmp_path):
        d = str(tmp_path)
        run_snapshot_pipeline(_final_data(actual=0.0), d, today="2026-06-11")
        events, period = run_snapshot_pipeline(_final_data(actual=100000.0), d, today="2026-06-11")
        assert any(e["type"] == "到账" for e in events)  # 与同日早前一份相比
        assert snapshots.list_snapshot_dates(os.path.join(d, "snapshots")) == ["2026-06-11"]
```

- [ ] **Step 2: 确认失败** — `python -m pytest tests/test_preprocess_snapshots.py -q` → FAIL
- [ ] **Step 3: 实现**

`preprocess_data.py`：模块顶部 import 区加 `import snapshots as snapshots_mod`（对齐 `import projects as projects_mod` 风格）。在 `def main():` 之前加独立函数（可测，目录注入）：

```python
def run_snapshot_pipeline(final_data, output_dir, today=None):
    """9d. 快照/diff/事件/周期对比(Phase P3, spec 3.3)。
    返回 (events_embed 新在前最多100条, period_compare dict)。
    时序: 先 diff 既有最新快照(含同日早前一次) → 算周期对比 → 再覆盖写当日快照。"""
    today = today or datetime.now().strftime("%Y-%m-%d")
    snap_dir = os.path.join(output_dir, "snapshots")
    events_path = os.path.join(output_dir, "events.json")

    cur = snapshots_mod.build_snapshot(
        today, final_data["projects"], final_data["projectPmis"], final_data["rawNodes"])

    dates = snapshots_mod.list_snapshot_dates(snap_dir)
    baselines = snapshots_mod.pick_baseline_dates(dates, today)

    new_events = []
    if baselines["lastSync"]:
        prev = snapshots_mod.load_snapshot(snap_dir, baselines["lastSync"])
        if prev:
            new_events = snapshots_mod.diff_snapshots(prev, cur)
    all_events = snapshots_mod.append_events(events_path, new_events, cap=500)

    period = {}
    for key in ("lastSync", "lastWeek", "lastMonth"):
        ds = baselines[key]
        base = snapshots_mod.load_snapshot(snap_dir, ds) if ds else None
        period[key] = snapshots_mod.compute_period_compare_entry(ds, base, cur) if base else None

    snapshots_mod.save_snapshot(snap_dir, cur, today=today, keep_days=90)
    return list(reversed(all_events[-100:])), period
```

`main()` 中，`final_data = {...}` 组装之后、`validate_and_write_json` 之前插入：

```python
    # === 9d. 快照/diff/事件流/周期对比(Phase P3) ===
    print("[INFO] 生成快照与项目动态...")
    events_embed, period_compare = run_snapshot_pipeline(final_data, OUTPUT_DIR)
    final_data["events"] = events_embed
    final_data["periodCompare"] = period_compare
    if events_embed:
        print(f"  [OK] 新事件 {len([e for e in events_embed if e['date'] == datetime.now().strftime('%Y-%m-%d')])} 条,内嵌最近 {len(events_embed)} 条")
    else:
        print("  [INFO] 首次快照,暂无变化记录")
```

`PaymentReviewApp.spec`：datas 中 `('projects.py', '.')` 之后加 `('snapshots.py', '.')`。

`.gitignore`：在 `data/followup_records.json` 之前加：

```
# 快照与事件流（运行时生成，Phase P3）
data/snapshots/
data/events.json
```

- [ ] **Step 4: 通过 + 真实数据冒烟** — `python -m pytest -q` 全量 PASS；然后 `python preprocess_data.py` 跑两遍真实数据：第一遍打印"首次快照"，第二遍 `data/snapshots/` 出现当日文件、analysis_data.json 含 `events`/`periodCompare`（lastSync 基线非 null）。
- [ ] **Step 5: Commit**

```bash
git add preprocess_data.py PaymentReviewApp.spec .gitignore tests/test_preprocess_snapshots.py
git commit -m "feat(p3): preprocess 9d 快照管道集成(先diff后覆盖+events.json+内嵌100条) + 打包datas/gitignore

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 前端 lib/activity + EventTimeline 组件

**Files:**
- Create: `frontend/src/lib/activity.ts`、`frontend/src/components/EventTimeline.vue`
- Test: `frontend/src/lib/activity.test.ts`、`frontend/src/components/EventTimeline.test.ts`

- [ ] **Step 1: 失败测试** — `frontend/src/lib/activity.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Event } from '@/types/analysis'
import { filterEvents, groupEventsByDate, type ActivityFilters } from './activity'

const EVS = [
  { date: '2026-06-11', type: '到账', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「初验款」到账 25 万', amount: 250000 },
  { date: '2026-06-11', type: '阶段变更', domain: 'project', projectId: 'P-2', projectName: '乙', summary: '项目规划 → 项目执行' },
  { date: '2026-06-10', type: '延期发生', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「b」正常实施中 → 延期' },
] as unknown as Event[]

const F0: ActivityFilters = { domain: '', query: '' }

describe('filterEvents', () => {
  it('按 domain 过滤', () => {
    expect(filterEvents(EVS, { ...F0, domain: 'project' })).toHaveLength(1)
    expect(filterEvents(EVS, { ...F0, domain: 'payment' })).toHaveLength(2)
    expect(filterEvents(EVS, F0)).toHaveLength(3)
  })
  it('query 命中 项目名/编号/摘要/类型', () => {
    expect(filterEvents(EVS, { ...F0, query: 'p-2' })).toHaveLength(1)
    expect(filterEvents(EVS, { ...F0, query: '初验款' })).toHaveLength(1)
    expect(filterEvents(EVS, { ...F0, query: '延期' })).toHaveLength(1)
    expect(filterEvents(EVS, { ...F0, query: '不存在' })).toHaveLength(0)
  })
})

describe('groupEventsByDate', () => {
  it('按日分组保持输入顺序(新在前)', () => {
    const g = groupEventsByDate(EVS)
    expect(g.map((x) => x.date)).toEqual(['2026-06-11', '2026-06-10'])
    expect(g[0].items).toHaveLength(2)
  })
})
```

`frontend/src/components/EventTimeline.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import EventTimeline from './EventTimeline.vue'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

const EVS = [
  { date: '2026-06-11', type: '到账', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「初验款」到账 25 万' },
  { date: '2026-06-10', type: '阶段变更', domain: 'project', projectId: 'P-2', projectName: '乙', summary: '项目规划 → 项目执行' },
] as any[]

describe('EventTimeline', () => {
  it('按日分组渲染 类型徽章+项目链接+摘要', () => {
    const w = mount(EventTimeline, { props: { events: EVS }, global: { plugins: [router] } })
    expect(w.text()).toContain('2026-06-11')
    expect(w.text()).toContain('到账')
    expect(w.text()).toContain('甲')
    const link = w.find('a[href="/project/P-2"]')
    expect(link.exists()).toBe(true)
  })
  it('空事件显示空态文案(可定制)', () => {
    const w = mount(EventTimeline, { props: { events: [], emptyText: '首次同步，暂无变化记录' }, global: { plugins: [router] } })
    expect(w.text()).toContain('首次同步，暂无变化记录')
  })
})
```

- [ ] **Step 2: 确认失败** — `cd frontend && npx vitest run src/lib/activity.test.ts src/components/EventTimeline.test.ts` → FAIL
- [ ] **Step 3: 实现**

`frontend/src/lib/activity.ts`：

```ts
import type { Event } from '@/types/analysis'

export interface ActivityFilters {
  domain: string // '' | 'project' | 'payment'
  query: string
}

export interface DayGroup {
  date: string
  items: Event[]
}

export function filterEvents(events: Event[], f: ActivityFilters): Event[] {
  const q = (f.query || '').trim().toLowerCase()
  return events.filter((e) => {
    if (f.domain && e.domain !== f.domain) return false
    if (q && ![e.projectName, e.projectId, e.summary, e.type]
      .some((s) => String(s || '').toLowerCase().includes(q))) return false
    return true
  })
}

/** 按日分组,保持输入顺序(events 内嵌即新在前) */
export function groupEventsByDate(events: Event[]): DayGroup[] {
  const out: DayGroup[] = []
  for (const e of events) {
    const last = out[out.length - 1]
    if (last && last.date === e.date) last.items.push(e)
    else out.push({ date: String(e.date), items: [e] })
  }
  return out
}
```

`frontend/src/components/EventTimeline.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Event } from '@/types/analysis'
import { groupEventsByDate } from '@/lib/activity'

const props = withDefaults(defineProps<{ events: Event[]; emptyText?: string }>(), {
  emptyText: '暂无动态',
})
const groups = computed(() => groupEventsByDate(props.events))
</script>

<template>
  <div class="ev-timeline">
    <div v-if="!props.events.length" class="ev-empty">{{ props.emptyText }}</div>
    <div v-for="g in groups" :key="g.date" class="ev-day">
      <div class="ev-date u-num">{{ g.date }}</div>
      <div v-for="(e, i) in g.items" :key="`${g.date}-${i}`" class="ev-item">
        <span class="ev-type" :class="e.domain === 'payment' ? 'pay' : 'proj'">{{ e.type }}</span>
        <RouterLink v-if="e.projectId" class="ev-proj" :to="`/project/${e.projectId}`">{{ e.projectName || e.projectId }}</RouterLink>
        <span class="ev-summary">{{ e.summary }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ev-empty { color: var(--mut); font-size: 13px; padding: 24px 0; text-align: center; }
.ev-day { margin-bottom: 12px; }
.ev-date { font-size: 12px; font-weight: 700; color: var(--sub); padding: 4px 0; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.ev-item { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; font-size: 13px; flex-wrap: wrap; }
.ev-type { flex-shrink: 0; padding: 0 8px; border-radius: var(--r-full); font-size: 11px; font-weight: 600; line-height: 1.7; }
.ev-type.proj { background: var(--selected-tint); color: var(--accent); }
.ev-type.pay { background: var(--ok-bg); color: var(--ok-text); }
.ev-proj { color: var(--accent); text-decoration: none; font-weight: 600; flex-shrink: 0; }
.ev-proj:hover { text-decoration: underline; }
.ev-summary { color: var(--txt); }
</style>
```

- [ ] **Step 4: 通过** — 同 Step 2 命令 PASS
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/activity.ts frontend/src/lib/activity.test.ts frontend/src/components/EventTimeline.vue frontend/src/components/EventTimeline.test.ts
git commit -m "feat(p3): lib/activity 过滤/按日分组 + EventTimeline 时间线组件(域徽章+项目链接)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: ActivityView + `/activity` 路由 + 导航

**Files:**
- Create: `frontend/src/views/ActivityView.vue`
- Modify: `frontend/src/router/index.ts`、`frontend/src/nav.ts`（PROJECT_LINKS 加一条）
- Test: `frontend/src/views/ActivityView.test.ts`（新建）、`frontend/src/router/index.test.ts`（loop 加 '/activity'）、`frontend/src/layout/AppSidebar.test.ts`（断言加 '项目动态'）

- [ ] **Step 1: 失败测试** — `frontend/src/views/ActivityView.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ActivityView from './ActivityView.vue'
import { useDataStore } from '@/stores/data'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/activity', component: ActivityView },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

function seed(over: Record<string, any> = {}) {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {},
    events: [
      { date: '2026-06-11', type: '到账', domain: 'payment', projectId: 'P-1', projectName: '甲', summary: '「初验款」到账 25 万' },
      { date: '2026-06-10', type: '阶段变更', domain: 'project', projectId: 'P-2', projectName: '乙', summary: '项目规划 → 项目执行' },
    ],
    periodCompare: {
      lastSync: { baseDate: '2026-06-10', advancedProjects: 1, newDelayedNodes: 2, paymentGained: 250000, riskNetChange: -1, newOverspendProjects: 0, paymentRatioChange: 1.5 },
      lastWeek: null, lastMonth: null,
    },
    ...over,
  } as any
}

function mountView() {
  return mount(ActivityView, { global: { plugins: [ElementPlus, router] } })
}

describe('ActivityView', () => {
  it('周期对比卡(默认上次同步)+时间线渲染', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('阶段推进')
    expect(w.text()).toContain('25')          // 回款新增 fmtWan(250000)=25
    expect(w.text()).toContain('对比 2026-06-10')
    expect(w.text()).toContain('「初验款」到账 25 万')
    expect(w.text()).toContain('阶段变更')
  })

  it('切到快照不足的基线显示置灰提示', async () => {
    seed()
    const w = mountView()
    await w.find('[data-test="seg-lastWeek"]').trigger('click')
    expect(w.text()).toContain('快照不足')
  })

  it('域筛选只剩项目类', async () => {
    seed()
    const w = mountView()
    await w.find('[data-test="seg-project"]').trigger('click')
    expect(w.text()).toContain('阶段变更')
    expect(w.text()).not.toContain('到账')
  })

  it('无事件显示首次同步空态', () => {
    seed({ events: [], periodCompare: null })
    const w = mountView()
    expect(w.text()).toContain('首次同步，暂无变化记录')
  })
})
```

`router/index.test.ts` 的 top-level 数组加 `'/activity'`；`AppSidebar.test.ts` 三段分组用例加 `expect(text).toContain('项目动态')`。

- [ ] **Step 2: 确认失败** — 相关三文件 vitest → FAIL
- [ ] **Step 3: 实现**

`frontend/src/nav.ts` PROJECT_LINKS 改为：

```ts
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目清单', to: '/projects' },
  { label: '项目动态', to: '/activity' },
]
```

`frontend/src/router/index.ts`：import `ActivityView`；`/project/:id` 条目后加：

```ts
    { path: '/activity', name: 'activity', component: ActivityView, meta: { title: '项目动态', hideFilter: true } },
```

新建 `frontend/src/views/ActivityView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import type { Event } from '@/types/analysis'
import { filterEvents, type ActivityFilters } from '@/lib/activity'
import { fmtWan } from '@/lib/format'
import SegToggle from '@/components/SegToggle.vue'
import EventTimeline from '@/components/EventTimeline.vue'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

// —— 周期对比(spec 4.4 顶部卡条;基线不足置灰) ——
const BASELINES = [
  { value: 'lastSync', label: '上次同步' },
  { value: 'lastWeek', label: '上周' },
  { value: 'lastMonth', label: '上月' },
]
const baseline = ref('lastSync')
const entry = computed(() => {
  const pc = (data.data as any)?.periodCompare
  return pc ? pc[baseline.value] ?? null : null
})
const compareCards = computed(() => {
  const e = entry.value
  if (!e) return []
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n))
  return [
    { k: '阶段推进', v: `${e.advancedProjects} 项` },
    { k: '新增延期节点', v: String(e.newDelayedNodes) },
    { k: '回款新增(万)', v: fmtWan(e.paymentGained) },
    { k: '风险净增', v: sign(e.riskNetChange) },
    { k: '新超支项目', v: String(e.newOverspendProjects) },
    { k: '回款达成率', v: e.paymentRatioChange == null ? '-' : `${sign(e.paymentRatioChange)}pp` },
  ]
})

// —— 时间线 ——
const events = computed(() => ((data.data as any)?.events ?? []) as Event[])
const DOMAINS = [
  { value: '', label: '全部' },
  { value: 'project', label: '项目类' },
  { value: 'payment', label: '回款类' },
]
const filters = reactive<ActivityFilters>({ domain: '', query: '' })
const filtered = computed(() => filterEvents(events.value, filters))
</script>

<template>
  <div class="activity-view">
    <h2 class="av-title">项目动态</h2>

    <div class="av-compare">
      <div class="av-compare-head">
        <span class="av-compare-label">周期对比</span>
        <SegToggle v-model="baseline" :options="BASELINES" />
        <span v-if="entry" class="av-base-date">对比 {{ entry.baseDate }}</span>
      </div>
      <div v-if="entry" class="av-cards">
        <div v-for="c in compareCards" :key="c.k" class="av-card">
          <div class="av-card-v u-num">{{ c.v }}</div>
          <div class="av-card-k">{{ c.k }}</div>
        </div>
      </div>
      <div v-else class="av-insufficient">快照不足，该基线暂无对比数据。</div>
    </div>

    <div class="av-toolbar">
      <SegToggle v-model="filters.domain" :options="DOMAINS" />
      <el-input v-model="filters.query" size="small" placeholder="搜索 项目/摘要/类型" clearable style="width: 220px" />
    </div>
    <EventTimeline :events="filtered" empty-text="首次同步，暂无变化记录" />
  </div>
</template>

<style scoped>
.activity-view { padding: 16px; }
.av-title { font-size: 18px; font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.av-compare { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px 16px; margin-bottom: 14px; }
.av-compare-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.av-compare-label { font-weight: 700; font-size: 13px; color: var(--txt); }
.av-base-date { font-size: 12px; color: var(--mut); }
.av-cards { display: flex; flex-wrap: wrap; gap: 10px; }
.av-card { flex: 1; min-width: 110px; background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 12px; }
.av-card-v { font-size: 16px; font-weight: 700; color: var(--txt); }
.av-card-k { font-size: 12px; color: var(--mut); margin-top: 2px; }
.av-insufficient { color: var(--mut); font-size: 13px; padding: 8px 0; opacity: var(--disabled-opacity); }
.av-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
</style>
```

- [ ] **Step 4: 通过** — `cd frontend && npx vitest run src/views/ActivityView.test.ts src/router/index.test.ts src/layout/AppSidebar.test.ts` PASS
- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/ActivityView.vue frontend/src/views/ActivityView.test.ts frontend/src/router/index.ts frontend/src/router/index.test.ts frontend/src/nav.ts frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(p3): /activity 项目动态页(三基线周期对比卡+域筛选+按日时间线) + 导航项目动态

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 详情页右栏动态（补 P2 推迟项，spec 4.2 布局 B 完整态）

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue`
- Test: `frontend/src/views/ProjectDetailView.test.ts`（追加 2 用例）

- [ ] **Step 1: 失败测试** — `ProjectDetailView.test.ts`：seed 的 ds.data 增加 `events` 字段：

```ts
    events: [
      { date: '2026-06-11', type: '到账', domain: 'payment', projectId: 'P-1', projectName: '终端安全项目', summary: '「初验款」到账 25 万' },
      { date: '2026-06-10', type: '阶段变更', domain: 'project', projectId: 'P-9', projectName: '他人项目', summary: '不应出现' },
    ],
```

追加用例：

```ts
  it('右栏只显示本项目动态', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    expect(w.find('.pd-aside').exists()).toBe(true)
    expect(w.text()).toContain('「初验款」到账 25 万')
    expect(w.text()).not.toContain('不应出现')
  })

  it('本项目无事件 → 右栏空态', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    expect(w.find('.pd-aside').text()).toContain('暂无该项目动态')
  })
```

- [ ] **Step 2: 确认失败** — vitest 该文件 → 新增用例 FAIL
- [ ] **Step 3: 实现** — `ProjectDetailView.vue`：

script 增加（import 区加 `import EventTimeline from '@/components/EventTimeline.vue'`，type import 加 `Event`）：

```ts
// —— 右栏:本项目动态(P3;spec 4.2 布局 B 右栏,与 /activity 同构) ——
const myEvents = computed(() =>
  (((data.data as any)?.events ?? []) as Event[]).filter((e) => e.projectId === p.value?.projectId),
)
```

template：将 `v-else` 的 `<template>` 内容（pd-head 到最后一个 section）包进左右两栏布局——把现有主体包为 `<div class="pd-main">…</div>`，与右栏并排：

```vue
    <template v-else>
      <div class="pd-body">
        <div class="pd-main">
          <!-- 现有 pd-head / pd-meta / pd-metrics / pd-tabs / 各 section 原样移入 -->
        </div>
        <aside class="pd-aside">
          <div class="pd-aside-title">项目动态</div>
          <EventTimeline :events="myEvents" empty-text="暂无该项目动态" />
        </aside>
      </div>
    </template>
```

style 追加：

```css
.pd-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.pd-aside { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px 14px; }
.pd-aside-title { font-weight: 700; font-size: 13px; color: var(--txt); margin-bottom: 8px; }
@media (max-width: 1200px) { .pd-body { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: 通过** — `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts` PASS（9 cases）
- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(p3): 详情页右栏项目动态时间线(布局B完整态,≤1200px 落底,补 P2 推迟项)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 版本 V7.2.0 + PROGRESS + 全量验证（主循环亲做）

- [ ] `frontend/src/version.ts` → `APP_VERSION = 'V7.2.0'`（日期同步当天）。
- [ ] `PROGRESS.md`：头部版本/日期；进行中 → P3 完成、下一步 P4（`/` 项目总览上线，旧首页迁 `/payment`）；新 Handoff 段（节点稳定键决策、真实数据冒烟结果、烟雾清单：跑两遍更新数据→ /activity 出现事件与 lastSync 对比、详情页右栏、首次空态）；backlog 补遗留项。
- [ ] `bash verify.sh` 全绿。
- [ ] Commit：`chore(p3): 版本 V7.2.0 + PROGRESS 记录 P3 完成`
