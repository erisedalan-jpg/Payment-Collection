import json
import pytest
import server


def test_load_progress_missing_returns_default(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "PROGRESS_FILE", str(tmp_path / "none.json"))
    assert server._load_progress() == {"version": 1, "current": {}, "archives": []}


def test_load_progress_corrupt_returns_default(tmp_path, monkeypatch):
    f = tmp_path / "project_progress.json"
    f.write_text("{bad json", encoding="utf-8")
    monkeypatch.setattr(server, "PROGRESS_FILE", str(f))
    assert server._load_progress() == {"version": 1, "current": {}, "archives": []}


def test_save_load_roundtrip(tmp_path, monkeypatch):
    f = tmp_path / "project_progress.json"
    monkeypatch.setattr(server, "PROGRESS_FILE", str(f))
    store = {"version": 1, "current": {"P1": {"weekProgress": "x"}}, "archives": []}
    server._save_progress(store)
    assert server._load_progress()["current"]["P1"]["weekProgress"] == "x"


def test_apply_update_stamps_time_and_account():
    store = {"version": 1, "current": {}, "archives": []}
    rec = server._progress_apply_update(store, "P1", "weekProgress", "本周完成X", "wangxutong", "2026-06-24 10:30:00")
    assert rec["weekProgress"] == "本周完成X"
    assert rec["weekProgressEditTime"] == "2026-06-24 10:30:00"
    assert rec["weekProgressEditBy"] == "wangxutong"
    assert store["current"]["P1"]["weekProgress"] == "本周完成X"


def test_apply_update_second_field_keeps_first():
    store = {"version": 1, "current": {}, "archives": []}
    server._progress_apply_update(store, "P1", "weekProgress", "A", "u1", "2026-06-24 10:00:00")
    server._progress_apply_update(store, "P1", "nextPlan", "B", "u2", "2026-06-24 11:00:00")
    r = store["current"]["P1"]
    assert r["weekProgress"] == "A" and r["nextPlan"] == "B"
    assert r["weekProgressEditBy"] == "u1" and r["nextPlanEditBy"] == "u2"


def test_apply_update_invalid_field_raises():
    with pytest.raises(ValueError):
        server._progress_apply_update({"version": 1, "current": {}, "archives": []},
                                      "P1", "badField", "x", "u", "t")


def test_apply_archive_appends_and_clears_current():
    store = {"version": 1, "current": {"P1": {"weekProgress": "A"}}, "archives": []}
    rows = [{"projectId": "P1", "weekProgress": "A", "followBy": "u1"}]
    server._progress_apply_archive(store, rows, "2026-06-24 18:00:00")
    assert len(store["archives"]) == 1
    assert store["archives"][0]["archiveTime"] == "2026-06-24 18:00:00"
    assert store["archives"][0]["rows"] == rows
    assert store["current"] == {}   # 归档后清空


def test_archive_endpoint_is_super_only():
    assert '/api/progress/archive' in server._SUPER_ONLY_PATHS
    # update/read 不在超管专属(任意登录可用)
    assert '/api/progress/update' not in server._SUPER_ONLY_PATHS
    assert '/api/progress' not in server._SUPER_ONLY_PATHS
