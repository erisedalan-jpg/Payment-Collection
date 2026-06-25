# -*- coding: utf-8 -*-
import server as S


def test_step_markers_map_progress():
    assert S.classify_download_line('[2026-06-25 12:00:00]   Step 1/3: ...') == (10, '下载 PMIS 报表...')
    assert S.classify_download_line('  ✓ fetch_pmis_tables.py 执行成功') == (30, 'PMIS 报表已下载')
    assert S.classify_download_line('Step 2/3') == (35, '下载全量项目损益(耗时较长)...')
    assert S.classify_download_line('  ✓ fetch_all_projects.py 执行成功') == (75, '项目损益已下载')
    assert S.classify_download_line('Step 3/3') == (80, '交付成本分析...')
    assert S.classify_download_line('  ✓ delivery_analysis.py 执行成功') == (90, '成本分析完成')
    assert S.classify_download_line('  拷贝到目标路径') == (95, '拷贝到 input/...')
    assert S.classify_download_line('  流水线完成') == (100, '下载完成，请点更新数据生效')


def test_empty_line_returns_none():
    assert S.classify_download_line('   ') is None


def test_other_line_keeps_progress_none_with_message():
    prog, msg = S.classify_download_line('   下载项目 123/500 ...')
    assert prog is None
    assert msg == '下载项目 123/500 ...'


# ── Task 5: cookie 端点测试 ────────────────────────────────────────────────
import json as _json
import http.client
import threading
import auth


def _accounts(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "super": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
                  "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"},
        "d1": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
               "allowedPages": ["*"], "allowedL4": ["D1"], "displayName": "D1"},
    }})


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", _json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse(); cookie = r.getheader("Set-Cookie").split(";")[0]; r.read()
    return conn, cookie


def _req(conn, method, path, cookie, body=None):
    headers = {"Cookie": cookie}
    if body is not None:
        headers["Content-Type"] = "application/json"
    conn.request(method, path, body, headers)
    r = conn.getresponse(); st = r.status; data = r.read().decode("utf-8")
    return st, data


def test_cookie_paths_are_super_only():
    assert "/api/pmis/cookie" in S._SUPER_ONLY_PATHS
    assert "/api/pmis/download" in S._SUPER_ONLY_PATHS


def test_nonsuper_blocked_from_cookie(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    srv = S.create_server(host="127.0.0.1", port=0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "d1")
        assert _req(conn, "GET", "/api/pmis/cookie", ck)[0] == 403
        assert _req(conn, "POST", "/api/pmis/cookie", ck, body="{}")[0] == 403
    finally:
        srv.shutdown(); srv.server_close()


def test_super_cookie_roundtrip(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    cfg = tmp_path / "config.json"
    cfg.write_text(_json.dumps({"session_cookie": "SESSION=old00000-aaaa", "base_url": "u"}),
                   encoding="utf-8")
    monkeypatch.setattr(S, "PMISDATA_CONFIG", str(cfg))
    srv = S.create_server(host="127.0.0.1", port=0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "super")
        st, data = _req(conn, "POST", "/api/pmis/cookie", ck,
                        body=_json.dumps({"cookie": "x=1; SESSION=newvalue-123"}))
        assert st == 200
        assert _json.loads(data)["sessionPreview"] == "newvalue"
        # 写盘保留其余键
        assert _json.loads(cfg.read_text(encoding="utf-8"))["base_url"] == "u"
        # GET 状态回读
        st2, data2 = _req(conn, "GET", "/api/pmis/cookie", ck)
        assert st2 == 200 and _json.loads(data2)["sessionPreview"] == "newvalue"
        # 非法 cookie：success False
        st3, data3 = _req(conn, "POST", "/api/pmis/cookie", ck,
                          body=_json.dumps({"cookie": "no-session-here"}))
        assert _json.loads(data3)["success"] is False
    finally:
        srv.shutdown(); srv.server_close()


# ── Task 6: download SSE 端点测试 ─────────────────────────────────────────
def test_nonsuper_blocked_from_download(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    srv = S.create_server(host="127.0.0.1", port=0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "d1")
        assert _req(conn, "GET", "/api/pmis/download", ck)[0] == 403
    finally:
        srv.shutdown(); srv.server_close()


def test_super_download_missing_script_reports(tmp_path, monkeypatch):
    _accounts(tmp_path, monkeypatch)
    monkeypatch.setattr(S, "PMIS_PIPELINE_SCRIPT", str(tmp_path / "nope.sh"))
    S.download_state = {"running": False, "progress": 0, "message": ""}
    srv = S.create_server(host="127.0.0.1", port=0); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "super")
        st, data = _req(conn, "GET", "/api/pmis/download", ck)
        assert st == 200          # 非 403：超管放行
        assert "下载脚本不存在" in data
    finally:
        srv.shutdown(); srv.server_close()
