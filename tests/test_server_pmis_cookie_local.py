# -*- coding: utf-8 -*-
"""POST /api/pmis/cookie/fetch-local —— 服务端直接向 PMIS 取 cookie(单机 exe 版专用)。

为什么要有它:cookie_core 是【requests 直连 PMIS + 本机零信任认证】,不读浏览器。
生产版平台在服务器、零信任在用户 PC,两者不同机,才需要 client/ 那套 8765 代理中转;
单机 exe 版平台就跑在用户机器上,直接调 cookie_core 即可 —— 于是交付机不再需要
系统 Python、vbs、8765 端口,也不受 cookie_agent 的 Origin 白名单影响。
"""
import http.client
import json as _json
import threading

import audit
import auth
import server as S


class _FakeCore:
    """替身 cookie_core。真的那个会发 HTTPS 到 PMIS,单测里绝不能真发。"""

    def __init__(self, result):
        self.result = result
        self.calls = 0

    def fetch_pmis(self):
        self.calls += 1
        return self.result


_OK = {"ok": True, "cookie": "a=1; SESSION=fresh123-xyz; b=2",
       "names": ["a", "SESSION", "b"], "hasSession": True, "error": ""}
_FAIL = {"ok": False, "cookie": "", "names": [], "hasSession": False,
         "error": "被重定向到登录页（零信任未登录）: https://zerotrust..."}


def _accounts(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "super": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
                  "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"},
        "d1": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
               "allowedPages": ["*"], "allowedL4": ["D1"], "displayName": "D1"},
    }})


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", _json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse(); cookie = r.getheader("Set-Cookie").split(";")[0]; r.read()
    return conn, cookie


def _req(conn, method, path, cookie, body=None):
    headers = {"Cookie": cookie}
    if body is not None:
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body, headers)
    r = conn.getresponse()
    return r.status, r.read().decode("utf-8")


def _serve(tmp_path, monkeypatch, cookie_in_file="SESSION=old00000-aaa"):
    cfg = tmp_path / "config.json"
    cfg.write_text(_json.dumps({"session_cookie": cookie_in_file, "base_url": "u"}),
                   encoding="utf-8")
    monkeypatch.setattr(S, "PMISDATA_CONFIG", str(cfg))
    srv = S.create_server(host="127.0.0.1", port=0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1], cfg


PATH = "/api/pmis/cookie/fetch-local"


def test_路径在超管闸内():
    """写端点必须进 _SUPER_ONLY_PATHS(按精确 path 匹配,带变量的路径挂不上)。"""
    assert PATH in S._SUPER_ONLY_PATHS


def test_审计表有条目():
    """审计死埋点:handler 写了但 _ACTION_MAP 没加,操作不会留痕。"""
    assert audit.map_action("POST", PATH) is not None


def test_非超管被拒(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    srv, port, _cfg = _serve(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port, "d1")
        assert _req(conn, "POST", PATH, ck, body="{}")[0] == 403
    finally:
        srv.shutdown(); srv.server_close()


def test_取到后写入config并回预览(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    fake = _FakeCore(_OK)
    monkeypatch.setattr(S, "cookie_core", fake)
    srv, port, cfg = _serve(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port, "super")
        st, data = _req(conn, "POST", PATH, ck, body="{}")
        assert st == 200
        d = _json.loads(data)
        assert d["success"] is True
        assert d["sessionPreview"] == "fresh123"
        assert fake.calls == 1
        saved = _json.loads(cfg.read_text(encoding="utf-8"))
        assert saved["session_cookie"] == _OK["cookie"]
        assert saved["base_url"] == "u"          # 其余键必须保留
    finally:
        srv.shutdown(); srv.server_close()


def test_响应绝不回传完整cookie(tmp_path, monkeypatch):
    """cookie 是凭证。前端只需要知道取成功了、SESSION 前 8 位是什么,
    没有任何理由把整串下发到浏览器 —— 下发即多一处泄漏面。"""
    _accounts(tmp_path, monkeypatch)
    monkeypatch.setattr(S, "cookie_core", _FakeCore(_OK))
    srv, port, _cfg = _serve(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port, "super")
        _st, data = _req(conn, "POST", PATH, ck, body="{}")
        assert "fresh123-xyz" not in data
        assert _OK["cookie"] not in data
    finally:
        srv.shutdown(); srv.server_close()


def test_取失败时不动原有cookie(tmp_path, monkeypatch):
    """零信任没登录时必须保留上次的 cookie —— 覆盖成空会让下载管线连带失效,
    而用户往往只是忘了登零信任。"""
    _accounts(tmp_path, monkeypatch)
    monkeypatch.setattr(S, "cookie_core", _FakeCore(_FAIL))
    srv, port, cfg = _serve(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port, "super")
        st, data = _req(conn, "POST", PATH, ck, body="{}")
        assert st == 200
        d = _json.loads(data)
        assert d["success"] is False
        # 必须回显 fetch_pmis 给出的原始 error —— 这是本分支【独有】的信息。
        # 只断言 "零信任" 会碰瓷「缺 SESSION」那条分支的文案(它也含这三个字),
        # 于是把本分支整个删掉测试照样绿(实测过)。
        assert "被重定向到登录页" in d.get("message", "")
        # 提示不得重复:cookie_core 的这条 error 自己已经写了"零信任",handler 不该再追加一句。
        # 实测过——无条件追加会让同一句提示在真机上连出两遍。
        assert d["message"].count("零信任") == 1
        assert _json.loads(cfg.read_text(encoding="utf-8"))["session_cookie"] == "SESSION=old00000-aaa"
    finally:
        srv.shutdown(); srv.server_close()


def test_error不含零信任字样时补上提示(tmp_path, monkeypatch):
    """与上一条互为两面:cookie_core 有些失败分支(如"未获取到任何 Cookie")不带零信任提示,
    那时必须由 handler 补,否则用户看到一句干巴巴的错误、不知道该去做什么。"""
    _accounts(tmp_path, monkeypatch)
    bare = {"ok": False, "cookie": "", "names": [], "hasSession": False,
            "error": "未获取到任何 Cookie"}
    monkeypatch.setattr(S, "cookie_core", _FakeCore(bare))
    srv, port, _cfg = _serve(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port, "super")
        _st, data = _req(conn, "POST", PATH, ck, body="{}")
        d = _json.loads(data)
        assert d["success"] is False
        assert "未获取到任何 Cookie" in d["message"]
        assert d["message"].count("零信任") == 1
    finally:
        srv.shutdown(); srv.server_close()


def test_取到的cookie缺SESSION时不写入(tmp_path, monkeypatch):
    """零信任把请求重定向到别的站点时也可能收到一堆无关 cookie。
    没有 SESSION 的 cookie 对 PMIS 无用,写进去等于用垃圾覆盖掉可用凭证。"""
    _accounts(tmp_path, monkeypatch)
    no_session = {"ok": True, "cookie": "a=1; b=2", "names": ["a", "b"],
                  "hasSession": False, "error": ""}
    monkeypatch.setattr(S, "cookie_core", _FakeCore(no_session))
    srv, port, cfg = _serve(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port, "super")
        _st, data = _req(conn, "POST", PATH, ck, body="{}")
        d = _json.loads(data)
        assert d["success"] is False
        # 钉住本分支独有的诊断信息:取到了几个 cookie。写盘那层(write_session_cookie)
        # 内部也查 SESSION,只断言 success False 的话删掉本分支会被它兜住(实测过)。
        assert "没有 SESSION" in d.get("message", "")
        assert "2 个" in d.get("message", "")
        assert d.get("names") == ["a", "b"]
        assert _json.loads(cfg.read_text(encoding="utf-8"))["session_cookie"] == "SESSION=old00000-aaa"
    finally:
        srv.shutdown(); srv.server_close()


def test_模块缺失时给明确提示(tmp_path, monkeypatch):
    """打包漏收 cookie_core / 开发态没有 client/ 目录时,要说清楚是哪儿的问题,
    不能抛 AttributeError 变成 500。"""
    _accounts(tmp_path, monkeypatch)
    monkeypatch.setattr(S, "cookie_core", None)
    srv, port, _cfg = _serve(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port, "super")
        st, data = _req(conn, "POST", PATH, ck, body="{}")
        assert st == 200
        d = _json.loads(data)
        assert d["success"] is False
        assert "cookie_core" in d.get("message", "")
    finally:
        srv.shutdown(); srv.server_close()
