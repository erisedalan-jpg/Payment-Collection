import json
import pytest
import lanxin as LX
import lanxin_config as LC


CFG = {
    "credentials": {"appId": "app-1", "appSecret": "sec-1", "orgId": "524288",
                    "apiGateway": "https://apigw.example.com", "idType": "employ_id"},
    "sendIntervalMs": 0,
}


class FakeHTTP:
    """替身:记录请求 URL/body,按队列返回响应。"""
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, url, data=None, headers=None, timeout=None):
        self.calls.append({"url": url, "data": data, "headers": headers})
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


@pytest.fixture(autouse=True)
def _reset():
    LX._reset_token_cache()
    yield
    LX._reset_token_cache()


def test_get_app_token_ok(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok",
                      "data": {"appToken": "T1", "expiresIn": 7200}}])
    monkeypatch.setattr(LX, "_http", fake)
    assert LX.get_app_token(CFG) == "T1"
    assert "/v1/apptoken/create" in fake.calls[0]["url"]
    assert "grant_type=client_credential" in fake.calls[0]["url"]


def test_get_app_token_cached_second_call_no_http(monkeypatch):
    """官方建议缓存(7200s)。第二次调用不应再打网络。"""
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok",
                      "data": {"appToken": "T1", "expiresIn": 7200}}])
    monkeypatch.setattr(LX, "_http", fake)
    LX.get_app_token(CFG)
    LX.get_app_token(CFG)
    assert len(fake.calls) == 1


def test_get_app_token_refetch_after_expiry(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok", "data": {"appToken": "T1", "expiresIn": 7200}},
                     {"errCode": 0, "errMsg": "ok", "data": {"appToken": "T2", "expiresIn": 7200}}])
    monkeypatch.setattr(LX, "_http", fake)
    t = [1000.0]
    monkeypatch.setattr(LX.time, "time", lambda: t[0])
    assert LX.get_app_token(CFG) == "T1"
    t[0] += 7200            # 已过期(且含 300s 提前量)
    assert LX.get_app_token(CFG) == "T2"


def test_errcode_nonzero_raises_lanxin_error(monkeypatch):
    monkeypatch.setattr(LX, "_http", FakeHTTP([{"errCode": 40017, "errMsg": "secret 错误"}]))
    with pytest.raises(LX.LanxinError) as e:
        LX.get_app_token(CFG)
    assert e.value.err_code == 40017


def test_error_never_leaks_secret_or_token(monkeypatch):
    """铁律:密钥绝不进异常消息。"""
    monkeypatch.setattr(LX, "_http", FakeHTTP([{"errCode": 40017, "errMsg": "boom"}]))
    with pytest.raises(LX.LanxinError) as e:
        LX.get_app_token(CFG)
    s = str(e.value) + repr(e.value)
    assert "sec-1" not in s


def test_id_mapping_ok(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok", "data": {"staffId": "524288-abc"}}])
    monkeypatch.setattr(LX, "_http", fake)
    assert LX.id_mapping(CFG, "T1", "A000701") == "524288-abc"
    u = fake.calls[0]["url"]
    assert "/v2/staffs/id_mapping/fetch" in u
    assert "id_type=employ_id" in u
    assert "org_id=524288" in u
    assert "A000701" in u


def test_send_message_posts_json(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok",
                      "data": {"msgId": "M1", "invalidStaff": [], "invalidDepartment": []}}])
    monkeypatch.setattr(LX, "_http", fake)
    r = LX.send_message(CFG, "T1", ["524288-abc"], {"appCard": {"bodyTitle": "x"}})
    assert r["msgId"] == "M1"
    call = fake.calls[0]
    assert "/v1/messages/create" in call["url"]
    assert call["headers"]["Content-Type"] == "application/json"
    body = json.loads(call["data"].decode("utf-8"))
    assert body["userIdList"] == ["524288-abc"]
    assert body["msgType"] == "appCard"


def test_send_message_rejects_over_1000_recipients():
    """蓝信文档:userIdList 最多 1000。超了本地就拦,不浪费一次网络往返。"""
    with pytest.raises(ValueError):
        LX.send_message(CFG, "T1", ["x"] * 1001, {"appCard": {}})


def test_send_message_infers_msgtype_from_msgdata_key(monkeypatch):
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok", "data": {"msgId": "M2"}}])
    monkeypatch.setattr(LX, "_http", fake)
    LX.send_message(CFG, "T1", ["s1"], {"text": {"content": "hi"}})
    assert json.loads(fake.calls[0]["data"].decode("utf-8"))["msgType"] == "text"


def test_rate_limit_56008_retries_with_backoff(monkeypatch):
    """56008 触发限流 → 退避重试。阈值文档未写,只能靠重试兜。"""
    fake = FakeHTTP([{"errCode": 56008, "errMsg": "限流"},
                     {"errCode": 56008, "errMsg": "限流"},
                     {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M3"}}])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    assert LX.send_message(CFG, "T1", ["s1"], {"text": {"content": "hi"}})["msgId"] == "M3"
    assert len(fake.calls) == 3


def test_rate_limit_gives_up_after_max_retries(monkeypatch):
    fake = FakeHTTP([{"errCode": 56008, "errMsg": "限流"}] * 4)
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    with pytest.raises(LX.LanxinError) as e:
        LX.send_message(CFG, "T1", ["s1"], {"text": {"content": "hi"}})
    assert e.value.err_code == 56008
    assert len(fake.calls) == 4          # 1 次 + 3 次重试


def test_no_permission_10005_not_retried(monkeypatch):
    """权限问题重试无用,立即失败(否则白等 7 秒)。"""
    fake = FakeHTTP([{"errCode": 10005, "errMsg": "无权限"}])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    with pytest.raises(LX.LanxinError) as e:
        LX.send_message(CFG, "T1", ["s1"], {"text": {"content": "hi"}})
    assert e.value.err_code == 10005
    assert len(fake.calls) == 1


# ── M-1:errCode==0 但响应没有 appToken 时不能当成成功缓存(自检会显示"第①步通过"后无声中止) ──

def test_get_app_token_empty_token_in_success_response_raises(monkeypatch):
    """errCode==0 但 data 里没有 appToken(字段改名/网关裁剪/灰度返回空)—— 必须当失败处理,
    不能返回空串让调用方的 `if token:` 悄悄短路。"""
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok", "data": {"expiresIn": 7200}}])
    monkeypatch.setattr(LX, "_http", fake)
    with pytest.raises(LX.LanxinError) as e:
        LX.get_app_token(CFG)
    assert "appToken" in e.value.err_msg


def test_get_app_token_empty_token_not_cached(monkeypatch):
    """空 token 不能写缓存 —— 否则 2 小时内后续调用直接命中缓存返回空串,坏况被锁死。"""
    fake = FakeHTTP([{"errCode": 0, "errMsg": "ok", "data": {"expiresIn": 7200}},
                     {"errCode": 0, "errMsg": "ok", "data": {"appToken": "T1", "expiresIn": 7200}}])
    monkeypatch.setattr(LX, "_http", fake)
    with pytest.raises(LX.LanxinError):
        LX.get_app_token(CFG)
    # 第二次调用应重新打网络(未命中坏缓存),这次响应正常则应成功
    assert LX.get_app_token(CFG) == "T1"
    assert len(fake.calls) == 2


def test_missing_gateway_raises_clear_error():
    cfg = {"credentials": {"apiGateway": "", "appId": "a", "appSecret": "b", "orgId": "1",
                           "idType": "employ_id"}}
    with pytest.raises(LX.LanxinError) as e:
        LX.get_app_token(cfg)
    assert "网关" in e.value.err_msg


# ── build_plan / dispatch ──────────────────────────────────────────────

TREE = {
    "byId": {
        "A001": {"name": "张英哲", "supId": None, "l4": "", "l31": ""},
        "A002": {"name": "于岩", "supId": "A001", "l4": "", "l31": "服务二部"},
        "A005": {"name": "耿磊磊", "supId": "A002", "l4": "小金融服务组", "l31": "服务二部"},
        "A006": {"name": "张三", "supId": "A005", "l4": "小金融服务组", "l31": "服务二部"},
        "A007": {"name": "李四", "supId": "A005", "l4": "小金融服务组", "l31": "服务二部"},
        # A010 挂在 A002(于岩)下、与 A005(耿磊磊)是不同分支 —— 专供「不同项配不同级别,
        # 各自卷到各自的上级」用例:需要两条【互不重叠】的上级链,才能验证互不污染。
        "A010": {"name": "赵六", "supId": "A002", "l4": "小金融服务组", "l31": "服务二部"},
    },
    "byName": {"张英哲": ["A001"], "于岩": ["A002"], "耿磊磊": ["A005"],
               "张三": ["A006"], "李四": ["A007"], "赵六": ["A010"]},
}
PMIS = {
    "P1": {"team": {"项目经理": "张三"}},
    "P2": {"team": {"项目经理": "张三"}},
    "P3": {"team": {"项目经理": "李四"}},
    "P9": {"team": {"项目经理": "查无此人"}},
    "P10": {"team": {"项目经理": "赵六"}},
}

# B2 新增用例用的别名:_TREE/_PMIS 复用既有夹具;_EMP 任取一个在册工号;
# _SUP1/_SUP2 分别是 A006(张三)的 +1 上级、A010(赵六)的 +2 上级 —— 两条链不重叠。
_TREE = TREE
_PMIS = PMIS
_EMP = "A006"
_SUP1 = "A005"
_SUP2 = "A001"


def _cfg(project_levels=1, ts_levels=0, project_on=True, ts_on=True):
    c = json.loads(json.dumps(CFG))
    c["routes"] = [
        {"key": "timesheet", "label": "倚天工时问题", "enabled": ts_on,
         "issueCodes": ["MISS_SUMMARY"],
         "recipients": {"primary": True, "supervisorLevels": ts_levels}},
        {"key": "project", "label": "项目关注原因", "enabled": project_on,
         "reasons": ["回款延期", "里程碑滞后"],
         "recipients": {"primary": True, "supervisorLevels": project_levels}},
    ]
    return c


def _cfg_items(ts_items=None, pj_items=None, ts_on=True, pj_on=True):
    """新结构配置工厂。ts_items/pj_items: {code: (enabled, primary, levels)}，未列出的 code 补 (False, True, 0)。"""
    import lanxin_config as C
    c = C.default_config()
    def _mk(whitelist, spec):
        spec = spec or {}
        return [{"code": k, "enabled": spec.get(k, (False, True, 0))[0],
                 "primary": spec.get(k, (False, True, 0))[1],
                 "supervisorLevels": spec.get(k, (False, True, 0))[2]} for k in whitelist]
    c["routes"] = [
        {"key": "timesheet", "label": "倚天工时问题", "enabled": ts_on,
         "items": _mk(list(C.ISSUE_LABELS.keys()), ts_items)},
        {"key": "project", "label": "项目关注原因", "enabled": pj_on,
         "items": _mk(C.REASON_WHITELIST, pj_items)},
    ]
    return c


def test_plan_primary_manager_gets_own_card():
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P2", "reasons": ["里程碑滞后"]}]
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 0), "里程碑滞后": (True, True, 0)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    prim = [r for r in plan["recipients"] if r["role"] == "primary"]
    assert len(prim) == 1
    assert prim[0]["employId"] == "A006"
    assert "2 个项目" in prim[0]["card"]["bodyTitle"]


def test_plan_supervisor_summary_rolls_up_by_direct_report():
    """+2:耿磊磊(直接上级)与于岩(隔级)各一张;于岩那张按【直接下属】列 = 只有耿磊磊一行。"""
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P3", "reasons": ["回款延期"]}]
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 2)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    sup = {r["employId"]: r for r in plan["recipients"] if r["role"] == "supervisor"}
    assert set(sup) == {"A005", "A002"}
    # 耿磊磊直接带 张三/李四 → 2 行
    assert {f["key"] for f in sup["A005"]["card"]["fields"]} == {"张三", "李四"}
    # 于岩直接只带 耿磊磊 → 1 行,数字是整棵子树合计 2
    assert [f["key"] for f in sup["A002"]["card"]["fields"]] == ["耿磊磊"]
    assert sup["A002"]["card"]["fields"][0]["value"].startswith("2 项：")


def test_plan_levels_zero_no_supervisor():
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}]
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 0)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    assert [r for r in plan["recipients"] if r["role"] == "supervisor"] == []


def test_plan_primary_false_only_supervisor():
    cfg = _cfg_items(pj_items={"回款延期": (True, False, 1)})
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                         cfg, TREE, PMIS)
    assert [r["role"] for r in plan["recipients"]] == ["supervisor"]


def test_plan_route_disabled_drops_items():
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1)}, pj_on=False)
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                         cfg, TREE, PMIS)
    assert plan["recipients"] == []


def test_plan_filters_reasons_not_in_config():
    """配置里取消勾选的原因不参与推送。"""
    items = [{"kind": "project", "projectId": "P1", "reasons": ["数据异常"]}]
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 0)})      # 数据异常未列出 → enabled=False
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    assert plan["recipients"] == []


def test_plan_unresolved_manager_not_in_roster():
    """实测 managerNotInOrg 有 6 个项目会走到这里 —— 必须显式列出,不静默丢。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1)})
    plan = LX.build_plan([{"kind": "project", "projectId": "P9", "reasons": ["回款延期"]}],
                         cfg, TREE, PMIS)
    assert plan["recipients"] == []
    assert plan["unresolved"] == [{"kind": "project", "id": "P9",
                                   "name": "查无此人", "reason": "经理不在花名册"}]


def test_plan_unresolved_unknown_project_id():
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1)})
    plan = LX.build_plan([{"kind": "project", "projectId": "NOPE", "reasons": ["回款延期"]}],
                         cfg, TREE, PMIS)
    assert plan["unresolved"][0]["reason"] == "项目不存在"


def test_plan_timesheet_primary():
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3}]}]
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 0)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    assert len(plan["recipients"]) == 1
    assert plan["recipients"][0]["card"]["headTitle"] == "工时填报提醒"


def test_plan_timesheet_filters_issue_codes():
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "TYPE_MISMATCH", "label": "工时类型填报有误", "count": 1}]}]
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 0)})      # 配置只勾了 MISS_SUMMARY
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    assert plan["recipients"] == []


def test_plan_timesheet_employ_not_in_roster_unresolved():
    items = [{"kind": "timesheet", "employId": "ZZZ",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 1}]}]
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 0)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    assert plan["unresolved"][0]["reason"] == "工号不在花名册"


# ── B2:build_plan 按项聚合(逐项 enabled/primary/supervisorLevels) ──────────


def test_plan_item_disabled_is_dropped():
    """未启用的项不产出任何卡。"""
    cfg = _cfg_items(pj_items={"回款延期": (False, True, 1)})
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                        cfg, _TREE, _PMIS)
    assert plan["recipients"] == []


def test_plan_item_primary_false_still_rolls_up():
    """primary=False 的项不进本人卡,但仍进汇总 —— 两者是独立开关。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, False, 1)})
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                        cfg, _TREE, _PMIS)
    roles = [r["role"] for r in plan["recipients"]]
    assert "primary" not in roles
    assert "supervisor" in roles


def test_plan_primary_card_only_contains_primary_items():
    """同一人名下,只有 primary=True 的原因进本人卡。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 0), "数据异常": (True, False, 0)})
    plan = LX.build_plan(
        [{"kind": "project", "projectId": "P1", "reasons": ["回款延期", "数据异常"]}],
        cfg, _TREE, _PMIS)
    card = next(r["card"] for r in plan["recipients"] if r["role"] == "primary")
    keys = [f["key"] for f in card["fields"]]
    assert "回款延期" in keys
    assert "数据异常" not in keys


def test_plan_mixed_levels_route_to_different_supervisors():
    """★ 本任务的核心用例:不同项配不同级别,各自卷到各自的上级。

    与任务书字面版本的差异(已记录):任务书原例把两个原因都挂在【同一个】项目/经理
    (P1→张三)名下。但 _rollup 对同一来源员工的上级链是【级联】的 —— levels=2 会把
    +1 和 +2 两级都收进 agg(既有测试 test_plan_supervisor_summary_rolls_up_by_direct_report
    已验证此级联行为,B2 明确保留、不改 _rollup)。于是「数据异常」配 levels=2 时,张三的
    +1 上级(耿磊磊)会被级联进 agg,与「回款延期」(levels=1)撞在同一张卡上,不可能做到
    「+1 只看回款延期」。要让两个不同级别真正各自路由到互不重叠的上级,两个原因必须来自
    【上级链不重叠】的两个不同员工 —— 故改用 P1(张三→耿磊磊,+1)与 P10(赵六→于岩→
    张英哲,+2)两个项目,分别只挂一个原因。断言意图不变:level=1 的项目不出现在只该看
    level=1 那条链的卡上,level=2 的项目也一样。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1), "数据异常": (True, True, 2)})
    plan = LX.build_plan(
        [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
         {"kind": "project", "projectId": "P10", "reasons": ["数据异常"]}],
        cfg, _TREE, _PMIS)
    sups = {r["employId"]: r["card"] for r in plan["recipients"] if r["role"] == "supervisor"}
    # +1 级上级只看到「回款延期」;+2 级上级只看到「数据异常」
    lvl1_card = sups[_SUP1]
    lvl2_card = sups[_SUP2]
    assert "回款延期" in lvl1_card["fields"][0]["value"]
    assert "数据异常" not in lvl1_card["fields"][0]["value"]
    assert "数据异常" in lvl2_card["fields"][0]["value"]
    assert "回款延期" not in lvl2_card["fields"][0]["value"]


def test_plan_same_supervisor_hit_by_two_levels_gets_one_merged_card():
    """★ 「按人合并」在这里成立:同一上级因两项(不同级别)命中,只收【一张】卡、卡内两行内容。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1), "数据异常": (True, True, 1)})
    plan = LX.build_plan(
        [{"kind": "project", "projectId": "P1", "reasons": ["回款延期", "数据异常"]}],
        cfg, _TREE, _PMIS)
    sup_recs = [r for r in plan["recipients"] if r["role"] == "supervisor" and r["employId"] == _SUP1]
    assert len(sup_recs) == 1
    v = sup_recs[0]["card"]["fields"][0]["value"]
    assert "回款延期" in v and "数据异常" in v


def test_plan_levels_zero_item_no_summary():
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 0)})
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                        cfg, _TREE, _PMIS)
    assert all(r["role"] != "supervisor" for r in plan["recipients"])


def test_plan_timesheet_item_levels_use_code_not_label():
    """★ 工时侧 counts 按【中文 label】聚合、配置按【英文 code】—— 映射错会静默不发汇总。"""
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 1)})
    plan = LX.build_plan(
        [{"kind": "timesheet", "employId": _EMP, "start": "", "end": "",
          "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3}]}],
        cfg, _TREE, _PMIS)
    assert any(r["role"] == "supervisor" for r in plan["recipients"])


def test_summary_card_subtitle_is_neutral():
    """副标题固定「团队汇总」:合并卡里的行可能来自不同级别,写「直接上级」会自相矛盾。"""
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1)})
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                        cfg, _TREE, _PMIS)
    card = next(r["card"] for r in plan["recipients"] if r["role"] == "supervisor")
    assert card["bodySubTitle"] == "团队汇总"


def test_level_helpers_removed():
    """_level_of / _LEVEL_LABELS 已随中性文案一并删除(顺带清 V4.0.0 的 M-2 技术债)。"""
    assert not hasattr(LX, "_level_of")
    assert not hasattr(LX, "_LEVEL_LABELS")


# ── I-1:timesheet 路由的 supervisorLevels 此前静默空转(只有 project 路由认这个字段) ──

def test_plan_timesheet_supervisor_summary_rolls_up_by_direct_report():
    """非 0 supervisorLevels 现在也要出汇总卡,按【直接下属】卷起来 —— 与 project 路由对称,
    但聚合单位是「条」而不是「个项目」,措辞不能借用项目路由的文案。"""
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3}]},
             {"kind": "timesheet", "employId": "A007",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 2}]}]
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 2)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    sup = {r["employId"]: r for r in plan["recipients"] if r["role"] == "supervisor"}
    assert set(sup) == {"A005", "A002"}
    card = sup["A005"]["card"]
    assert card["headTitle"] == "工时填报提醒"
    assert "条" in card["bodyTitle"] and "项目" not in card["bodyTitle"]
    # 耿磊磊(A005)直接带 张三/李四 → 2 行
    assert {f["key"] for f in card["fields"]} == {"张三", "李四"}
    # 于岩(A002)直接只带耿磊磊(A005)→ 1 行,数字是整棵子树合计 5
    assert [f["key"] for f in sup["A002"]["card"]["fields"]] == ["耿磊磊"]
    assert sup["A002"]["card"]["fields"][0]["value"].startswith("5 条：")


def test_plan_timesheet_levels_zero_no_supervisor_card():
    """levels=0(默认值)时不出汇总卡 —— 与 project 路由 levels=0 的既有行为对称。"""
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 1}]}]
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 0)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    assert [r for r in plan["recipients"] if r["role"] == "supervisor"] == []


def test_plan_timesheet_summary_uses_short_issue_label():
    """长标签(「工时类型填报有误」24 字节)在汇总卡的 value 里也要走短标签,不能露出残词(联动 I-3)。"""
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "TYPE_MISMATCH", "label": "工时类型填报有误", "count": 1}]}]
    cfg = _cfg_items(ts_items={"TYPE_MISMATCH": (True, True, 1)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    sup = [r for r in plan["recipients"] if r["role"] == "supervisor"][0]
    value = sup["card"]["fields"][0]["value"]
    assert "工时类型有误" in value
    assert "…" not in value


# ── I-2:工时卡副标题此前恒为「统计区间  ~ 」(items 里从没有 start/end 这两个键) ──

def test_plan_timesheet_primary_card_subtitle_uses_item_range():
    """区间由前端随 items 传入;build_plan 只透传,不自行计算。"""
    items = [{"kind": "timesheet", "employId": "A006", "start": "2026-07-01", "end": "2026-07-07",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 1}]}]
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 0)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    assert plan["recipients"][0]["card"]["bodySubTitle"] == "统计区间 2026-07-01 ~ 2026-07-07"


def test_plan_timesheet_primary_card_subtitle_empty_without_range():
    """items 不带 start/end 时,副标题必须是空串,绝不拼出「统计区间  ~ 」这种半截文案。"""
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 1}]}]
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 0)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    assert plan["recipients"][0]["card"]["bodySubTitle"] == ""


def test_plan_is_deterministic_same_input_same_output():
    """preview 与 send 走同一 build_plan;两次调用必须逐字段相等 —— 这是「所见即所发」的锚点。"""
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P3", "reasons": ["里程碑滞后"]}]
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 2), "里程碑滞后": (True, True, 2)})
    a = LX.build_plan(items, cfg, TREE, PMIS)
    b = LX.build_plan(items, cfg, TREE, PMIS)
    assert json.dumps(a, ensure_ascii=False, sort_keys=True) == \
           json.dumps(b, ensure_ascii=False, sort_keys=True)


def test_plan_totals():
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P9", "reasons": ["回款延期"]}]
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 1)})
    plan = LX.build_plan(items, cfg, TREE, PMIS)
    assert plan["totals"]["recipients"] == len(plan["recipients"])
    assert plan["totals"]["unresolved"] == 1


# ── I-2:spec §3 点名的 Part B 头号测试——迁移前后 build_plan 行为等价性(golden) ──

def test_build_plan_behavior_equivalence_after_migration_golden():
    """★ I-2:spec §3 点名的 Part B 头号测试 —— 对同一份 items,用【迁移后的配置】跑
    build_plan,推给谁、推哪些项、每项计数必须与【迁移前的旧配置语义】完全一致。

    旧实现(V4.0.1 及以前的路由级 recipients + issueCodes/reasons)已被删除,仓库里也
    没有留存 golden 输出,所以本测试不是"跑旧代码再对拍",而是按旧语义手工算出期望值:
    旧配置里 recipients.primary/supervisorLevels 是【整条路由统一】的,对 issueCodes/
    reasons 里勾选的每一项都套用同一组 primary/levels —— 这正是 lanxin_config.
    _migrate_route_items 的定义(见 lanxin_config.py:130-139),所以"手工套用旧语义算
    期望值"与"迁移后按逐项 items 跑 build_plan"在数学上必然给出同一个答案,除非迁移或
    build_plan 哪里出错,故此golden值可作为等价性的可执行证据。

    唯一的已知有意差异(非缺陷,spec §B3 明确要求,为清 V4.0.0 遗留的 M-2 技术债):
    汇总卡副标题从旧的按级别分文案统一改成固定的「团队汇总」。准确的说法因此是
    "推给谁、推哪些项、每项计数完全一致,唯一变化是汇总卡副标题文案"——不是字面意义
    上的"逐字节等价",断言必须反映这个真实情况,不能为了通过测试而放宽断言。
    """
    legacy = _cfg(project_levels=2, ts_levels=2, project_on=True, ts_on=True)
    migrated = LC.validate_config(legacy)

    items = [
        {"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},   # P1 → 张三(A006)
        {"kind": "project", "projectId": "P3", "reasons": ["回款延期"]},   # P3 → 李四(A007)
        {"kind": "timesheet", "employId": "A006",
         "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3}]},
        {"kind": "timesheet", "employId": "A007",
         "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 2}]},
    ]
    plan = LX.build_plan(items, migrated, TREE, PMIS)

    got = [{"employId": r["employId"], "role": r["role"],
            "bodyTitle": r["card"]["bodyTitle"], "fields": r["card"]["fields"]}
           for r in plan["recipients"]]

    expected = [
        # ① 工时 primary(推本人):sorted(ts_by_emp) = A006, A007
        {"employId": "A006", "role": "primary",
         "bodyTitle": "你有 3 条工时填报存在问题",
         "fields": [{"key": "缺少工作概述", "value": "3 条"}]},
        {"employId": "A007", "role": "primary",
         "bodyTitle": "你有 2 条工时填报存在问题",
         "fields": [{"key": "缺少工作概述", "value": "2 条"}]},
        # ② 项目 primary(推本人):sorted(proj_by_emp) = A006, A007
        {"employId": "A006", "role": "primary",
         "bodyTitle": "你名下 1 个项目存在关注原因",
         "fields": [{"key": "回款延期", "value": "1 个项目"}]},
        {"employId": "A007", "role": "primary",
         "bodyTitle": "你名下 1 个项目存在关注原因",
         "fields": [{"key": "回款延期", "value": "1 个项目"}]},
        # ③ 工时 supervisor:+2 于岩(A002,看耿磊磊子树合计5)先、+1 耿磊磊(A005,看张三/李四)后
        #   —— sorted(agg) 按工号字符串排序,"A002" < "A005"
        {"employId": "A002", "role": "supervisor",
         "bodyTitle": "你的团队工时填报存在 5 条问题",
         "fields": [{"key": "耿磊磊", "value": "5 条：缺少工作概述 5"}]},
        {"employId": "A005", "role": "supervisor",
         "bodyTitle": "你的团队工时填报存在 5 条问题",
         "fields": [{"key": "张三", "value": "3 条：缺少工作概述 3"},
                    {"key": "李四", "value": "2 条：缺少工作概述 2"}]},
        # ④ 项目 supervisor:同样 A002 先、A005 后
        {"employId": "A002", "role": "supervisor",
         "bodyTitle": "你的团队有 2 个项目存在关注原因",
         "fields": [{"key": "耿磊磊", "value": "2 项：回款延期 2"}]},
        {"employId": "A005", "role": "supervisor",
         "bodyTitle": "你的团队有 2 个项目存在关注原因",
         "fields": [{"key": "张三", "value": "1 项：回款延期 1"},
                    {"key": "李四", "value": "1 项：回款延期 1"}]},
    ]
    assert got == expected

    # 唯一的已知差异:汇总卡副标题统一为「团队汇总」,不再按级别写「直接上级（+N）」。
    supervisor_subtitles = {r["card"]["bodySubTitle"] for r in plan["recipients"] if r["role"] == "supervisor"}
    assert supervisor_subtitles == {LX.SUMMARY_SUBTITLE}


def test_dispatch_sends_each_recipient(monkeypatch):
    plan = {"recipients": [{"employId": "A006", "name": "张三", "role": "primary",
                            "card": {"bodyTitle": "x"}},
                           {"employId": "A005", "name": "耿磊磊", "role": "supervisor",
                            "card": {"bodyTitle": "y"}}],
            "unresolved": [], "totals": {}}
    fake = FakeHTTP([
        {"errCode": 0, "errMsg": "ok", "data": {"appToken": "T", "expiresIn": 7200}},
        {"errCode": 0, "errMsg": "ok", "data": {"staffId": "s-A006"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M1"}},
        {"errCode": 0, "errMsg": "ok", "data": {"staffId": "s-A005"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M2"}},
    ])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    r = LX.dispatch(plan, _cfg())
    assert r["sent"] == 2
    assert r["failed"] == []
    assert r["msgIds"] == ["M1", "M2"]


def test_dispatch_one_failure_does_not_stop_the_batch(monkeypatch):
    """一个人发失败,不能连累后面的人 —— 必须继续,并如实报告。"""
    plan = {"recipients": [{"employId": "A006", "name": "张三", "role": "primary",
                            "card": {"bodyTitle": "x"}},
                           {"employId": "A007", "name": "李四", "role": "primary",
                            "card": {"bodyTitle": "y"}}],
            "unresolved": [], "totals": {}}
    fake = FakeHTTP([
        {"errCode": 0, "errMsg": "ok", "data": {"appToken": "T", "expiresIn": 7200}},
        {"errCode": 40062, "errMsg": "消息接收者为空或格式错"},          # A006 换 staffId 失败
        {"errCode": 0, "errMsg": "ok", "data": {"staffId": "s-A007"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M2"}},
    ])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    r = LX.dispatch(plan, _cfg())
    assert r["sent"] == 1
    assert len(r["failed"]) == 1
    assert r["failed"][0]["employId"] == "A006"
    assert r["failed"][0]["errCode"] == 40062


def test_dispatch_reuses_staffid_cache_within_one_run(monkeypatch):
    """同一人在两条路由里都命中时,id_mapping 只该调一次。"""
    plan = {"recipients": [{"employId": "A006", "name": "张三", "role": "primary",
                            "card": {"bodyTitle": "x"}},
                           {"employId": "A006", "name": "张三", "role": "supervisor",
                            "card": {"bodyTitle": "y"}}],
            "unresolved": [], "totals": {}}
    fake = FakeHTTP([
        {"errCode": 0, "errMsg": "ok", "data": {"appToken": "T", "expiresIn": 7200}},
        {"errCode": 0, "errMsg": "ok", "data": {"staffId": "s-A006"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M1"}},
        {"errCode": 0, "errMsg": "ok", "data": {"msgId": "M2"}},
    ])
    monkeypatch.setattr(LX, "_http", fake)
    monkeypatch.setattr(LX.time, "sleep", lambda s: None)
    r = LX.dispatch(plan, _cfg())
    assert r["sent"] == 2
    id_calls = [c for c in fake.calls if "id_mapping" in c["url"]]
    assert len(id_calls) == 1
