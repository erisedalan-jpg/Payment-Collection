import pytest
import opportunity_followup as of


def test_new_store_seeds_default_scope():
    s = of.new_store()
    assert s["version"] == 1 and s["current"] == {} and s["archives"] == []
    conds = s["scope"]["groups"][0]["conditions"]
    assert [(c["field"], c["op"]) for c in conds] == [
        ("top1000", "in"), ("earlyIntervene", "in"), ("keyOpp", "in"), ("status", "notIn")]
    assert conds[0]["values"] == ["TOP1000"] and conds[3]["values"] == ["赢单"]


def test_normalize_scope_single_table_no_group_and_defaults():
    raw = {"combinator": "XOR", "groups": [
        {"combinator": "OR", "conditions": [
            {"group": "ignored", "field": "top1000", "op": "in", "values": ["TOP1000"]},
            {"field": 123, "op": "in"},          # field 非字符串 → 丢
        ]},
    ]}
    out = of.normalize_scope(raw)
    assert out["combinator"] == "AND"
    conds = out["groups"][0]["conditions"]
    assert len(conds) == 1 and conds[0]["field"] == "top1000"
    assert "group" not in conds[0]                # 单表:不保留 group 键


def test_normalize_scope_garbage_returns_default():
    assert of.normalize_scope(None) == {"combinator": "AND", "groups": []}
    assert of.normalize_scope({"groups": "nope"}) == {"combinator": "AND", "groups": []}


def test_apply_update_stamps_and_invalid_field_raises():
    s = of.new_store()
    rec = of.apply_update(s, "opp-1", "weekProgress", "本周X", "wangxutong", "2026-06-25 10:00:00")
    assert rec["weekProgress"] == "本周X"
    assert rec["weekProgressEditTime"] == "2026-06-25 10:00:00"
    assert rec["weekProgressEditBy"] == "wangxutong"
    assert s["current"]["opp-1"]["weekProgress"] == "本周X"
    with pytest.raises(ValueError):
        of.apply_update(s, "opp-1", "badField", "x", "u", "t")


def test_apply_archive_appends_and_clears():
    s = of.new_store()
    of.apply_update(s, "opp-1", "weekProgress", "A", "u1", "t1")
    rows = [{"id": "opp-1", "weekProgress": "A"}]
    of.apply_archive(s, rows, "2026-06-25 18:00:00")
    assert len(s["archives"]) == 1 and s["archives"][0]["archiveTime"] == "2026-06-25 18:00:00"
    assert s["archives"][0]["rows"] == rows and s["current"] == {}
