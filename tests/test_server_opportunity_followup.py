import server


def test_load_missing_returns_default_with_default_scope(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "OPP_FOLLOWUP_FILE", str(tmp_path / "none.json"))
    s = server._load_opportunity_followup()
    assert s["current"] == {} and s["archives"] == []
    assert len(s["scope"]["groups"]) == 1
    assert len(s["scope"]["groups"][0]["conditions"]) == 4


def test_load_corrupt_returns_default(tmp_path, monkeypatch):
    f = tmp_path / "opportunity_followup.json"
    f.write_text("{bad", encoding="utf-8")
    monkeypatch.setattr(server, "OPP_FOLLOWUP_FILE", str(f))
    assert len(server._load_opportunity_followup()["scope"]["groups"]) == 1


def test_save_load_roundtrip(tmp_path, monkeypatch):
    f = tmp_path / "opportunity_followup.json"
    monkeypatch.setattr(server, "OPP_FOLLOWUP_FILE", str(f))
    store = server._load_opportunity_followup()
    server._oppf.apply_update(store, "opp-1", "weekProgress", "x", "admin", "t")
    server._save_opportunity_followup(store)
    assert server._load_opportunity_followup()["current"]["opp-1"]["weekProgress"] == "x"


def test_super_only_paths():
    assert '/api/opportunity-followup/scope' in server._SUPER_ONLY_PATHS
    assert '/api/opportunity-followup/archive' in server._SUPER_ONLY_PATHS
    assert '/api/opportunity-followup' not in server._SUPER_ONLY_PATHS         # GET 任意登录
    assert '/api/opportunity-followup/update' not in server._SUPER_ONLY_PATHS  # 进展编辑任意登录
