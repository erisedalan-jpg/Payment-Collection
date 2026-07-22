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
    body = json.loads(r.read())
    conn.close()
    return cookie, body


def _write_analysis(tmp_path, monkeypatch):
    f = tmp_path / "analysis_data.json"
    f.write_text(json.dumps({
        "meta": {"lastUpdate": "x", "totalProjects": 3, "totalClosed": 0, "totalPaymentNodes": 0},
        "projects": [{"projectId": "P1", "orgL4": "D1", "projectManager": "张三"},
                     {"projectId": "P2", "orgL4": "D2", "projectManager": "李四"},
                     {"projectId": "P3", "orgL4": "D3", "projectManager": "王五"}],
        "closedProjects": [], "projectPmis": {"P1": {}, "P2": {}, "P3": {}}, "paymentNodes": {},
        "events": [], "dataQuality": {"summary": {}},
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(f))
    if hasattr(server, "_analysis_cache"):
        server._analysis_cache["mtime"] = None


def test_data_json_is_domain_union(tmp_path, monkeypatch):
    # project 域内:projects 页覆盖 D1、payment 页覆盖 D2 → /data 下发二者并集(D1+D2,不含 D3)
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {"u": {
        "salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
        "allowedPages": ["*"], "allowedL4": [], "allowedStaff": [], "domainScopes": {},
        "pageScopes": {"projects": {"l4": ["D1"], "staff": []}, "payment": {"l4": ["D2"], "staff": []}},
        "displayName": "u"}}})
    _write_analysis(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        ck, _ = _login(port, "u")
        conn = http.client.HTTPConnection("127.0.0.1", port)
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": ck})
        body = json.loads(conn.getresponse().read())
        assert {p["projectId"] for p in body["projects"]} == {"P1", "P2"}   # 并集,无 D3
    finally:
        srv.shutdown(); srv.server_close()


def test_auth_me_has_staff_names(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {"u": {
        "salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
        "allowedPages": ["*"], "allowedL4": [], "allowedStaff": ["E_LI"], "domainScopes": {},
        "pageScopes": {"projects": {"l4": [], "staff": ["E_WANG"]}}, "displayName": "u"}}})
    monkeypatch.setattr(server, "_load_roster_cached",
                        lambda: [{"id": "E_LI", "name": "李四", "l4": "D2"},
                                 {"id": "E_WANG", "name": "王五", "l4": "D3"},
                                 {"id": "E_OTHER", "name": "赵六", "l4": "D9"}])
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        ck, login_body = _login(port, "u")
        assert login_body["user"]["staffNames"] == {"E_LI": "李四", "E_WANG": "王五"}   # 仅 scope 工号,不含 E_OTHER
        conn = http.client.HTTPConnection("127.0.0.1", port)
        conn.request("GET", "/api/auth/me", headers={"Cookie": ck})
        me = json.loads(conn.getresponse().read())
        assert me["user"]["staffNames"] == {"E_LI": "李四", "E_WANG": "王五"}
    finally:
        srv.shutdown(); srv.server_close()
