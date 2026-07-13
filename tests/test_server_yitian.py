import json
import http.client
import os
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


class TestYitianSettingsEndpoint:
    def test_settings_not_in_super_only_paths(self):
        # 铁律:该集合按 path 匹配不分 method;GET 是全体授权账号要用的,加进去会把他们一起 403
        assert '/api/yitian/settings' not in S._SUPER_ONLY_PATHS

    def test_settings_file_is_not_the_cookie_config(self):
        # data/yitian_config.json 是 V2.1.1 的 cookie 配置,与本配置无关,不得复用
        assert S.YITIAN_SETTINGS_FILE != S.YITIAN_CONFIG
        assert S.YITIAN_SETTINGS_FILE.endswith('yitian_settings.json')


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


class TestClearDataRemovesYitianData:
    """I-4:清空数据不能漏删 data/yitian_data.json——那是全系统最敏感的员工级数据,
    「清空」后仍留在盘上且 /api/yitian/data 照常下发,与「清空」语义直接冲突。"""

    def test_clear_data_removes_yitian_data_file_and_cache(self, tmp_path, monkeypatch):
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        analysis_f = data_dir / "analysis_data.json"
        analysis_f.write_text("{}", encoding="utf-8")
        yitian_f = data_dir / "yitian_data.json"
        yitian_f.write_text('{"roster": []}', encoding="utf-8")
        settings_f = data_dir / "yitian_settings.json"
        settings_f.write_text('{"excludedTypes": []}', encoding="utf-8")
        store_f = data_dir / "yitian_store.json"
        store_f.write_text('{"version": 1, "rows": []}', encoding="utf-8")

        monkeypatch.setattr(server, "BASE_DIR", str(tmp_path))
        monkeypatch.setattr(server, "ANALYSIS_FILE", str(analysis_f))
        monkeypatch.setattr(server, "YITIAN_DATA_FILE", str(yitian_f))
        monkeypatch.setattr(server, "YITIAN_SETTINGS_FILE", str(settings_f))
        # 隔离累积库路径:handle_clear_data 现在也会清累积库,不隔离会清到真实的
        # data/yitian_store.json(开发机上的真实倚天累积数据)
        monkeypatch.setattr(server, "YITIAN_STORE_FILE", str(store_f))
        # 预置一份非空缓存,验证清空后缓存也被置空(否则下一次 /api/yitian/data 仍会命中旧缓存)
        server._yitian_cache['mtime'] = os.path.getmtime(str(yitian_f))
        server._yitian_cache['data'] = {"roster": []}

        srv, port = _start(tmp_path, monkeypatch)
        try:
            conn, ck = _login(port)
            conn.request("GET", "/api/clear-data", headers={"Cookie": ck})
            r = conn.getresponse()
            assert r.status == 200
            body = json.loads(r.read())
            assert body["success"] is True

            assert not yitian_f.exists()                      # 员工级工时数据已删
            assert settings_f.exists()                         # 配置文件不是数据,不删
            assert server._yitian_cache['data'] is None         # 缓存同步置空
            assert server._yitian_cache['mtime'] is None
        finally:
            srv.shutdown(); srv.server_close()
            server._yitian_cache['mtime'] = None
            server._yitian_cache['data'] = None


class TestFileStatus:
    def test_status_covers_yitian_files(self, tmp_path):
        import os
        ydir = tmp_path / "input" / "yitian"
        ydir.mkdir(parents=True)
        (ydir / config.YITIAN_TIMESHEET_FILE).write_bytes(b"x")
        out = S.collect_file_status(str(tmp_path))
        assert out[config.YITIAN_TIMESHEET_FILE] is not None       # 在子目录里被找到
        assert out[config.YITIAN_HOLIDAYS_FILE] is None            # 未提供 → None


class TestYitianStoreEndpoints:
    def test_get_store_not_in_super_only(self):
        # GET 是全体授权账号要用的(页面要显示累积状态);该集合按 path 匹配不分 method
        assert '/api/yitian/store' not in S._SUPER_ONLY_PATHS

    def test_write_paths_are_super_only(self):
        # 这两个是 POST-only 的独立 path,入闸是安全且必要的
        assert '/api/yitian/store/clear' in S._SUPER_ONLY_PATHS
        assert '/api/yitian/store/delete-range' in S._SUPER_ONLY_PATHS

    def test_store_file_path(self):
        assert S.YITIAN_STORE_FILE.endswith('yitian_store.json')
        assert S.YITIAN_STORE_FILE != S.YITIAN_SETTINGS_FILE


class TestClearDataAlsoClearsStore:
    def test_clear_data_removes_store_but_keeps_settings(self, tmp_path, monkeypatch):
        import yitian_store, yitian_settings
        store_p = str(tmp_path / 'yitian_store.json')
        set_p = str(tmp_path / 'yitian_settings.json')
        st = yitian_store.empty_store()
        yitian_store.upsert_rows(st, [{"wid": "1", "date": "2026-04-17"}])
        yitian_store.save_store(store_p, st)
        yitian_settings.save_settings(set_p, {"excludedTypes": ["管理类"]})

        monkeypatch.setattr(S, 'YITIAN_STORE_FILE', store_p)
        monkeypatch.setattr(S, 'YITIAN_SETTINGS_FILE', set_p)
        # 隔离下发文件路径:_clear_yitian_store 也会尝试删 YITIAN_DATA_FILE,不隔离会
        # 删到真实的 data/yitian_data.json(开发机上的真实倚天下发数据)
        monkeypatch.setattr(S, 'YITIAN_DATA_FILE', str(tmp_path / 'yitian_data.json'))
        S._clear_yitian_store()          # 清空数据流程里调用的那个函数

        assert yitian_store.load_store(store_p)["rows"] == []      # 累积数据清了
        assert yitian_settings.load_settings(set_p)["excludedTypes"] == ["管理类"]   # 配置留着
