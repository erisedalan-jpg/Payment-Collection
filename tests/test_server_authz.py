"""P0 安全加固:二级授权网关(SP-审计后)。
- P0-1:原始数据文件(/input /data(analysis 除外) /yundocs_data /report /log)仅超管可直读,非超管 403。
- P0-2:写/运维端点(clear-data/sync/import/reprocess/upload/rollback/stop/data-history/files-status/pmis-* 等)仅超管,非超管 403。
内容端点(followup/tags)与 L4 过滤后的 analysis_data.json 对普通用户仍放行(回归)。"""
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


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    return conn, cookie


def _status(conn, method, path, cookie, body=None):
    headers = {"Cookie": cookie}
    if body is not None:
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body, headers)
    r = conn.getresponse()
    st = r.status
    r.read()
    return st


def test_is_protected_data_path_pure():
    assert server._is_protected_data_path('/data/accounts.json') is True
    assert server._is_protected_data_path('/data/events.json') is True
    assert server._is_protected_data_path('/input/payment_records.csv') is True
    assert server._is_protected_data_path('/yundocs_data/x.json') is True
    assert server._is_protected_data_path('/report/x.csv') is True
    assert server._is_protected_data_path('/log/x.log') is True
    # 例外:经 handle_data_json 按 L4 过滤后下发
    assert server._is_protected_data_path('/data/analysis_data.json') is False
    # 前端资源/根路径不受影响
    assert server._is_protected_data_path('/assets/index.js') is False
    assert server._is_protected_data_path('/') is False


def test_nonsuper_blocked_from_raw_data_and_ops(tmp_path, monkeypatch):
    _write_accounts(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "d1")
        # P0-1 原始数据文件:非超管 403(含口令哈希文件 accounts.json)
        assert _status(conn, "GET", "/data/accounts.json", ck) == 403
        assert _status(conn, "GET", "/data/events.json", ck) == 403
        assert _status(conn, "GET", "/input/payment_records.csv", ck) == 403
        # P0-2 写/运维端点:非超管 403
        assert _status(conn, "GET", "/api/clear-data", ck) == 403
        assert _status(conn, "GET", "/api/reprocess", ck) == 403
        assert _status(conn, "GET", "/api/stop", ck) == 403
        assert _status(conn, "GET", "/api/files/status", ck) == 403
        assert _status(conn, "GET", "/api/data-history", ck) == 403
        assert _status(conn, "POST", "/api/inputs/upload", ck, body="") == 403
        assert _status(conn, "POST", "/api/manual/rollback", ck, body="{}") == 403
    finally:
        srv.shutdown(); srv.server_close()


def test_super_allowed_through_authz_gate(tmp_path, monkeypatch):
    _write_accounts(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "super")
        # 超管放行(只读端点验证,避免触发清空/导入等破坏性副作用)
        assert _status(conn, "GET", "/api/files/status", ck) != 403
        assert _status(conn, "GET", "/api/data-history", ck) != 403
        # 原始文件:超管不被 403(文件不存在则 404,但绝非 403)
        assert _status(conn, "GET", "/input/__nonexistent__.csv", ck) != 403
    finally:
        srv.shutdown(); srv.server_close()


def test_nonsuper_content_endpoints_still_allowed(tmp_path, monkeypatch):
    """回归:内容端点(followup/tags)与 analysis_data.json 对普通用户仍放行(非 403/401)。"""
    _write_accounts(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "d1")
        assert _status(conn, "GET", "/api/followup/types", ck) not in (401, 403)
        assert _status(conn, "GET", "/api/tags", ck) not in (401, 403)
        # L4 过滤后的主数据:普通用户仍可取(非 403/401;无数据文件则 404,但不应被授权门拦)
        assert _status(conn, "GET", "/data/analysis_data.json", ck) not in (401, 403)
    finally:
        srv.shutdown(); srv.server_close()
