import pytest
import temp_followup as tf


def test_new_store_shape():
    s = tf.new_store()
    assert s == {"version": 1, "scope": {"combinator": "AND", "groups": []},
                 "current": {}, "archives": []}


def test_normalize_scope_drops_illegal_and_defaults_combinator():
    raw = {"combinator": "XOR", "groups": [
        {"combinator": "OR", "conditions": [
            {"group": "project", "field": "orgL4", "op": "in", "values": ["小金融服务组"]},
            {"group": "evil", "field": "x", "op": "in"},          # 非白名单组 → 丢
            {"group": "milestone", "field": 123, "op": "in"},     # field 非字符串 → 丢
        ]},
    ]}
    out = tf.normalize_scope(raw)
    assert out["combinator"] == "AND"                              # 非法回退
    assert out["groups"][0]["combinator"] == "OR"
    conds = out["groups"][0]["conditions"]
    assert len(conds) == 1 and conds[0]["field"] == "orgL4"


def test_normalize_scope_garbage_returns_default():
    assert tf.normalize_scope(None) == {"combinator": "AND", "groups": []}
    assert tf.normalize_scope({"groups": "nope"}) == {"combinator": "AND", "groups": []}


def test_apply_update_stamps_and_invalid_field_raises():
    s = tf.new_store()
    rec = tf.apply_update(s, "P1", "weekProgress", "本周X", "wangxutong", "2026-06-25 10:00:00")
    assert rec["weekProgress"] == "本周X"
    assert rec["weekProgressEditTime"] == "2026-06-25 10:00:00"
    assert rec["weekProgressEditBy"] == "wangxutong"
    assert s["current"]["P1"]["weekProgress"] == "本周X"
    with pytest.raises(ValueError):
        tf.apply_update(s, "P1", "badField", "x", "u", "t")


def test_apply_archive_appends_and_clears():
    s = tf.new_store()
    tf.apply_update(s, "P1", "weekProgress", "A", "u1", "t1")
    rows = [{"projectId": "P1", "weekProgress": "A"}]
    tf.apply_archive(s, rows, "2026-06-25 18:00:00")
    assert len(s["archives"]) == 1 and s["archives"][0]["archiveTime"] == "2026-06-25 18:00:00"
    assert s["archives"][0]["rows"] == rows and s["current"] == {}
