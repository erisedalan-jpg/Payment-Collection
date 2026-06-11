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
