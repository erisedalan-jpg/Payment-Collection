import followup_store as fs


def _grouped():
    return fs.FollowupConfig(progress_fields=('weekProgress', 'nextPlan'),
                             scope_groups=('project', 'paymentNode', 'milestone'), clear_on_archive=True)


def _single_retain():
    return fs.FollowupConfig(progress_fields=('followAction', 'revConclusion', 'nextRevDate'),
                             scope_groups=None, clear_on_archive=False)


def test_new_store_default_scope_empty():
    assert fs.new_store(_grouped())["scope"] == {"combinator": "AND", "groups": []}


def test_new_store_custom_default_scope_deepcopied():
    ds = {"combinator": "AND", "groups": [{"combinator": "AND", "conditions": []}]}
    cfg = fs.FollowupConfig(progress_fields=('x',), default_scope=ds)
    s = fs.new_store(cfg)
    s["scope"]["groups"].append("mutate")
    assert ds["groups"] == [{"combinator": "AND", "conditions": []}]   # 深拷贝,原对象不被改


def test_normalize_grouped_drops_condition_without_valid_group():
    cfg = _grouped()
    scope = {"combinator": "AND", "groups": [{"combinator": "AND", "conditions": [
        {"group": "project", "field": "customer", "op": "in", "values": [1, 2]},
        {"group": "BAD", "field": "x", "op": "in"},        # 无效 group → 丢
        {"field": "noGroup", "op": "in"},                  # 缺 group → 丢
    ]}]}
    out = fs.normalize_scope(cfg, scope)
    conds = out["groups"][0]["conditions"]
    assert len(conds) == 1 and conds[0]["group"] == "project" and conds[0]["values"] == ["1", "2"]


def test_normalize_single_table_keeps_condition_without_group():
    cfg = _single_retain()
    scope = {"combinator": "OR", "groups": [{"combinator": "AND", "conditions": [
        {"field": "riskLevel", "op": "in", "values": ["高"]},
    ]}]}
    out = fs.normalize_scope(cfg, scope)
    c = out["groups"][0]["conditions"][0]
    assert "group" not in c and c["field"] == "riskLevel" and out["combinator"] == "OR"


def test_apply_update_stamps_and_rejects_bad_field():
    cfg = _grouped()
    store = fs.new_store(cfg)
    rec = fs.apply_update(cfg, store, "P1", "weekProgress", "内容", "admin", "2026-07-03")
    assert rec["weekProgress"] == "内容" and rec["weekProgressEditBy"] == "admin" and rec["weekProgressEditTime"] == "2026-07-03"
    import pytest
    with pytest.raises(ValueError):
        fs.apply_update(cfg, store, "P1", "badField", "x", "admin", "t")


def test_apply_archive_clear_vs_retain():
    grouped = _grouped()          # clear
    s1 = fs.new_store(grouped); s1["current"] = {"P1": {"weekProgress": "a"}}
    fs.apply_archive(grouped, s1, [{"row": 1}], "t")
    assert s1["current"] == {} and len(s1["archives"]) == 1

    retain = _single_retain()     # retain
    s2 = fs.new_store(retain); s2["current"] = {"K1": {"followAction": "b"}}
    fs.apply_archive(retain, s2, [{"row": 1}], "t")
    assert s2["current"] == {"K1": {"followAction": "b"}} and len(s2["archives"]) == 1


def test_apply_archive_delete_bounds():
    cfg = _grouped()
    store = fs.new_store(cfg); store["archives"] = [{"a": 1}, {"a": 2}]
    assert fs.apply_archive_delete(store, 5) is False and len(store["archives"]) == 2
    assert fs.apply_archive_delete(store, 0) is True and store["archives"] == [{"a": 2}]


def test_apply_update_accepts_extra_fields():
    cfg = _single_retain()
    store = fs.new_store(cfg)
    rec = fs.apply_update(cfg, store, "K1", "cf-aaaa1111", "值", "admin", "t", extra_fields={"cf-aaaa1111"})
    assert rec["cf-aaaa1111"] == "值" and rec["cf-aaaa1111EditBy"] == "admin"
    import pytest
    with pytest.raises(ValueError):
        fs.apply_update(cfg, store, "K1", "cf-notallowed", "x", "admin", "t", extra_fields={"cf-aaaa1111"})


def test_apply_archive_clear_fields_selective_on_retain_table():
    cfg = _single_retain()      # 表级留存
    s = fs.new_store(cfg)
    s["current"] = {"K1": {"followAction": "keep", "cf-x": "wipe", "cf-xEditTime": "t", "cf-xEditBy": "a"}}
    fs.apply_archive(cfg, s, [{"row": 1}], "t", clear_fields={"cf-x"})
    assert s["current"] == {"K1": {"followAction": "keep"}}       # 只清 cf-x + 其 EditTime/EditBy
    assert len(s["archives"]) == 1


def test_apply_archive_clear_fields_drops_emptied_records():
    cfg = _grouped()            # 表级清空
    s = fs.new_store(cfg)
    s["current"] = {"P1": {"weekProgress": "a", "cf-keep": "survive"}, "P2": {"weekProgress": "b"}}
    # 表级清空内置 weekProgress/nextPlan;cf-keep 不在 clear_fields → 留存 → P1 保留、P2 清空后为空被丢弃
    fs.apply_archive(cfg, s, [{"row": 1}], "t", clear_fields={"weekProgress", "nextPlan"})
    assert s["current"] == {"P1": {"cf-keep": "survive"}}


def test_apply_archive_none_retains_legacy_behavior():
    grouped = _grouped()
    s1 = fs.new_store(grouped); s1["current"] = {"P1": {"weekProgress": "a"}}
    fs.apply_archive(grouped, s1, [{"row": 1}], "t")              # clear_fields 缺省
    assert s1["current"] == {}                                   # 与旧行为逐字一致
    retain = _single_retain()
    s2 = fs.new_store(retain); s2["current"] = {"K1": {"followAction": "b"}}
    fs.apply_archive(retain, s2, [{"row": 1}], "t")
    assert s2["current"] == {"K1": {"followAction": "b"}}
