import json

import pytest

import budget_store as bs

NOW = "2026-07-13 10:00:00"
LATER = "2026-07-13 11:00:00"


def _rec(name="报价A", **kw):
    r = {
        "quoteName": name,
        "data": {"basic": {"quoteName": name}},
        "rateSnapshot": {"fx": 6.8},
        "summary": {"customerName": "", "totalCost": 100000, "salesAmount": 113000,
                    "costRatio": 11.3, "ratioStatus": "normal"},
    }
    r.update(kw)
    return r


def test_新建_服务端补齐id与时间戳与owner():
    store = bs.new_store()
    saved = bs.upsert_estimate(store, _rec(), "zhangsan", NOW)
    assert saved["id"]
    assert saved["account"] == "zhangsan"
    assert saved["createdAt"] == NOW and saved["updatedAt"] == NOW
    assert len(store["estimates"]) == 1


def test_新建_id由服务端生成_前端传的id若不存在则当新建():
    store = bs.new_store()
    saved = bs.upsert_estimate(store, _rec(id="不存在的id"), "zhangsan", NOW)
    assert saved["id"] != "不存在的id"
    assert len(store["estimates"]) == 1


def test_覆盖_同id更新_不新增条目_保留owner与createdAt():
    store = bs.new_store()
    first = bs.upsert_estimate(store, _rec("原名"), "zhangsan", NOW)
    upd = _rec("改名", id=first["id"])
    # 即使是超管来覆盖,owner 仍是原作者
    saved = bs.upsert_estimate(store, upd, "admin", LATER)
    assert len(store["estimates"]) == 1
    assert saved["id"] == first["id"]
    assert saved["quoteName"] == "改名"
    assert saved["account"] == "zhangsan"       # owner 不变
    assert saved["createdAt"] == NOW            # 创建时间不变
    assert saved["updatedAt"] == LATER          # 更新时间变


def test_列表_普通管理员只见自己的():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec("A"), "zhangsan", NOW)
    bs.upsert_estimate(store, _rec("B"), "lisi", NOW)
    mine = bs.list_meta(store, "zhangsan", is_super=False)
    assert [m["quoteName"] for m in mine] == ["A"]


def test_列表_超管默认也只见自己的_带all才见全部():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec("A"), "zhangsan", NOW)
    bs.upsert_estimate(store, _rec("B"), "admin", NOW)
    assert [m["quoteName"] for m in bs.list_meta(store, "admin", is_super=True)] == ["B"]
    allm = bs.list_meta(store, "admin", is_super=True, all_accounts=True)
    assert sorted(m["quoteName"] for m in allm) == ["A", "B"]


def test_列表_all_accounts对普通管理员无效_仍只见自己的():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec("A"), "zhangsan", NOW)
    bs.upsert_estimate(store, _rec("B"), "lisi", NOW)
    got = bs.list_meta(store, "zhangsan", is_super=False, all_accounts=True)
    assert [m["quoteName"] for m in got] == ["A"]


def test_列表_按updatedAt倒序():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec("旧"), "u", NOW)
    bs.upsert_estimate(store, _rec("新"), "u", LATER)
    assert [m["quoteName"] for m in bs.list_meta(store, "u", False)] == ["新", "旧"]


def test_列表元信息不含大字段_data与rateSnapshot不下发():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec(), "u", NOW)
    m = bs.list_meta(store, "u", False)[0]
    assert "data" not in m and "rateSnapshot" not in m
    # summary 展平进 meta:夹具 summary 显式给了 customerName="",这里断言实际展平值,
    # 而非"空字符串或键存在"这种恒真式子
    assert m["customerName"] == ""
    assert m["totalCost"] == 100000 and m["costRatio"] == 11.3


def test_权限判定_owner或超管可动_他人不可():
    rec = {"account": "zhangsan"}
    assert bs.can_touch(rec, "zhangsan", False) is True
    assert bs.can_touch(rec, "admin", True) is True
    assert bs.can_touch(rec, "lisi", False) is False


def test_删除():
    store = bs.new_store()
    r = bs.upsert_estimate(store, _rec(), "u", NOW)
    assert bs.delete_estimate(store, r["id"]) is True
    assert store["estimates"] == []
    assert bs.delete_estimate(store, r["id"]) is False


def test_校验_缺必填字段抛ValueError():
    for bad in ({}, {"quoteName": ""}, {"quoteName": "x"},
                {"quoteName": "x", "data": "不是对象", "rateSnapshot": {}, "summary": {}},
                {"quoteName": "x", "data": {}, "rateSnapshot": [], "summary": {}}):
        with pytest.raises(ValueError):
            bs.validate_estimate(bad)


def test_校验_报价名过长抛ValueError():
    with pytest.raises(ValueError):
        bs.validate_estimate(_rec("x" * 300))


def test_条目数上限():
    store = bs.new_store()
    store["estimates"] = [{"id": "e%d" % i, "account": "u", "quoteName": "n",
                           "createdAt": NOW, "updatedAt": NOW,
                           "data": {}, "rateSnapshot": {}, "summary": {}}
                          for i in range(bs.MAX_ESTIMATES)]
    with pytest.raises(ValueError):
        bs.upsert_estimate(store, _rec(), "u", NOW)


def test_读写往返(tmp_path):
    p = str(tmp_path / "budget_estimates.json")
    store = bs.new_store()
    bs.upsert_estimate(store, _rec(), "u", NOW)
    bs.save_store(p, store)
    assert len(bs.load_store(p)["estimates"]) == 1
    assert not (tmp_path / "budget_estimates.json.tmp").exists()


def test_读_文件缺失或损坏回落空库(tmp_path):
    assert bs.load_store(str(tmp_path / "nope.json")) == bs.new_store()
    p = tmp_path / "broken.json"
    p.write_text("{ 坏的", encoding="utf-8")
    assert bs.load_store(str(p)) == bs.new_store()


def test_读_脏条目被剔除不炸():
    # 库里混进非 dict 条目(手改坏了/旧版本残留) → 静默剔除,不能让整个页面挂掉
    import tempfile, os
    fd, p = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    with open(p, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "estimates": [1, "x", {"id": "ok", "account": "u",
                   "quoteName": "n", "createdAt": NOW, "updatedAt": NOW,
                   "data": {}, "rateSnapshot": {}, "summary": {}}]}, f)
    try:
        store = bs.load_store(p)
        assert [e["id"] for e in store["estimates"]] == ["ok"]
    finally:
        os.unlink(p)
