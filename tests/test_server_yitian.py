import json
import http.client
import threading
import auth
import audit
import server


def _wait_for(predicate, timeout=1.0, interval=0.02):
    import time
    deadline = time.time() + timeout
    r = predicate()
    while not r and time.time() < deadline:
        time.sleep(interval)
        r = predicate()
    return r


def _start(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    monkeypatch.setattr(audit, "AUDIT_LOG_FILE", str(tmp_path / "audit_log.jsonl"))
    monkeypatch.setattr(audit, "AUDIT_ARCHIVE_DIR", str(tmp_path / "audit_archive"))
    monkeypatch.setattr(server, "YITIAN_CONFIG", str(tmp_path / "yitian_config.json"))
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


def test_super_save_and_get_yitian_cookie(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port)
        conn.request("POST", "/api/yitian/cookie", json.dumps({"cookie": "XSRF-TOKEN=abcdefgh; PHPSESSID=y"}),
                     {"Content-Type": "application/json", "Cookie": ck})
        r = conn.getresponse()
        assert r.status == 200
        assert json.loads(r.read())["sessionPreview"] == "XSRF-TOK"
        conn.request("GET", "/api/yitian/cookie", headers={"Cookie": ck})
        r2 = conn.getresponse()
        assert r2.status == 200 and json.loads(r2.read())["sessionPreview"] == "XSRF-TOK"
        # 审计落一条 yitian.cookie_save
        assert _wait_for(lambda: audit.read({"event": ["yitian.cookie_save"]}, 1, 50)["total"] >= 1)
    finally:
        srv.shutdown(); srv.server_close()


def test_empty_cookie_rejected(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port)
        conn.request("POST", "/api/yitian/cookie", json.dumps({"cookie": ""}),
                     {"Content-Type": "application/json", "Cookie": ck})
        r = conn.getresponse()
        body = json.loads(r.read())
        assert body.get("success") is False
    finally:
        srv.shutdown(); srv.server_close()


def test_non_super_forbidden(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port)
        conn.request("POST", "/api/admin/accounts/create",
                     json.dumps({"account": "pu", "password": "Pw123456", "displayName": "p",
                                 "allowedPages": ["projects"], "allowedL4": ["交付一部"]}),
                     {"Content-Type": "application/json", "Cookie": ck})
        conn.getresponse().read()
        conn2, ck2 = _login(port, "pu", "Pw123456")
        conn2.request("GET", "/api/yitian/cookie", headers={"Cookie": ck2})
        assert conn2.getresponse().status == 403
    finally:
        srv.shutdown(); srv.server_close()
