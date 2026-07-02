import pytest
import payment_key_followup as pf


def _store():
    return pf.new_store()


def test_new_store_shape():
    s = pf.new_store()
    assert s == {"version": 1, "scope": {"combinator": "AND", "groups": []},
                 "current": {}, "archives": []}


def test_apply_update_writes_field_and_stamps():
    s = _store()
    rec = pf.apply_update(s, "P1", "followAction", "已邮件推动", "admin", "2026-07-02 10:00")
    assert rec["followAction"] == "已邮件推动"
    assert rec["followActionEditTime"] == "2026-07-02 10:00"
    assert rec["followActionEditBy"] == "admin"
    r2 = pf.apply_update(s, "P1", "nextRevDate", "2026-07-20", "admin", "2026-07-02 10:05")
    assert r2["nextRevDate"] == "2026-07-20"
    assert s["current"]["P1"]["followAction"] == "已邮件推动"  # 同 key 累积不互相覆盖


def test_apply_update_rejects_unknown_field():
    s = _store()
    with pytest.raises(ValueError):
        pf.apply_update(s, "P1", "weekProgress", "x", "admin", "t")


def test_apply_archive_appends_and_keeps_current():
    """关键差异(同 risk):归档只追加快照,不清空 current(跟进数据留存)。"""
    s = _store()
    pf.apply_update(s, "P1", "followAction", "推动中", "admin", "2026-07-02 10:00")
    rows = [{"projectId": "P1", "followAction": "推动中"}]
    pf.apply_archive(s, rows, "2026-07-02 18:00")
    assert len(s["archives"]) == 1
    assert s["archives"][0]["archiveTime"] == "2026-07-02 18:00"
    assert s["archives"][0]["rows"] == rows
    assert s["current"] != {}  # 未被清空
    assert s["current"]["P1"]["followAction"] == "推动中"


def test_normalize_scope_drops_illegal_group_and_defaults_combinator():
    raw = {"combinator": "XOR", "groups": [
        {"combinator": "OR", "conditions": [
            {"group": "project", "field": "orgL4", "op": "in", "values": ["小金融服务组"]},
            {"group": "evil", "field": "x", "op": "in"},          # 非白名单组 → 丢
            {"group": "milestone", "field": 123, "op": "in"},     # field 非字符串 → 丢
        ]},
    ]}
    out = pf.normalize_scope(raw)
    assert out["combinator"] == "AND"                              # 非法回退
    assert out["groups"][0]["combinator"] == "OR"
    conds = out["groups"][0]["conditions"]
    assert len(conds) == 1 and conds[0]["field"] == "orgL4"


def test_normalize_scope_accepts_all_scope_groups():
    raw = {"combinator": "AND", "groups": [
        {"combinator": "AND", "conditions": [
            {"group": "project", "field": "orgL4", "op": "in", "values": ["A"]},
            {"group": "paymentNode", "field": "stage", "op": "in", "values": ["B"]},
            {"group": "milestone", "field": "status", "op": "in", "values": ["C"]},
        ]},
    ]}
    out = pf.normalize_scope(raw)
    conds = out["groups"][0]["conditions"]
    assert [c["group"] for c in conds] == ["project", "paymentNode", "milestone"]


def test_normalize_scope_garbage_returns_default():
    assert pf.normalize_scope(None) == {"combinator": "AND", "groups": []}
    assert pf.normalize_scope("not a dict") == {"combinator": "AND", "groups": []}
    assert pf.normalize_scope({"groups": "nope"}) == {"combinator": "AND", "groups": []}


def test_apply_archive_delete_removes_index():
    s = {"version": 1, "current": {}, "archives": [
        {"archiveTime": "2026-06-01 10:00", "rows": [{"a": 1}]},
        {"archiveTime": "2026-06-02 10:00", "rows": [{"a": 2}]},
        {"archiveTime": "2026-06-03 10:00", "rows": [{"a": 3}]},
    ]}
    assert pf.apply_archive_delete(s, 1) is True
    assert [a["archiveTime"] for a in s["archives"]] == ["2026-06-01 10:00", "2026-06-03 10:00"]


def test_apply_archive_delete_rejects_out_of_range_and_non_int():
    s = {"version": 1, "current": {}, "archives": [
        {"archiveTime": "2026-06-01 10:00", "rows": [{"a": 1}]},
        {"archiveTime": "2026-06-02 10:00", "rows": [{"a": 2}]},
    ]}
    assert pf.apply_archive_delete(s, 5) is False
    assert pf.apply_archive_delete(s, -1) is False
    assert pf.apply_archive_delete(s, "x") is False
    assert len(s["archives"]) == 2  # 未被改动
