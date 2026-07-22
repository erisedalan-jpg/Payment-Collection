import json
import threading
import http.client
import auth
import server


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    conn.close()
    return cookie


def _req(port, method, path, cookie, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    headers = {"Cookie": cookie, "Content-Type": "application/json"}
    conn.request(method, path, json.dumps(body) if body is not None else None, headers)
    r = conn.getresponse()
    status = r.status
    data = json.loads(r.read() or b"{}")
    conn.close()
    return status, data


def test_opportunities_scoped_by_domain(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    # 默认 allowedL4=*,但 opportunity 域覆盖为仅 D2
    auth.save_accounts({"version": 1, "users": {
        "u": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
              "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
              "domainScopes": {"opportunity": {"l4": ["D2"], "staff": []}}, "displayName": "u"},
    }})
    oppf = tmp_path / "opportunities.json"
    oppf.write_text(json.dumps({"rows": [
        {"id": "1", "name": "商机A", "l4": "D1"},
        {"id": "2", "name": "商机B", "l4": "D2"},
    ]}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "OPPORTUNITIES_FILE", str(oppf))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        cookie = _login(port, "u")
        # 读:商机域仅 D2 → 只见商机B(即使默认 allowedL4=*)
        status, body = _req(port, "GET", "/api/opportunities", cookie)
        assert status == 200
        assert [r["id"] for r in body["rows"]] == ["2"]
        # 写越权:在 D1 建商机 → 403(商机域仅 D2)
        status2, _ = _req(port, "POST", "/api/opportunities/create", cookie,
                          {"fields": {"name": "新商机", "l4": "D1"}})
        assert status2 == 403
    finally:
        srv.shutdown(); srv.server_close()
