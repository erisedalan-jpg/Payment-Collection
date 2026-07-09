import json
import time
import http.client
import threading
import auth
import audit
import server


def _wait_for(predicate, timeout=1.0, interval=0.02):
    """轮询等待条件成立(有界)。
    审计落盘发生在 do_GET/do_POST 的 finally 块里、即响应已发往客户端字节流之后;
    本测试的"客户端"与服务端线程同进程运行，收到响应即可立刻往下执行，可能抢在
    服务端 finally 块把这条审计记录写盘之前就发起校验查询——这是测试双线程同进程
    共享 GIL 带来的时序竞争，与被测实现是否正确无关。用有界轮询替代裸读一次，避免
    因调度抖动导致断言假失败；真正的实现缺陷仍会在超时后原样暴露。"""
    deadline = time.time() + timeout
    result = predicate()
    while not result and time.time() < deadline:
        time.sleep(interval)
        result = predicate()
    return result


def _start(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    monkeypatch.setattr(audit, "AUDIT_LOG_FILE", str(tmp_path / "audit_log.jsonl"))
    monkeypatch.setattr(audit, "AUDIT_ARCHIVE_DIR", str(tmp_path / "audit_archive"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, port


def _login(port, account="admin", password="wxtnb"):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": password}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = (r.getheader("Set-Cookie") or "").split(";")[0]
    r.read()
    return conn, cookie


def test_login_success_failure_logout_recorded(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)                       # 成功
        # 失败登录(错密码 BADPASS123)
        conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "BADPASS123"}),
                     {"Content-Type": "application/json"})
        conn.getresponse().read()
        # 登出
        conn.request("POST", "/api/logout", headers={"Cookie": cookie})
        conn.getresponse().read()
        _wait_for(lambda: {"login.success", "login.failure", "logout"} <=
                  {r["event"] for r in audit.read({}, 1, 50)["rows"]})
        events = [r["event"] for r in audit.read({}, 1, 50)["rows"]]
        assert "login.success" in events
        assert "login.failure" in events
        assert "logout" in events
        # 隐私:错误密码明文绝不落库
        with open(str(tmp_path / "audit_log.jsonl"), encoding="utf-8") as f:
            raw = f.read()
        assert "BADPASS123" not in raw
    finally:
        srv.shutdown(); srv.server_close()


def test_account_create_recorded_with_target_no_password(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        body = {"account": "zhangsan", "password": "SECRET_PW_9", "displayName": "张三",
                "allowedPages": ["projects"], "allowedL4": ["交付一部"]}
        conn.request("POST", "/api/admin/accounts/create", json.dumps(body),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        r.read()
        _wait_for(lambda: audit.read({"event": ["account.create"]}, 1, 50)["rows"])
        rows = audit.read({"event": ["account.create"]}, 1, 50)["rows"]
        assert rows and rows[0]["target"] == "zhangsan"
        assert rows[0]["account"] == "admin" and rows[0]["success"] is True
        # 隐私:新账号密码明文绝不落库
        with open(str(tmp_path / "audit_log.jsonl"), encoding="utf-8") as f:
            assert "SECRET_PW_9" not in f.read()
    finally:
        srv.shutdown(); srv.server_close()


def test_read_only_get_not_recorded(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        conn.request("GET", "/api/auth/me", headers={"Cookie": cookie})
        conn.getresponse().read()
        _wait_for(lambda: audit.read({"event": ["login.success"]}, 1, 50)["total"] >= 1)
        # /api/auth/me 不在动作表 → 不产生审计
        assert audit.read({"event": ["login.success"]}, 1, 50)["total"] == 1
        me_rows = [r for r in audit.read({}, 1, 50)["rows"] if r["path"] == "/api/auth/me"]
        assert me_rows == []
    finally:
        srv.shutdown(); srv.server_close()
