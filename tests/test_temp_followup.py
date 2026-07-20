import pytest
import temp_followup as T


def test_new_store_has_one_default_instance():
    s = T.new_store()
    assert s["version"] == 2
    assert len(s["instances"]) == 1
    inst = s["instances"][0]
    assert inst["name"] == "默认跟进"
    assert inst["id"].startswith("inst-")
    assert inst["scope"] == {"combinator": "AND", "groups": []}
    assert inst["current"] == {} and inst["archives"] == []


def test_migrate_wraps_legacy_store_losslessly():
    """V4.0.1 及以前的单实例结构 → 包成「默认跟进」,三个字段逐字保留。"""
    legacy = {
        "version": 1,
        "scope": {"combinator": "AND", "groups": [
            {"combinator": "AND", "conditions": [
                {"group": "project", "field": "orgL4", "op": "in", "values": ["浙江服务组"]}]}]},
        "current": {"P1": {"weekProgress": "进展A", "weekProgressEditBy": "zhang"}},
        "archives": [{"archiveTime": "2026-06-25 13:29:08", "rows": [{"projectId": "P1"}]}],
    }
    out = T.migrate(legacy)
    assert len(out["instances"]) == 1
    inst = out["instances"][0]
    assert inst["name"] == "默认跟进"
    # 三个字段必须逐字保留 —— 现网有 3 条归档共 97 行,丢一条都是事故
    assert inst["scope"] == legacy["scope"]
    assert inst["current"] == legacy["current"]
    assert inst["archives"] == legacy["archives"]


def test_migrate_is_idempotent():
    """已是新结构的 store 再迁一次必须原样返回(内容与 id 都不变)。"""
    once = T.migrate({"version": 1, "scope": {"combinator": "AND", "groups": []},
                      "current": {}, "archives": []})
    twice = T.migrate(once)
    assert twice == once


def test_migrate_judges_by_missing_instances_not_version():
    """判据是「缺 instances 键」——将来出 version 3 时不能被当旧版回迁。"""
    v3 = {"version": 3, "instances": [{"id": "inst-abc", "name": "x",
                                       "scope": {"combinator": "AND", "groups": []},
                                       "current": {}, "archives": []}]}
    assert T.migrate(v3) == v3


def test_create_instance_blank_scope():
    s = T.new_store()
    inst = T.create_instance(s, "7月回款攻坚")
    assert inst["name"] == "7月回款攻坚"
    assert inst["id"] != s["instances"][0]["id"]
    assert inst["scope"] == {"combinator": "AND", "groups": []}
    assert len(s["instances"]) == 2


def test_create_instance_copy_from_copies_scope_only():
    """copyFrom 只复制 scope —— 复制别人的进展记录没有意义,还会让归档来源混淆。"""
    s = T.new_store()
    src = s["instances"][0]
    src["scope"] = {"combinator": "AND", "groups": [
        {"combinator": "AND", "conditions": [
            {"group": "project", "field": "orgL4", "op": "in", "values": ["A组"]}]}]}
    src["current"] = {"P1": {"weekProgress": "x"}}
    src["archives"] = [{"archiveTime": "t", "rows": []}]
    inst = T.create_instance(s, "新一轮", copy_from=src["id"])
    assert inst["scope"] == src["scope"]
    assert inst["current"] == {}
    assert inst["archives"] == []
    # 深拷贝:改新实例不能影响源实例
    inst["scope"]["groups"].append({"combinator": "AND", "conditions": []})
    assert len(src["scope"]["groups"]) == 1


@pytest.mark.parametrize("bad", ["", "   ", "x" * 21, None, 123])
def test_create_instance_rejects_bad_name(bad):
    s = T.new_store()
    with pytest.raises(ValueError):
        T.create_instance(s, bad)


def test_create_instance_allows_duplicate_name():
    """允许重名 —— 用户可能真要两个「7月攻坚」,靠 id 区分,强制查重只会挡路。"""
    s = T.new_store()
    a = T.create_instance(s, "同名")
    b = T.create_instance(s, "同名")
    assert a["id"] != b["id"]


def test_create_instance_unknown_copy_from_raises():
    s = T.new_store()
    with pytest.raises(ValueError):
        T.create_instance(s, "x", copy_from="inst-nope")


def test_rename_instance():
    s = T.new_store()
    iid = s["instances"][0]["id"]
    assert T.rename_instance(s, iid, "改过的名字") is True
    assert s["instances"][0]["name"] == "改过的名字"
    assert T.rename_instance(s, "inst-nope", "x") is False
    with pytest.raises(ValueError):
        T.rename_instance(s, iid, "")


def test_delete_instance():
    s = T.new_store()
    T.create_instance(s, "第二个")
    iid = s["instances"][0]["id"]
    assert T.delete_instance(s, iid) is True
    assert len(s["instances"]) == 1
    assert T.delete_instance(s, "inst-nope") is False


def test_delete_last_instance_rejected():
    """页面没有「零实例」这个合法状态,与其设计空态不如禁止。"""
    s = T.new_store()
    with pytest.raises(ValueError):
        T.delete_instance(s, s["instances"][0]["id"])


def test_find_instance():
    s = T.new_store()
    iid = s["instances"][0]["id"]
    assert T.find_instance(s, iid) is s["instances"][0]
    assert T.find_instance(s, "inst-nope") is None


def test_apply_update_operates_on_instance():
    """apply_update 等三个函数改为吃 instance —— instance 的 scope/current/archives
    三键与旧 store 顶层同构,followup_store 可直接复用。"""
    s = T.new_store()
    inst = s["instances"][0]
    rec = T.apply_update(inst, "P1", "weekProgress", "本周进展", "zhangsan", "2026-07-19 10:00:00")
    assert rec["weekProgress"] == "本周进展"
    assert rec["weekProgressEditBy"] == "zhangsan"
    assert inst["current"]["P1"]["weekProgress"] == "本周进展"
    with pytest.raises(ValueError):
        T.apply_update(inst, "P1", "notAField", "x", "a", "t")


def test_apply_archive_and_delete_operate_on_instance():
    s = T.new_store()
    inst = s["instances"][0]
    inst["current"] = {"P1": {"weekProgress": "x"}}
    T.apply_archive(inst, [{"projectId": "P1"}], "2026-07-19 10:00:00")
    assert len(inst["archives"]) == 1
    assert inst["current"] == {}          # clear_on_archive=True
    assert T.apply_archive_delete(inst, 0) is True
    assert inst["archives"] == []
    assert T.apply_archive_delete(inst, 5) is False
