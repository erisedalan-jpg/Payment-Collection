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
