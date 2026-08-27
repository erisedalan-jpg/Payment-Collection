"""lanxin_inbox 纯数据操作的回归。"""
from datetime import datetime, timedelta

import lanxin_inbox as I

# candidate_projects 的窗口是相对 datetime.now() 的「最近 N 天」(它是本模块唯一读墙上时钟的函数;
# prune 的 now 由调用方显式传入,不受此影响)。所以喂给它的夹具时间**必须相对今天算**。
# 教训:这里原先写死 NOW = "2026-07-20 10:00:00",于是墙上时钟一过 2026-08-19,
# from_recent_sends 那条就自己变红;而 excludes_other_people 同时退化成假绿 ——
# 它返回 [] 不再是因为「筛掉了别人」,而是因为全部超窗。
# 反过来,ignores_stale_sends 用的 "2026-01-01" 是【恒定远古】、永不进入窗口,那样写是安全的。
_FMT = "%Y-%m-%d %H:%M:%S"
NOW = datetime.now().strftime(_FMT)                                  # 参考「现在」
RECENT = (datetime.now() - timedelta(days=1)).strftime(_FMT)         # 落在 30 天窗口内


def _store_with_sent():
    s = I.new_store()
    I.record_sent(s, [
        {"staffId": "524288-aaa", "employId": "A000701", "name": "张三",
         "routeKey": "project", "projectIds": ["P001", "P002"], "msgId": "m1"},
        {"staffId": "524288-bbb", "employId": "A000702", "name": "李四",
         "routeKey": "timesheet", "projectIds": [], "msgId": "m2"},
    ], RECENT)
    return s


def test_new_store_shape():
    s = I.new_store()
    assert s["version"] == I.STORE_VERSION
    assert s["sent"] == [] and s["items"] == [] and s["seenEventIds"] == []


def test_migrate_accepts_garbage():
    """读到损坏内容不得抛错 —— 返回全新 store,由调用方决定是否落盘。"""
    for bad in [None, [], "x", 42]:
        assert I.migrate(bad)["version"] == I.STORE_VERSION


def test_migrate_preserves_existing():
    s = _store_with_sent()
    assert len(I.migrate(s)["sent"]) == 2


def test_resolve_identity_from_sent_log():
    """回调只给 staffId,身份必须靠发送台账反查。"""
    s = _store_with_sent()
    assert I.resolve_identity(s, "524288-aaa") == {"employId": "A000701", "name": "张三"}


def test_resolve_identity_unknown_returns_nulls():
    """查不到不得编造,也不得抛错 —— 收件箱要如实显示「未知」。"""
    s = _store_with_sent()
    assert I.resolve_identity(s, "524288-zzz") == {"employId": None, "name": None}


def test_candidate_projects_from_recent_sends():
    s = _store_with_sent()
    assert I.candidate_projects(s, "524288-aaa", days=30) == ["P001", "P002"]


def test_candidate_projects_excludes_other_people():
    s = _store_with_sent()
    assert I.candidate_projects(s, "524288-bbb", days=30) == []


def test_candidate_projects_ignores_stale_sends():
    """超出窗口的推送不再作为归因候选。"""
    s = I.new_store()
    I.record_sent(s, [{"staffId": "524288-aaa", "employId": "A000701", "name": "张三",
                       "routeKey": "project", "projectIds": ["P009"], "msgId": "m9"}],
                  "2026-01-01 10:00:00")
    assert I.candidate_projects(s, "524288-aaa", days=30) == []


def test_record_sent_keeps_role_and_defaults_it_to_empty():
    """role 进台账 —— 《未响应清单》靠它把上级汇总卡的收件人排除出待催视图
    (汇总卡不带任何 N 小时反馈承诺)。缺键 → 空串:V4.5.8 之前的老台账没有这个键,
    退化成空串才不会被排除、才不会整段从清单上消失。"""
    s = I.new_store()
    I.record_sent(s, [
        {"staffId": "a", "employId": "A1", "name": "张三", "routeKey": "project",
         "role": "supervisor", "projectIds": [], "msgId": "m1"},
        {"staffId": "b", "employId": "A2", "name": "李四", "routeKey": "project",
         "projectIds": [], "msgId": "m2"},          # 老形态:无 role 键
    ], NOW)
    assert [e["role"] for e in s["sent"]] == ["supervisor", ""]


def test_seen_dedup():
    s = I.new_store()
    assert I.is_seen(s, "e1") is False
    I.mark_seen(s, "e1", NOW)
    assert I.is_seen(s, "e1") is True


def test_add_item_returns_stored_copy():
    s = I.new_store()
    it = I.add_item(s, {"id": "evt-1", "text": "hi"})
    assert s["items"][0]["id"] == "evt-1"
    assert it["id"] == "evt-1"


def test_add_item_puts_newest_first():
    """收件箱是给人读的,最新的必须在最前。"""
    s = I.new_store()
    I.add_item(s, {"id": "evt-1"})
    I.add_item(s, {"id": "evt-2"})
    assert [x["id"] for x in s["items"]] == ["evt-2", "evt-1"]


def test_mark_handled():
    s = I.new_store()
    I.add_item(s, {"id": "evt-1", "handled": False})
    assert I.mark_handled(s, "evt-1", {"domain": "risk", "projectId": "P001"}) is True
    assert s["items"][0]["handled"] is True
    assert s["items"][0]["handledInfo"]["domain"] == "risk"


def test_mark_handled_missing_id_returns_false():
    s = I.new_store()
    assert I.mark_handled(s, "nope", {"domain": "risk"}) is False


def test_prune_drops_stale_seen_and_sent_but_keeps_items():
    """items 永不自动删 —— 收件箱是人要读的,自动删会让人错过。"""
    s = I.new_store()
    I.mark_seen(s, "old", "2026-01-01 10:00:00")
    I.record_sent(s, [{"staffId": "x", "employId": "e", "name": "n",
                       "routeKey": "project", "projectIds": [], "msgId": "m"}],
                  "2026-01-01 10:00:00")
    I.add_item(s, {"id": "evt-old", "receivedAt": "2026-01-01 10:00:00"})
    I.prune(s, NOW)
    assert s["seenEventIds"] == []
    assert s["sent"] == []
    assert len(s["items"]) == 1


def test_record_sent_keeps_review_items():
    """H5 页的待办清单从台账读(spec §4.5.1a:口径在前端,后端无法实时重算)。
    白名单漏了这个键 → H5 页永远显示「没有待办」,而卡片明明列了项目。"""
    s = I.new_store()
    I.record_sent(s, [{"staffId": "sid", "employId": "A001", "name": "张三",
                       "routeKey": "project", "role": "primary",
                       "projectIds": ["P1"], "msgId": "m",
                       "reviewItems": [{"projectId": "P1", "name": "XX",
                                        "reasons": [{"category": "回款延期", "detail": "3 个"}]}]}],
                  "2026-07-29 09:00:00")
    assert s["sent"][0]["reviewItems"][0]["projectId"] == "P1"


def test_record_sent_review_items_defaults_to_empty_list():
    """老台账(V4.5.8 及以前)没有这个键 → 空列表,不是 None。
    下游直接 for 循环它,None 会炸。"""
    s = I.new_store()
    I.record_sent(s, [{"staffId": "sid", "employId": "A001", "name": "张三"}],
                  "2026-07-29 09:00:00")
    assert s["sent"][0]["reviewItems"] == []


def test_staff_id_of_employ_returns_latest():
    """H5 落库时要给条目补 staffId(收件箱的身份反查与归因候选都按它索引)。
    取【最近一条】—— 同一工号的 staffId 理论上不变,但若蓝信侧变更过,
    最近的那条才是当前有效的。"""
    s = I.new_store()
    I.record_sent(s, [{"staffId": "old", "employId": "A001", "name": "张三"}],
                  "2026-07-01 09:00:00")
    I.record_sent(s, [{"staffId": "new", "employId": "A001", "name": "张三"}],
                  "2026-07-29 09:00:00")
    assert I.staff_id_of_employ(s, "A001") == "new"


def test_staff_id_of_employ_unknown_returns_empty():
    """查不到返回空串,【绝不编造】—— 与 resolve_identity 同一条纪律。"""
    assert I.staff_id_of_employ(I.new_store(), "A999") == ""
