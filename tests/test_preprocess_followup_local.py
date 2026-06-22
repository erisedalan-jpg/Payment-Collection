import preprocess_data as pre


def test_followup_from_local_groups_and_caps():
    records = [
        {"项目编号": "P1", "跟进时间": "2026-01-01", "内容": "a"},
        {"项目编号": "P1", "跟进时间": "2026-03-01", "内容": "b"},
        {"项目编号": "P2", "跟进时间": "2026-02-01", "内容": "c"},
    ]
    out = pre._followup_records_from_local(records)
    assert set(out.keys()) == {"P1", "P2"}
    # 每项目按跟进时间降序
    assert [r["内容"] for r in out["P1"]] == ["b", "a"]


def test_followup_from_local_top5():
    records = [{"项目编号": "P1", "跟进时间": f"2026-01-{i:02d}", "i": i} for i in range(1, 9)]
    out = pre._followup_records_from_local(records)
    assert len(out["P1"]) == 5
    assert [r["i"] for r in out["P1"]] == [8, 7, 6, 5, 4]  # 最近5条


def test_followup_from_local_empty():
    assert pre._followup_records_from_local([]) == {}
