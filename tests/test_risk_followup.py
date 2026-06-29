import risk_followup as rf


def _store():
    return rf.new_store()


def test_new_store_empty_scope_and_buckets():
    s = rf.new_store()
    assert s["scope"] == {"combinator": "AND", "groups": []}
    assert s["current"] == {} and s["archives"] == []


def test_apply_update_writes_field_and_stamps():
    s = _store()
    rec = rf.apply_update(s, "P1::FX-1", "followAction", "已邮件推动", "admin", "2026-06-29 10:00")
    assert rec["followAction"] == "已邮件推动"
    assert rec["followActionEditTime"] == "2026-06-29 10:00" and rec["followActionEditBy"] == "admin"
    r2 = rf.apply_update(s, "P1::FX-1", "nextRevDate", "2026-07-15", "admin", "2026-06-29 10:05")
    assert r2["nextRevDate"] == "2026-07-15"
    assert s["current"]["P1::FX-1"]["followAction"] == "已邮件推动"  # 同 key 累积不互相覆盖


def test_apply_update_rejects_unknown_field():
    s = _store()
    try:
        rf.apply_update(s, "P1::FX-1", "weekProgress", "x", "admin", "t")
        assert False, "应拒绝非法 field"
    except ValueError:
        pass


def test_apply_archive_keeps_current():
    """关键差异:归档只追加快照,不清空 current(跟进数据留存)。"""
    s = _store()
    rf.apply_update(s, "P1::FX-1", "followAction", "推动中", "admin", "2026-06-29 10:00")
    rf.apply_archive(s, [{"riskKey": "P1::FX-1", "followAction": "推动中"}], "2026-06-29 18:00")
    assert len(s["archives"]) == 1 and s["archives"][0]["archiveTime"] == "2026-06-29 18:00"
    assert s["current"]["P1::FX-1"]["followAction"] == "推动中"  # 未被清空


def test_normalize_scope_accepts_grouplessconditions_and_drops_invalid():
    raw = {"combinator": "OR", "groups": [
        {"combinator": "AND", "conditions": [
            {"field": "风险等级", "op": "in", "values": ["高", "中"]},   # 单表:无 group 也收
            {"field": "", "op": "in", "values": []},                     # 非法 field → 丢
            {"op": "in"},                                                # 缺 field → 丢
        ]},
    ]}
    out = rf.normalize_scope(raw)
    assert out["combinator"] == "OR"
    conds = out["groups"][0]["conditions"]
    assert len(conds) == 1 and conds[0]["field"] == "风险等级" and conds[0]["values"] == ["高", "中"]


def test_normalize_scope_garbage_to_empty():
    assert rf.normalize_scope("not a dict") == {"combinator": "AND", "groups": []}
    assert rf.normalize_scope({"groups": "x"}) == {"combinator": "AND", "groups": []}
