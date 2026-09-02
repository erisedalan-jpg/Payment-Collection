# -*- coding: utf-8 -*-
"""早拒(401/403)必须先把请求体读干净,否则关连接时 Windows 发 RST。

★ 根因(2026-08-31 审查实证)：`do_POST` 在 `_auth_gate` / `_authz_gate` 不放行时直接
  return,**没有读请求体**。BaseHTTPRequestHandler 默认 HTTP/1.0、响应后关闭连接 ——
  而关闭一个「接收缓冲区里还有未读数据」的 socket,Windows 会发 RST 而不是 FIN,
  客户端读响应时就得到 ConnectionAbortedError [WinError 10053]。

  受控实验(空白 handler,只回 401)：
      body   60,000 B  不读 →  0/40 报错
      body  200,000 B  不读 →  7/40 报错
      body 1,000,000 B  不读 → 18/40 报错
      body 1,000,000 B  读完 →  0/40 报错        ← 修法
  剂量-反应关系清楚,且「读完 body」这一个变量就能把错误清零。

★ 这【不只是测试 flake】。会话 TTL 12 小时,用户会话过期后提交一条带富文本的跟进
  记录(POST 带 body)会被 401 早拒 —— 浏览器可能收到连接重置而不是干净的 401,
  前端就无法把它识别成「登录已过期」并跳登录页,只会显示一个泛化的网络错误。
  生产在 nginx 后面,反代吸收了一部分,所以一直没被看见。

★ 它同时是 `verify.sh` 那条老 flake 的根：`test_server_budget.py` 里两条
  「POST 带 body 期望 401」的用例偶发 WinError 10053,PROGRESS.md:105 早在
  V4.5.10 就记过同一文件、同一用例名、同一错误类,一直当成「Windows 抖动」。

本文件用 1MB body × 20 轮。坏的时候「一次都不报错」的概率约 0.55^20 ≈ 1e-5。
"""
import http.client
import json
import threading

import pytest

import audit
import auth
import server

PASSWORD = "p"
BIG = json.dumps({"pad": "x" * 1_000_000}).encode()
ROUNDS = 20


def _user(is_super):
    salt = "s"
    return {"salt": salt, "hash": auth.hash_password(PASSWORD, salt),
            "isSuper": is_super, "allowedPages": ["*"], "allowedL4": ["*"],
            "displayName": "测试"}


@pytest.fixture
def srv(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    monkeypatch.setattr(audit, "AUDIT_LOG_FILE", str(tmp_path / "audit_log.jsonl"))
    monkeypatch.setattr(audit, "AUDIT_ARCHIVE_DIR", str(tmp_path / "audit_archive"))
    auth._sessions.clear()
    auth.save_accounts({"version": 1, "users": {
        "super": _user(True), "normal": _user(False)}})
    s = server.create_server(host="127.0.0.1", port=0)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    try:
        yield s.server_address[1]
    finally:
        s.shutdown()
        s.server_close()


def _login(port, account):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    c.request("POST", "/api/login", json.dumps({"account": account, "password": PASSWORD}),
              {"Content-Type": "application/json"})
    r = c.getresponse()
    cookie = (r.getheader("Set-Cookie") or "").split(";")[0]
    r.read()
    c.close()
    assert cookie, "登录没拿到 Set-Cookie"
    return cookie


def _hammer(port, path, cookie=None, expect=401):
    """连打 ROUNDS 次大 body POST,返回 (成功数, 连接错误明细)。"""
    ok, errs = 0, {}
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    for _ in range(ROUNDS):
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=15)
            c.request("POST", path, BIG, headers)
            r = c.getresponse()
            r.read()
            if r.status == expect:
                ok += 1
            c.close()
        except OSError as e:      # ConnectionAborted / ConnectionReset 都是 OSError 子类
            k = "%s:%s" % (type(e).__name__, getattr(e, "winerror", "") or e.errno)
            errs[k] = errs.get(k, 0) + 1
    return ok, errs


def test_未登录POST大body被401拒时连接不被重置(srv):
    """★ 主用例:这正是生产上「会话过期 + 提交富文本跟进」的形状。"""
    ok, errs = _hammer(srv, "/api/tags")
    assert not errs, "早拒时未读请求体 → 连接被重置:%s" % errs
    assert ok == ROUNDS


def test_非超管POST大body被403拒时连接不被重置(srv):
    """403 走的是 _authz_gate → _require_super,与 401 是两条独立的早拒路径。
    路径必须真在 _SUPER_ONLY_PATHS 里 —— /api/budget/* 不在(它按 method 分权,
    走的是 _require_budget,那条会先读 body,测不到本缺陷)。"""
    assert "/api/followup-columns/add" in server._SUPER_ONLY_PATHS,         "选的路径不在超管闸内,这条用例就测不到 _authz_gate 那条早拒路径"
    cookie = _login(srv, "normal")
    ok, errs = _hammer(srv, "/api/followup-columns/add", cookie=cookie, expect=403)
    assert not errs, "超管闸早拒时未读请求体 → 连接被重置:%s" % errs
    assert ok == ROUNDS


def test_对照_GET不受影响(srv):
    """GET 没有请求体,本来就不该出问题 —— 用来确认上面两条测的是 body 那个变量,
    而不是「这台机器网络不稳」。"""
    errs = {}
    for _ in range(ROUNDS):
        try:
            c = http.client.HTTPConnection("127.0.0.1", srv, timeout=15)
            c.request("GET", "/api/auth/me")
            r = c.getresponse()
            r.read()
            c.close()
        except OSError as e:
            errs[type(e).__name__] = errs.get(type(e).__name__, 0) + 1
    assert not errs, "GET 也报错,说明环境本身有问题,上面两条的结论不成立:%s" % errs
