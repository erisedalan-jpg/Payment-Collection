import os
import json
import server


def test_atomic_write_roundtrip_no_tmp_left(tmp_path):
    p = str(tmp_path / "x.json")
    server._atomic_write_json(p, {"a": 1, "中文": "值"})
    assert json.load(open(p, encoding="utf-8")) == {"a": 1, "中文": "值"}
    assert not os.path.exists(p + ".tmp")   # 临时文件已 replace,无残留


def test_direct_store_save_uses_atomic(tmp_path, monkeypatch):
    f = str(tmp_path / "followup_records.json")
    monkeypatch.setattr(server, "FOLLOWUP_FILE", f)
    server._save_followup_records([{"id": 1}])
    assert json.load(open(f, encoding="utf-8")) == [{"id": 1}]
    assert not os.path.exists(f + ".tmp")
