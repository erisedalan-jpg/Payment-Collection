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
