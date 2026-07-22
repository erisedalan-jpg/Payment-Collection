import json
import http.client
import threading
import auth
import server


def _write_accounts(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    data = {"version": 1, "users": {
        "super": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
                  "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"},
        "d1": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
               "allowedPages": ["*"], "allowedL4": ["D1"], "displayName": "D1管理"},
    }}
    auth.save_accounts(data)


def _write_analysis(tmp_path, monkeypatch):
    f = tmp_path / "analysis_data.json"
    f.write_text(json.dumps({
        "meta": {"lastUpdate": "x", "totalProjects": 2, "totalClosed": 0, "totalPaymentNodes": 0},
        "projects": [{"projectId": "P1", "orgL4": "D1"}, {"projectId": "P2", "orgL4": "D2"}],
        "closedProjects": [], "projectPmis": {"P1": {}, "P2": {}}, "paymentNodes": {},
        "events": [], "dataQuality": {"summary": {}},
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(f))
    # 清缓存(若实现用模块级缓存)
    if hasattr(server, "_analysis_cache"):
        server._analysis_cache["mtime"] = None


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    return conn, cookie


def test_data_scoped_by_l4(tmp_path, monkeypatch):
    _write_accounts(tmp_path, monkeypatch)
    _write_analysis(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        # 超管 → 全量
        conn, ck = _login(port, "super")
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": ck})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert {p["projectId"] for p in body["projects"]} == {"P1", "P2"}
        # D1 用户 → 仅 D1
        conn2, ck2 = _login(port, "d1")
        conn2.request("GET", "/data/analysis_data.json", headers={"Cookie": ck2})
        r2 = conn2.getresponse(); body2 = json.loads(r2.read())
        assert [p["projectId"] for p in body2["projects"]] == ["P1"]
        assert set(body2["projectPmis"].keys()) == {"P1"}
        assert body2["meta"]["totalProjects"] == 1
        # 未登录 → 401(门)
        conn3 = http.client.HTTPConnection("127.0.0.1", port)
        conn3.request("GET", "/data/analysis_data.json")
        assert conn3.getresponse().status == 401
    finally:
        srv.shutdown(); srv.server_close()


def _write_analysis_with_pm(tmp_path, monkeypatch):
    f = tmp_path / "analysis_data.json"
    f.write_text(json.dumps({
        "meta": {"lastUpdate": "x", "totalProjects": 3, "totalClosed": 0, "totalPaymentNodes": 0},
        "projects": [
            {"projectId": "P1", "orgL4": "D1", "projectManager": "张三"},
            {"projectId": "P2", "orgL4": "D2", "projectManager": "李四"},
            {"projectId": "P3", "orgL4": "D2", "projectManager": "王五"},
        ],
        "closedProjects": [], "projectPmis": {"P1": {}, "P2": {}, "P3": {}}, "paymentNodes": {},
        "events": [], "dataQuality": {"summary": {}},
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(f))
    if hasattr(server, "_analysis_cache"):
        server._analysis_cache["mtime"] = None


def test_data_scoped_by_staff_pm(tmp_path, monkeypatch):
    # emp: 无 L4,可见员工工号 E_LI(李四) → 仅见李四管的 P2
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "emp": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
                "allowedPages": ["*"], "allowedL4": [], "allowedStaff": ["E_LI"], "displayName": "emp"},
    }})
    _write_analysis_with_pm(tmp_path, monkeypatch)
    monkeypatch.setattr(server, "_load_roster_cached",
                        lambda: [{"id": "E_LI", "name": "李四", "l4": "D2"}])
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "emp")
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": ck})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert [p["projectId"] for p in body["projects"]] == ["P2"]
        assert set(body["projectPmis"].keys()) == {"P2"}
    finally:
        srv.shutdown(); srv.server_close()


def test_data_project_domain_override(tmp_path, monkeypatch):
    # 默认全部(*),但 project 域覆盖为仅 D1 → /data 仅 D1(证明域覆盖压过默认 *)
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "u": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
              "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
              "domainScopes": {"project": {"l4": ["D1"], "staff": []}}, "displayName": "u"},
    }})
    _write_analysis(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "u")
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": ck})
        body = json.loads(conn.getresponse().read())
        assert [p["projectId"] for p in body["projects"]] == ["P1"]
    finally:
        srv.shutdown(); srv.server_close()
