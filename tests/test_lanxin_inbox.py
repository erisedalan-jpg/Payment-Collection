"""lanxin_inbox 纯数据操作的回归。"""
import lanxin_inbox as I

NOW = "2026-07-20 10:00:00"


def _store_with_sent():
    s = I.new_store()
    I.record_sent(s, [
        {"staffId": "524288-aaa", "employId": "A000701", "name": "张三",
         "routeKey": "project", "projectIds": ["P001", "P002"], "msgId": "m1"},
        {"staffId": "524288-bbb", "employId": "A000702", "name": "李四",
         "routeKey": "timesheet", "projectIds": [], "msgId": "m2"},
    ], NOW)
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
