"""9d 集成段的可测核心: run_snapshot_pipeline(独立函数,目录可注入)。"""
import json
import os
import snapshots
from preprocess_data import run_snapshot_pipeline


def _final_data(actual=0.0):
    return {
        "projects": [{"projectId": "P-1", "projectName": "甲"}],
        "projectPmis": {"P-1": {"progress": {"项目阶段": "项目执行"}, "status": {}, "risk": {}, "cost": {}}},
        "paymentNodes": {"P-1": [{"stage": "初验款", "planDate": "2026-03-31",
                                   "receivedAmount": actual, "expectedPayment": 500000,
                                   "unpaidAmount": 500000 - actual, "status": "正常实施中"}]},
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

    def test_all_events_embedded_not_capped_at_100(self, tmp_path):
        """内嵌事件数量等于 events.json 保留数量，不再截断到 100 条。"""
        import snapshots as snapshots_mod
        d = str(tmp_path)
        events_path = os.path.join(d, "events.json")
        # 直接写入 105 条伪事件到 events.json，模拟已有历史
        fake = [{"date": f"2026-01-{i:02d}", "type": "到账", "domain": "payment",
                  "projectId": "P-1", "projectName": "甲", "summary": f"到账 {i}", "amount": i * 1000}
                for i in range(1, 106)]
        os.makedirs(d, exist_ok=True)
        with open(events_path, "w", encoding="utf-8") as f:
            json.dump(fake, f, ensure_ascii=False)
        # 首次建快照（无 diff）
        run_snapshot_pipeline(_final_data(actual=0.0), d, today="2026-06-10")
        # 第二次触发 diff，产生新事件；内嵌数应 == events.json 条数（≤500），不被截断到 100
        events, _ = run_snapshot_pipeline(_final_data(actual=50000.0), d, today="2026-06-11")
        with open(events_path, encoding="utf-8") as f:
            on_disk = json.load(f)
        assert len(events) == len(on_disk), (
            f"内嵌条数 {len(events)} 应等于 events.json 保留条数 {len(on_disk)}，不应截断到 100"
        )
        assert len(events) > 100, f"应内嵌全部事件（>100），实际={len(events)}"
