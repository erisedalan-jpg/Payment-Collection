import server


def test_load_temp_missing_returns_default(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(tmp_path / "none.json"))
    s = server._load_temp_followup()
    assert s["scope"] == {"combinator": "AND", "groups": []}
    assert s["current"] == {} and s["archives"] == []


def test_load_temp_corrupt_returns_default(tmp_path, monkeypatch):
    f = tmp_path / "temp_followup.json"
    f.write_text("{bad", encoding="utf-8")
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(f))
    assert server._load_temp_followup()["scope"]["groups"] == []


def test_save_load_roundtrip(tmp_path, monkeypatch):
    f = tmp_path / "temp_followup.json"
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(f))
    store = server._load_temp_followup()
    server.temp_followup.apply_update(store, "P1", "weekProgress", "x", "admin", "t")
    server._save_temp_followup(store)
    assert server._load_temp_followup()["current"]["P1"]["weekProgress"] == "x"


def test_temp_super_only_paths():
    assert '/api/temp-followup/scope' in server._SUPER_ONLY_PATHS
    assert '/api/temp-followup/archive' in server._SUPER_ONLY_PATHS
    assert '/api/temp-followup' not in server._SUPER_ONLY_PATHS        # GET 任意登录
    assert '/api/temp-followup/update' not in server._SUPER_ONLY_PATHS  # 进展编辑任意登录
