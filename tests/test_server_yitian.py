import json
import http.client
import threading

import pytest

import auth
import audit
import config
import server
import server as S


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


class TestYitianPageGate:
    def test_yitian_data_not_in_super_only_paths(self):
        # 铁律:该集合按 path 匹配不分 method,加进去会把普通授权账号一起 403
        assert '/api/yitian/data' not in S._SUPER_ONLY_PATHS

    def test_raw_json_path_still_protected(self):
        # 非超管不得直链原始文件绕过 L4 切分
        assert S._is_protected_data_path('/data/yitian_data.json') is True
        assert S._is_protected_data_path('/data/analysis_data.json') is False

    def test_page_keys_cover_five_pages(self):
        assert set(S._YITIAN_PAGE_KEYS) == {
            'yitian', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer'}


class TestUploadSubdir:
    def test_timesheet_maps_to_yitian_subdir(self):
        assert config.INPUT_SUBDIR_MAP[config.YITIAN_TIMESHEET_FILE] == config.YITIAN_DIRNAME
        assert config.INPUT_SUBDIR_MAP[config.YITIAN_HOLIDAYS_FILE] == config.YITIAN_DIRNAME

    def test_main_domain_files_have_no_subdir(self):
        assert config.ORG_FILE not in config.INPUT_SUBDIR_MAP

    def test_upload_whitelist_includes_yitian_files(self):
        assert S.is_valid_input_name(config.YITIAN_TIMESHEET_FILE) is True
        assert S.is_valid_input_name(config.YITIAN_HOLIDAYS_FILE) is True
        assert S.is_valid_input_name("../../etc/passwd") is False

    def test_target_dir_helper(self, tmp_path):
        base = str(tmp_path)
        assert S._input_target_dir(base, config.YITIAN_TIMESHEET_FILE).endswith(
            "input" + __import__("os").sep + "yitian")
        assert S._input_target_dir(base, config.ORG_FILE).endswith("input")


class TestFileStatus:
    def test_status_covers_yitian_files(self, tmp_path):
        import os
        ydir = tmp_path / "input" / "yitian"
        ydir.mkdir(parents=True)
        (ydir / config.YITIAN_TIMESHEET_FILE).write_bytes(b"x")
        out = S.collect_file_status(str(tmp_path))
        assert out[config.YITIAN_TIMESHEET_FILE] is not None       # 在子目录里被找到
        assert out[config.YITIAN_HOLIDAYS_FILE] is None            # 未提供 → None
