import json
import http.client
import threading
import auth
import server


def test_login_me_logout_flow(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port)
        conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "wxtnb"}),
                     {"Content-Type": "application/json"})
        r = conn.getresponse()
        assert r.status == 200
        set_cookie = r.getheader("Set-Cookie")
        assert set_cookie and "pmp_session=" in set_cookie
        cookie = set_cookie.split(";")[0]
        body = json.loads(r.read())
        assert body["success"] is True and body["user"]["account"] == "admin"
        assert "hash" not in body["user"]

        conn.request("GET", "/api/auth/me", headers={"Cookie": cookie})
        r2 = conn.getresponse()
        assert r2.status == 200
        assert json.loads(r2.read())["user"]["isSuper"] is True

        conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "bad"}),
                     {"Content-Type": "application/json"})
        r3 = conn.getresponse()
        assert r3.status == 401
        r3.read()

        conn.request("GET", "/api/auth/me")
        r4 = conn.getresponse()
        assert r4.status == 401
        r4.read()

        conn.request("POST", "/api/logout", headers={"Cookie": cookie})
        r5 = conn.getresponse()
        assert r5.status == 200
        assert "Max-Age=0" in (r5.getheader("Set-Cookie") or "")
        r5.read()

        conn.request("POST", "/api/logout")
        r6 = conn.getresponse()
        assert r6.status == 200
        r6.read()
    finally:
        srv.shutdown()
        srv.server_close()


def test_path_needs_auth():
    assert server._path_needs_auth('/api/sync') is True
    assert server._path_needs_auth('/data/analysis_data.json') is True
    assert server._path_needs_auth('/api/login') is False
    assert server._path_needs_auth('/api/logout') is False
    assert server._path_needs_auth('/api/auth/me') is False
    assert server._path_needs_auth('/') is False
    assert server._path_needs_auth('/assets/index.js') is False
    assert server._path_needs_auth('/index.html') is False


def test_auth_gate_blocks_unauthenticated(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port)
        # 未带 cookie 访 /data → 401
        conn.request("GET", "/data/analysis_data.json")
        r = conn.getresponse()
        assert r.status == 401
        r.read()
        # 登录拿 cookie
        conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "wxtnb"}),
                     {"Content-Type": "application/json"})
        r2 = conn.getresponse()
        cookie = r2.getheader("Set-Cookie").split(";")[0]
        r2.read()
        # 带 cookie 访 /data → 非 401(404/200 视文件,门已放行)
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": cookie})
        r3 = conn.getresponse()
        assert r3.status != 401
        r3.read()
        # 超长 account 登录 → 401
        conn.request("POST", "/api/login", json.dumps({"account": "x" * 300, "password": "y"}),
                     {"Content-Type": "application/json"})
        r4 = conn.getresponse()
        assert r4.status == 401
        r4.read()
    finally:
        srv.shutdown()
        srv.server_close()
