import json
import http.client
import threading
import auth
import server
import yitian_rules_config as RC


def _srv(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    # 三个文件全指向临时目录,避免读写真实 data/ 且保证 hermetic
    # (store 指向不存在 → load_store 回空 → build 早返 None,不触碰 input/;data 指向 tmp → 删/写不误伤真实文件)
    monkeypatch.setattr(server, "YITIAN_RULES_FILE", str(tmp_path / "yitian_rules.json"))
    monkeypatch.setattr(server, "YITIAN_STORE_FILE", str(tmp_path / "yitian_store.json"))
    monkeypatch.setattr(server, "YITIAN_DATA_FILE", str(tmp_path / "yitian_data.json"))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def _login(port, account="admin", password="wxtnb"):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": password}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = (r.getheader("Set-Cookie") or "").split(";")[0]
    r.read()
    return conn, cookie


def test_get_returns_default_when_absent(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        conn.request("GET", "/api/yitian/rules", headers={"Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert body["success"] and body["rules"]["checks"]["summary"]["enabled"] is True
    finally:
        srv.shutdown(); srv.server_close()


def test_get_requires_super(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port)
        conn.request("GET", "/api/yitian/rules")     # 未登录
        assert conn.getresponse().status == 401
    finally:
        srv.shutdown(); srv.server_close()


def test_post_invalid_400_and_file_unchanged(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/yitian/rules",
                     json.dumps({"checks": {"serviceMode": {"enabled": True, "effectiveDate": "bad"}}}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 400
        r.read()
        import os
        assert not os.path.exists(str(tmp_path / "yitian_rules.json"))   # 未落库
    finally:
        srv.shutdown(); srv.server_close()


def test_post_saves_and_returns_problem_count(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        cfg = RC.default_config()
        conn.request("POST", "/api/yitian/rules", json.dumps(cfg),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert body["success"] and "problemCount" in body
        import os
        assert os.path.exists(str(tmp_path / "yitian_rules.json"))       # 已落库
    finally:
        srv.shutdown(); srv.server_close()
