import lanxin_inbox as I
import lanxin_unresponded as U


def _store(sent=(), items=()):
    return {"version": 1, "sent": list(sent), "items": list(items), "seenEventIds": []}


def _sent(staff="s1", emp="A001", name="张三", route="project", pids=("P1",),
          at="2026-07-28 09:00:00", role="primary"):
    return {"staffId": staff, "employId": emp, "name": name, "routeKey": route,
            "role": role, "projectIds": list(pids), "msgId": "m1", "sentAt": at}


def _item(staff="s1", at="2026-07-28 10:00:00"):
    return {"id": "evt-1", "receivedAt": at, "status": "parsed", "staffId": staff,
            "employId": "A001", "name": "张三", "text": "收到"}


def test_overdue_and_unresponded():
    rows = U.compute(_store([_sent()]), 24, "2026-07-29 10:00:00")
    assert len(rows) == 1
    assert rows[0]["overdue"] is True
    assert rows[0]["responded"] is False
    assert rows[0]["dueAt"] == "2026-07-29 09:00:00"
    assert rows[0]["projectCount"] == 1


def test_not_overdue_before_deadline():
    rows = U.compute(_store([_sent()]), 24, "2026-07-28 23:59:59")
    assert rows[0]["overdue"] is False


def test_overdue_exactly_at_deadline():
    """恰好到点算超时(>=),不是「过了才算」—— 边界必须钉死,否则 off-by-one 无人察觉。"""
    rows = U.compute(_store([_sent()]), 24, "2026-07-29 09:00:00")
    assert rows[0]["overdue"] is True


def test_reply_after_send_counts_as_responded():
    rows = U.compute(_store([_sent()], [_item()]), 24, "2026-07-29 10:00:00")
    assert rows[0]["responded"] is True
    assert rows[0]["firstResponseAt"] == "2026-07-28 10:00:00"


def test_reply_before_send_does_not_count():
    """【承重】推送【之前】的旧回复不能冒充本次响应。
    不判方向的话,一个三个月前回过一次的人会永远显示「已响应」。"""
    old = _item(at="2026-07-01 08:00:00")
    rows = U.compute(_store([_sent()], [old]), 24, "2026-07-29 10:00:00")
    assert rows[0]["responded"] is False
    assert rows[0]["firstResponseAt"] == ""


def test_reply_at_same_second_counts():
    """同秒相等算响应(>=)。时间戳精度只到秒,卡在秒级相等判「未响应」会冤枉人。"""
    rows = U.compute(_store([_sent()], [_item(at="2026-07-28 09:00:00")]), 24,
                     "2026-07-29 10:00:00")
    assert rows[0]["responded"] is True


def test_other_person_reply_does_not_count():
    rows = U.compute(_store([_sent()], [_item(staff="s999")]), 24, "2026-07-29 10:00:00")
    assert rows[0]["responded"] is False


def test_first_response_is_earliest_not_latest():
    items = [_item(at="2026-07-28 15:00:00"), _item(at="2026-07-28 10:00:00")]
    rows = U.compute(_store([_sent()], items), 24, "2026-07-29 10:00:00")
    assert rows[0]["firstResponseAt"] == "2026-07-28 10:00:00"


def test_rows_sorted_newest_first():
    s = [_sent(at="2026-07-26 09:00:00"), _sent(at="2026-07-28 09:00:00"),
         _sent(at="2026-07-27 09:00:00")]
    rows = U.compute(_store(s), 24, "2026-07-29 10:00:00")
    assert [r["sentAt"] for r in rows] == ["2026-07-28 09:00:00", "2026-07-27 09:00:00",
                                           "2026-07-26 09:00:00"]


def test_unparsable_sent_at_is_kept_not_dropped():
    """【承重】坏时间戳的记录必须保留(overdue=False/dueAt='') —— 收件箱既有约定是
    不静默丢弃。丢掉的话「推了但时间戳坏了」的人会从清单上凭空消失。"""
    rows = U.compute(_store([_sent(at="not-a-date")]), 24, "2026-07-29 10:00:00")
    assert len(rows) == 1
    assert rows[0]["dueAt"] == ""
    assert rows[0]["overdue"] is False


def test_empty_store_returns_empty_list():
    assert U.compute(_store(), 24, "2026-07-29 10:00:00") == []


def test_project_count_reflects_multiple_projects():
    """projectCount 必须取实际项目数,不能退化成「有没有」的布尔语义。
    夹具默认 pids=("P1",) 只测一个值——「取长度」和「取布尔」结果相同,
    钉不住实现。本期核心就是「一人一张卡打包多个项目」(实测最多 32 个);
    真实场景大概率是 2~3 个甚至更多。未响应清单页要显示「涉及 N 个项目」,
    数值错算会无人察觉。"""
    rows = U.compute(_store([_sent(pids=("P1", "P2", "P3"))]), 24, "2026-07-29 10:00:00")
    assert rows[0]["projectCount"] == 3


def test_project_count_covers_zero_and_multiple():
    """工时侧推送 projectIds 是空列表(build_plan 内工时收件人恒传 []),
    故 projectCount == 0 是真实存在的形态。同时覆盖零和非零两个值以防
    min(len(...), 1) 这类把 2+ 都变成 1 的错误——零对它无防守力。"""
    rows_zero = U.compute(_store([_sent(pids=())]), 24, "2026-07-29 10:00:00")
    assert rows_zero[0]["projectCount"] == 0

    rows_multi = U.compute(_store([_sent(pids=("P1", "P2"))]), 24, "2026-07-29 10:00:00")
    assert rows_multi[0]["projectCount"] == 2


# ── review Important-3:role 透出(展示端据此把上级汇总卡的收件人排除出待催视图) ──

def test_role_is_passed_through_for_each_row():
    """【承重】supervisor 汇总卡上【没有】动作要求、没有任何 N 小时反馈承诺
    (build_summary_card 本期零改动,已核实)。不透出 role,超管打开默认的「仅未响应」
    视图会看到一片上级,去催得到的回答是「我这张卡没让我反馈」;而行里又没有任何字段
    能分辨,「涉及项目数」对汇总卡反而是全部下属项目的并集、看上去更像重点对象。"""
    rows = U.compute(_store([_sent(staff="s1", role="primary"),
                             _sent(staff="s2", emp="A002", role="supervisor")]),
                     24, "2026-07-29 10:00:00")
    assert sorted(r["role"] for r in rows) == ["primary", "supervisor"]


def test_role_missing_in_legacy_sent_log_degrades_to_empty_string():
    """【向后兼容】V4.5.8 之前的台账没有 role 键 → 空串,而【不是】被当成 supervisor。
    空串不被展示端排除,老记录一行不丢 —— 宁可多列一行让人自己判断,
    也不能因为一个新字段把历史台账整段从清单上抹掉。"""
    legacy = _sent()
    del legacy["role"]
    rows = U.compute(_store([legacy]), 24, "2026-07-29 10:00:00")
    assert rows[0]["role"] == ""


# ── review Important-4:时间戳格式是跨模块隐式契约,此处钉住「写入端 ↔ 解析端」 ──

def test_sent_at_written_by_inbox_is_parsable_here():
    """record_sent 落进台账的 sentAt,本模块必须解析得出来。

    两个模块此前各写一份同值的 _TS_FMT 字面量、无 import 关系。任一处漂移
    【全程零报错】:_parse 一律 None → dueAt 恒空、overdue 恒 False,默认
    「仅未响应」视图永远是空的,看上去像"大家都回了"。
    (server.py 那一处由 tests/test_server_lanxin.py 的端到端契约用例覆盖。)
    """
    store = I.new_store()
    I.record_sent(store, [{"staffId": "s1", "employId": "A001", "name": "张三",
                           "routeKey": "project", "role": "primary",
                           "projectIds": ["P1"], "msgId": "m1"}],
                  "2026-07-28 09:00:00")
    rows = U.compute(store, 24, "2026-07-29 10:00:00")
    assert rows[0]["dueAt"] == "2026-07-29 09:00:00"
    assert rows[0]["overdue"] is True
