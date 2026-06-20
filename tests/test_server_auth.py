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
    finally:
        srv.shutdown()
        srv.server_close()
