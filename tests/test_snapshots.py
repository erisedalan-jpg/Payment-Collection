import json
import pmis
import snapshots as S
import snapshots


def _projects():
    return [{"projectId": "P-1", "projectName": "甲"}, {"projectId": "P-2", "projectName": "乙"}]


def _pmis():
    return {
        "P-1": {
            "progress": {"项目阶段": "项目执行", "里程碑进度状态": "正常"},
            "status": {"项目状态": "实施中", "是否暂停": False, "评级": "C"},
            "risk": {"未关闭风险数": 2},
            "cost": {"项目超支": False, "交付超支": False, "消耗比": 0.3},
        },
    }


def _nodes():
    # paymentNodes 格式: {pid: [{stage, planDate, receivedAmount, expectedPayment, unpaidAmount, status}]}
    return {
        "P-1": [
            {"stage": "初验款", "planDate": "2026-03-31", "receivedAmount": 100000,
             "expectedPayment": 500000, "unpaidAmount": 400000, "status": "正常实施中"},
            {"stage": "阶段验收款", "planDate": "2026-01-31", "receivedAmount": 0,
             "expectedPayment": 200000, "unpaidAmount": 200000, "status": "延期"},
            {"stage": "阶段验收款", "planDate": "2026-09-30", "receivedAmount": 0,
             "expectedPayment": 300000, "unpaidAmount": 300000, "status": "正常实施中"},
        ]
    }


class TestOverspendContract:
    def test_overspend_reads_derive_cost_key(self):
        # derive_cost 真实产物直喂 build_snapshot：剩余预算<0 → 项目超支 True → snapshot.overspend True
        cost = pmis.derive_cost({"项目总预算（元）": "1000000", "项目核算（元）": "1200000",
                                 "剩余预算（元）": "-200000"}, {})
        assert cost["项目超支"] is True and "超支" not in cost  # 契约:旧键不存在
        pmis_map = {"P-1": {"cost": cost}}
        snap = snapshots.build_snapshot("2026-06-11",
                                        [{"projectId": "P-1", "projectName": "甲"}], pmis_map, {})
        assert snap["projects"]["P-1"]["overspend"] is True


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
        assert "P-1|阶段验收款#0" in keys and "P-1|阶段验收款#1" in keys  # 同 stage 按行序编号
        assert len(snap["nodes"]) == 3  # paymentNodes 字典包含 3 个节点
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
          paused=False, rating="C", openRisks=0, overspend=False, costRatio=0.3,
          overspendAmount=None, deliveryOver=False, deliveryOverCats=None):
    return {"name": name, "stage": stage, "milestone": milestone, "status": status,
            "paused": paused, "rating": rating, "openRisks": openRisks,
            "overspend": overspend, "costRatio": costRatio,
            "overspendAmount": overspendAmount, "deliveryOver": deliveryOver,
            "deliveryOverCats": deliveryOverCats if deliveryOverCats is not None else []}


def _node(pid="P-1", pname="甲", node="初验款", status="正常实施中",
          planDate="2026-03-31", actual=0.0, expected=500000.0):
    return {"pid": pid, "pname": pname, "node": node, "status": status,
            "planDate": planDate, "actual": actual, "expected": expected}


class TestDiffProjects:
    def test_new_and_closed_project(self):
        prev = _snap("2026-06-10", {"P-1": _proj()})
        cur = _snap("2026-06-11", {"P-2": _proj(name="乙")})
        evs = snapshots.diff_snapshots(prev, cur)
        types = {(e["type"], e["projectId"]) for e in evs}
        assert ("新增项目", "P-2") in types and ("关闭项目", "P-1") in types

    def test_stage_milestone_status_changes(self):
        prev = _snap("2026-06-10", {"P-1": _proj()})
        cur = _snap("2026-06-11", {"P-1": _proj(stage="项目收尾", milestone="待验收", status="待验收", rating="B")})
        evs = snapshots.diff_snapshots(prev, cur)
        by = {e["type"]: e for e in evs}
        assert by["阶段变更"]["prev"] == "项目执行" and by["阶段变更"]["curr"] == "项目收尾"
        assert by["里程碑状态变更"]["curr"] == "待验收"
        assert by["项目状态变更"]["curr"] == "待验收"
        assert "评级变化" not in by  # S1:评级变化不展示
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


class TestS1EventRules:
    def test_rating_change_no_event(self):
        evs = snapshots.diff_snapshots(_snap("2026-06-11", {"P1": _proj(rating="C")}),
                                       _snap("2026-06-12", {"P1": _proj(rating="A")}))
        assert evs == []

    def test_new_and_closed_project_renamed_green(self):
        evs = snapshots.diff_snapshots(_snap("2026-06-11", {"P1": _proj()}),
                                       _snap("2026-06-12", {"P2": _proj(name="乙")}))
        types = {e["type"]: e for e in evs}
        assert types["新增项目"]["tone"] == "ok" and "进入项目主域" in types["新增项目"]["summary"]
        assert types["关闭项目"]["tone"] == "ok" and "移出项目主域" in types["关闭项目"]["summary"]

    def test_milestone_bad_red_normal_plain(self):
        evs = snapshots.diff_snapshots(_snap("2026-06-11", {"P1": _proj(milestone="正常")}),
                                       _snap("2026-06-12", {"P1": _proj(milestone="严重延期")}))
        assert evs[0]["type"] == "里程碑状态变更" and evs[0]["tone"] == "danger"
        evs2 = snapshots.diff_snapshots(_snap("2026-06-11", {"P1": _proj(milestone="延期")}),
                                        _snap("2026-06-12", {"P1": _proj(milestone="正常")}))
        assert evs2[0]["tone"] == ""

    def test_risk_up_red_down_green(self):
        up = snapshots.diff_snapshots(_snap("2026-06-11", {"P1": _proj(openRisks=1)}),
                                      _snap("2026-06-12", {"P1": _proj(openRisks=3)}))
        assert up[0]["type"] == "风险数增减" and up[0]["tone"] == "danger"
        down = snapshots.diff_snapshots(_snap("2026-06-11", {"P1": _proj(openRisks=3)}),
                                        _snap("2026-06-12", {"P1": _proj(openRisks=1)}))
        assert down[0]["tone"] == "ok"

    def test_overspend_amount_threshold(self):
        big = snapshots.diff_snapshots(
            _snap("2026-06-11", {"P1": _proj()}),
            _snap("2026-06-12", {"P1": _proj(overspend=True, overspendAmount=6000.0)}))
        assert big[0]["type"] == "超支出现" and big[0]["tone"] == "danger"
        assert "0.6 万" in big[0]["summary"] and big[0]["amount"] == 6000.0
        small = snapshots.diff_snapshots(
            _snap("2026-06-11", {"P1": _proj()}),
            _snap("2026-06-12", {"P1": _proj(overspend=True, overspendAmount=4000.0)}))
        assert small[0]["tone"] == "warn"
        gone = snapshots.diff_snapshots(
            _snap("2026-06-11", {"P1": _proj(overspend=True)}),
            _snap("2026-06-12", {"P1": _proj(overspend=False)}))
        assert gone[0]["type"] == "超支解除" and gone[0]["tone"] == "ok"
        # PMIS 分项标超但整体金额为负(实测 38/45):warn 且摘要不带负数金额
        neg = snapshots.diff_snapshots(
            _snap("2026-06-11", {"P1": _proj()}),
            _snap("2026-06-12", {"P1": _proj(overspend=True, overspendAmount=-500.0)}))
        assert neg[0]["tone"] == "warn" and "万" not in neg[0]["summary"]

    def test_delivery_overspend_event_and_upgrade_guard(self):
        evs = snapshots.diff_snapshots(
            _snap("2026-06-11", {"P1": _proj(deliveryOver=False)}),
            _snap("2026-06-12", {"P1": _proj(deliveryOver=True, deliveryOverCats=["交付外包服务成本"])}))
        assert evs[0]["type"] == "交付费用超支" and evs[0]["tone"] == "danger"
        assert "交付外包服务成本" in evs[0]["summary"]
        # 旧快照无该字段(升级首跑) → 不触发
        old = _proj()
        old.pop("deliveryOver")
        old.pop("deliveryOverCats")
        evs2 = snapshots.diff_snapshots(_snap("2026-06-11", {"P1": old}),
                                        _snap("2026-06-12", {"P1": _proj(deliveryOver=True, deliveryOverCats=["差旅费"])}))
        assert all(e["type"] != "交付费用超支" for e in evs2)

    def test_delay_event_red(self):
        a = {"date": "2026-06-11", "projects": {}, "agg": {},
             "nodes": {"P1|款#0": {"pid": "P1", "pname": "甲", "node": "款", "status": "正常实施中",
                                    "planDate": "", "actual": 0, "expected": 100}}}
        b = json.loads(json.dumps(a))
        b["date"] = "2026-06-12"
        b["nodes"]["P1|款#0"]["status"] = "延期"
        evs = snapshots.diff_snapshots(a, b)
        assert evs[0]["type"] == "延期发生" and evs[0]["tone"] == "danger"

    def test_build_snapshot_new_fields(self):
        projects = [{"projectId": "P1", "projectName": "甲",
                     "deliveryCosts": [{"类别": "差旅费", "预算金额": 10.0, "实际发生": 20.0}]}]
        profit = {"P1": {"summary": {"实际成本": 9000.0, "预算成本": 1000.0}, "rows": [], "bridge": None}}
        snap = snapshots.build_snapshot("2026-06-12", projects, {}, {}, profit)
        e = snap["projects"]["P1"]
        assert e["overspendAmount"] == 8000.0
        assert e["deliveryOver"] is True and e["deliveryOverCats"] == ["差旅费"]


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

    def test_node_removal_suppressed_when_project_closed(self):
        # 项目 P-1 关闭(从 cur 消失),其节点随之消失 → 只记"关闭项目",不重复记"回款节点移除"
        prev = _snap("2026-06-10", {"P-1": _proj()}, {"P-1|款#0": _node(node="款")})
        cur = _snap("2026-06-11", {}, {})
        types = {e["type"] for e in snapshots.diff_snapshots(prev, cur)}
        assert "关闭项目" in types
        assert "回款节点移除" not in types

    def test_node_removal_still_fires_when_project_alive(self):
        # 项目仍在、仅某节点消失 → 仍如实记"回款节点移除"(回归保护)
        prev = _snap("2026-06-10", {"P-1": _proj()}, {"P-1|旧#0": _node(node="旧")})
        cur = _snap("2026-06-11", {"P-1": _proj()}, {})
        types = {e["type"] for e in snapshots.diff_snapshots(prev, cur)}
        assert "回款节点移除" in types


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


class TestLoadSnapshotRobustness:
    def test_corrupted_json_returns_none(self, tmp_path):
        (tmp_path / "2026-06-11.json").write_text("{broken", encoding="utf-8")
        assert snapshots.load_snapshot(str(tmp_path), "2026-06-11") is None


def test_build_snapshot_node_key_uses_stage():
    pn = {"P1": [
        {"stage": "到货款", "planDate": "2026-02-01", "receivedAmount": 600000, "expectedPayment": 1000000, "unpaidAmount": 400000, "status": "部分回款"},
        {"stage": "验收款", "planDate": "2026-03-01", "receivedAmount": 0, "expectedPayment": 1000000, "unpaidAmount": 1000000, "status": "延期"},
    ]}
    snap = S.build_snapshot("2026-06-18", [{"projectId": "P1", "projectName": "甲"}], {}, pn)
    assert "P1|到货款#0" in snap["nodes"]
    assert snap["nodes"]["P1|到货款#0"]["actual"] == 600000
    assert snap["nodes"]["P1|验收款#0"]["status"] == "延期"
    assert snap["nodes"]["P1|验收款#0"]["expected"] == 1000000
