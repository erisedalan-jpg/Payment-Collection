import json
import pytest
import lanxin as LX


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
    },
    "byName": {"张英哲": ["A001"], "于岩": ["A002"], "耿磊磊": ["A005"],
               "张三": ["A006"], "李四": ["A007"]},
}
PMIS = {
    "P1": {"team": {"项目经理": "张三"}},
    "P2": {"team": {"项目经理": "张三"}},
    "P3": {"team": {"项目经理": "李四"}},
    "P9": {"team": {"项目经理": "查无此人"}},
}


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


def test_plan_primary_manager_gets_own_card():
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P2", "reasons": ["里程碑滞后"]}]
    plan = LX.build_plan(items, _cfg(project_levels=0), TREE, PMIS)
    prim = [r for r in plan["recipients"] if r["role"] == "primary"]
    assert len(prim) == 1
    assert prim[0]["employId"] == "A006"
    assert "2 个项目" in prim[0]["card"]["bodyTitle"]


def test_plan_supervisor_summary_rolls_up_by_direct_report():
    """+2:耿磊磊(直接上级)与于岩(隔级)各一张;于岩那张按【直接下属】列 = 只有耿磊磊一行。"""
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P3", "reasons": ["回款延期"]}]
    plan = LX.build_plan(items, _cfg(project_levels=2), TREE, PMIS)
    sup = {r["employId"]: r for r in plan["recipients"] if r["role"] == "supervisor"}
    assert set(sup) == {"A005", "A002"}
    # 耿磊磊直接带 张三/李四 → 2 行
    assert {f["key"] for f in sup["A005"]["card"]["fields"]} == {"张三", "李四"}
    # 于岩直接只带 耿磊磊 → 1 行,数字是整棵子树合计 2
    assert [f["key"] for f in sup["A002"]["card"]["fields"]] == ["耿磊磊"]
    assert sup["A002"]["card"]["fields"][0]["value"].startswith("2 项：")


def test_plan_levels_zero_no_supervisor():
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}]
    plan = LX.build_plan(items, _cfg(project_levels=0), TREE, PMIS)
    assert [r for r in plan["recipients"] if r["role"] == "supervisor"] == []


def test_plan_primary_false_only_supervisor():
    c = _cfg(project_levels=1)
    c["routes"][1]["recipients"]["primary"] = False
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                         c, TREE, PMIS)
    assert [r["role"] for r in plan["recipients"]] == ["supervisor"]


def test_plan_route_disabled_drops_items():
    plan = LX.build_plan([{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]}],
                         _cfg(project_on=False), TREE, PMIS)
    assert plan["recipients"] == []


def test_plan_filters_reasons_not_in_config():
    """配置里取消勾选的原因不参与推送。"""
    items = [{"kind": "project", "projectId": "P1", "reasons": ["数据异常"]}]
    plan = LX.build_plan(items, _cfg(project_levels=0), TREE, PMIS)
    assert plan["recipients"] == []


def test_plan_unresolved_manager_not_in_roster():
    """实测 managerNotInOrg 有 6 个项目会走到这里 —— 必须显式列出,不静默丢。"""
    plan = LX.build_plan([{"kind": "project", "projectId": "P9", "reasons": ["回款延期"]}],
                         _cfg(), TREE, PMIS)
    assert plan["recipients"] == []
    assert plan["unresolved"] == [{"kind": "project", "id": "P9",
                                   "name": "查无此人", "reason": "经理不在花名册"}]


def test_plan_unresolved_unknown_project_id():
    plan = LX.build_plan([{"kind": "project", "projectId": "NOPE", "reasons": ["回款延期"]}],
                         _cfg(), TREE, PMIS)
    assert plan["unresolved"][0]["reason"] == "项目不存在"


def test_plan_timesheet_primary():
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3}]}]
    plan = LX.build_plan(items, _cfg(), TREE, PMIS)
    assert len(plan["recipients"]) == 1
    assert plan["recipients"][0]["card"]["headTitle"] == "工时填报提醒"


def test_plan_timesheet_filters_issue_codes():
    items = [{"kind": "timesheet", "employId": "A006",
              "issues": [{"code": "TYPE_MISMATCH", "label": "工时类型填报有误", "count": 1}]}]
    plan = LX.build_plan(items, _cfg(), TREE, PMIS)      # 配置只勾了 MISS_SUMMARY
    assert plan["recipients"] == []


def test_plan_timesheet_employ_not_in_roster_unresolved():
    items = [{"kind": "timesheet", "employId": "ZZZ",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 1}]}]
    plan = LX.build_plan(items, _cfg(), TREE, PMIS)
    assert plan["unresolved"][0]["reason"] == "工号不在花名册"


def test_plan_is_deterministic_same_input_same_output():
    """preview 与 send 走同一 build_plan;两次调用必须逐字段相等 —— 这是「所见即所发」的锚点。"""
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P3", "reasons": ["里程碑滞后"]}]
    a = LX.build_plan(items, _cfg(project_levels=2), TREE, PMIS)
    b = LX.build_plan(items, _cfg(project_levels=2), TREE, PMIS)
    assert json.dumps(a, ensure_ascii=False, sort_keys=True) == \
           json.dumps(b, ensure_ascii=False, sort_keys=True)


def test_plan_totals():
    items = [{"kind": "project", "projectId": "P1", "reasons": ["回款延期"]},
             {"kind": "project", "projectId": "P9", "reasons": ["回款延期"]}]
    plan = LX.build_plan(items, _cfg(project_levels=1), TREE, PMIS)
    assert plan["totals"]["recipients"] == len(plan["recipients"])
    assert plan["totals"]["unresolved"] == 1


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
