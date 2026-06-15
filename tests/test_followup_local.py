import server


def test_add_followup_local_only(tmp_path, monkeypatch):
    f = tmp_path / "followup_records.json"
    monkeypatch.setattr(server, "FOLLOWUP_FILE", str(f))
    monkeypatch.setattr(server, "_get_node_action_date", lambda pid: "")
    recs = server._load_followup_records()
    assert recs == []
    num = server._get_next_record_num("20260615")
    rec = {"记录编号": f"FU-20260615-{num:04d}", "项目编号": "P1", "项目名称": "甲",
           "跟进人": "张三", "跟进类型": "邮件推动", "跟进内容": "x", "跟进状态": "跟进中"}
    server._save_followup_records([rec])
    loaded = server._load_followup_records()
    assert loaded[0]["记录编号"] == "FU-20260615-0001"
    assert "syncStatus" not in loaded[0]


def test_cloud_writeback_symbols_removed():
    assert not hasattr(server, "_write_followup_async")
    assert not hasattr(server, "_update_followup_sync_status")
    assert not hasattr(server, "followup_sync_state")
