import temp_followup, opportunity_followup, risk_followup
import server


def _store_with_3():
    return {"version": 1, "current": {}, "archives": [
        {"archiveTime": "2026-06-01 10:00", "rows": [{"a": 1}]},
        {"archiveTime": "2026-06-02 10:00", "rows": [{"a": 2}]},
        {"archiveTime": "2026-06-03 10:00", "rows": [{"a": 3}]},
    ]}


def test_apply_archive_delete_removes_index_each_module():
    for mod in (temp_followup, opportunity_followup, risk_followup):
        s = _store_with_3()
        assert mod.apply_archive_delete(s, 1) is True
        assert [a["archiveTime"] for a in s["archives"]] == ["2026-06-01 10:00", "2026-06-03 10:00"]


def test_apply_archive_delete_rejects_out_of_range():
    for mod in (temp_followup, opportunity_followup, risk_followup):
        s = _store_with_3()
        assert mod.apply_archive_delete(s, 5) is False
        assert mod.apply_archive_delete(s, -1) is False
        assert mod.apply_archive_delete(s, "x") is False
        assert len(s["archives"]) == 3  # 未被改动


def test_progress_apply_archive_delete():
    s = _store_with_3()
    assert server._progress_apply_archive_delete(s, 0) is True
    assert [a["archiveTime"] for a in s["archives"]] == ["2026-06-02 10:00", "2026-06-03 10:00"]
    assert server._progress_apply_archive_delete(s, 9) is False and len(s["archives"]) == 2
