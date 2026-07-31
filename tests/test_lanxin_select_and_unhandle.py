"""V4.5.10 两个纯函数:lanxin.select_recipients(推送选人) 与
lanxin_inbox.unmark_handled(撤销归入)。都不打网络、不碰磁盘。

夹具刻意造【多条候选】:两个函数都是"从一组记录里挑/改一条",单条夹具下
挑选口径本身零覆盖 —— 把过滤条件整个删掉也不会有任何用例变红(V4.5.9 的 C-2
正是从这个洞溜进去的)。
"""
import lanxin
import lanxin_inbox


def _plan():
    """同一个人(A006)【既是项目经理又是上级】—— 在 plan 里是两条收件人,
    role 不同、卡片不同。这是 (role, employId) 二元组键存在的全部理由:
    只按工号过滤会把这两条一起选中,"只发本人明细卡"根本表达不出来。"""
    return {
        "recipients": [
            {"employId": "A006", "role": "primary", "name": "张三", "card": {"x": 1}},
            {"employId": "A006", "role": "supervisor", "name": "张三", "card": {"x": 2}},
            {"employId": "A007", "role": "primary", "name": "李四", "card": {"x": 3}},
        ],
        "unresolved": [{"kind": "project", "id": "P9", "reason": "无项目经理"}],
        "totals": {"recipients": 3, "unresolved": 1},
    }


# ── select_recipients ───────────────────────────────────────────────────────

def test_only_none_returns_plan_untouched():
    """老前端不传 only → 必须逐字保持全发行为。"""
    p = _plan()
    out = lanxin.select_recipients(p, None)
    assert out is p
    assert len(out["recipients"]) == 3


def test_only_narrows_to_selected_and_recomputes_totals():
    out = lanxin.select_recipients(_plan(), [{"role": "primary", "employId": "A007"}])
    assert [(r["role"], r["employId"]) for r in out["recipients"]] == [("primary", "A007")]
    # totals 不重算的话前端会显示"已推送 3 人",而实际只发了 1 人
    assert out["totals"]["recipients"] == 1
    assert out["totals"]["unresolved"] == 1     # 未解析与选人无关,不能被顺手改掉


def test_role_distinguishes_two_cards_of_the_same_person():
    """同工号两条只选中 primary 那条 —— 这是二元组键的核心断言。
    若实现退化成按工号过滤,这里会拿到 2 条。"""
    out = lanxin.select_recipients(_plan(), [{"role": "primary", "employId": "A006"}])
    assert len(out["recipients"]) == 1
    assert out["recipients"][0]["role"] == "primary"
    assert out["recipients"][0]["card"] == {"x": 1}


def test_only_cannot_add_a_recipient_not_in_the_plan():
    """安全性质:白名单只做收窄。前端塞一个 plan 里没有的人进来,必须被忽略 ——
    否则"选人"就成了一条能凭前端入参凭空发消息给任意工号的路径。"""
    out = lanxin.select_recipients(
        _plan(), [{"role": "primary", "employId": "A007"},
                  {"role": "primary", "employId": "A999"}])
    assert [r["employId"] for r in out["recipients"]] == ["A007"]


def test_empty_only_selects_nobody_not_everybody():
    """一个都没勾 ≠ 全发。退化成全发就是把"我只想试发给自己"变成全员触达,且不可撤销。"""
    out = lanxin.select_recipients(_plan(), [])
    assert out["recipients"] == []
    assert out["totals"]["recipients"] == 0


def test_select_does_not_mutate_the_input_plan():
    p = _plan()
    lanxin.select_recipients(p, [{"role": "primary", "employId": "A007"}])
    assert len(p["recipients"]) == 3
    assert p["totals"]["recipients"] == 3


def test_malformed_entries_are_ignored_not_crashing():
    """前端传来的东西不可信:字符串/None/缺键都不该让整次推送 500。"""
    out = lanxin.select_recipients(
        _plan(), ["A007", None, {"employId": "A007"}, {"role": "primary", "employId": "A007"}])
    assert [r["employId"] for r in out["recipients"]] == ["A007"]


# ── unmark_handled ──────────────────────────────────────────────────────────

_INFO = {"domain": "temp", "label": "临时重点跟进", "projectId": "P1",
         "instanceId": "inst-1", "riskCode": None, "at": "2026-07-31 10:00:00", "by": "admin"}


def _store():
    """三条 items:两条已归入 + 一条未归入。单条夹具下"只动目标那条"零覆盖。"""
    return {"items": [
        {"id": "i-1", "handled": True, "handledInfo": dict(_INFO)},
        {"id": "i-2", "handled": True, "handledInfo": dict(_INFO, projectId="P2")},
        {"id": "i-3", "handled": False, "handledInfo": None},
    ]}


def test_unmark_clears_flag_and_keeps_previous_target():
    s = _store()
    assert lanxin_inbox.unmark_handled(s, "i-1", "2026-07-31 12:00:00", "admin") is True
    it = s["items"][0]
    assert it["handled"] is False
    assert it["handledInfo"] is None
    # 撤销【不删】已写进跟进域的正文,所以旧去向必须留下 —— 丢了它,超管就不知道
    # 那段残留内容在哪个页面哪个项目上,再也没人去清。
    assert it["unhandledFrom"]["info"]["projectId"] == "P1"
    assert it["unhandledFrom"]["info"]["label"] == "临时重点跟进"
    assert it["unhandledFrom"]["at"] == "2026-07-31 12:00:00"
    assert it["unhandledFrom"]["by"] == "admin"


def test_unmark_touches_only_the_target_item():
    s = _store()
    lanxin_inbox.unmark_handled(s, "i-1", "t", "admin")
    assert s["items"][1]["handled"] is True
    assert s["items"][1]["handledInfo"]["projectId"] == "P2"
    assert "unhandledFrom" not in s["items"][1]


def test_unmark_keeps_the_whole_previous_info_not_a_subset():
    """留【整份】旧去向,不是挑几个键。界面上那句「曾归入 X · 项目 Y（已撤销，
    该处内容未自动删除）」要靠 label + projectId(风险域还要 riskCode)才拼得出来;
    只存 projectId 之类的收窄改动不会让任何别的用例变红,但提示会退化成
    「曾归入 - · 项目 P1」—— 超管照样找不到残留内容在哪一页。

    (这条原本写成"深拷贝断言",反向验证实测【拦不住】:夹具建 store 时已经
    dict(_INFO) 复制过一次,被测的那次拷贝有没有发生根本观察不到 —— 又一条
    摆了姿势却恒绿的测试。改成断言可观察的内容完整性。)"""
    s = _store()
    lanxin_inbox.unmark_handled(s, "i-1", "t", "admin")
    assert s["items"][0]["unhandledFrom"]["info"] == _INFO


def test_unmark_rejects_item_that_was_never_handled():
    s = _store()
    assert lanxin_inbox.unmark_handled(s, "i-3", "t", "admin") is False
    assert "unhandledFrom" not in s["items"][2]


def test_unmark_returns_false_for_unknown_id():
    assert lanxin_inbox.unmark_handled(_store(), "nope", "t", "admin") is False


def test_rehandling_clears_the_undo_trace():
    """撤销后重新归入成功 → 旧痕迹作废。不清的话界面会同时显示
    「已归入 A」和「曾归入 B(已撤销)」,读的人分不清哪条是现状。"""
    s = _store()
    lanxin_inbox.unmark_handled(s, "i-1", "t", "admin")
    assert lanxin_inbox.mark_handled(s, "i-1", dict(_INFO, projectId="P3")) is True
    assert s["items"][0]["handled"] is True
    assert "unhandledFrom" not in s["items"][0]
