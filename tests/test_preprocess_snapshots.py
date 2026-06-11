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
