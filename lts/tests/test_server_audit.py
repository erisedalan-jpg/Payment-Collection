import json
import time
import http.client
import threading
import auth
import audit
import server


def _wait_for(predicate, timeout=1.0, interval=0.02):
    """轮询等待条件成立(有界)。
    审计落盘发生在 do_GET/do_POST 的 finally 块里、即响应已发往客户端字节流之后;
    本测试的"客户端"与服务端线程同进程运行，收到响应即可立刻往下执行，可能抢在
    服务端 finally 块把这条审计记录写盘之前就发起校验查询——这是测试双线程同进程
    共享 GIL 带来的时序竞争，与被测实现是否正确无关。用有界轮询替代裸读一次，避免
    因调度抖动导致断言假失败；真正的实现缺陷仍会在超时后原样暴露。"""
    deadline = time.time() + timeout
    result = predicate()
    while not result and time.time() < deadline:
        time.sleep(interval)
        result = predicate()
    return result


def _start(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    monkeypatch.setattr(audit, "AUDIT_LOG_FILE", str(tmp_path / "audit_log.jsonl"))
    monkeypatch.setattr(audit, "AUDIT_ARCHIVE_DIR", str(tmp_path / "audit_archive"))
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


def test_login_success_failure_logout_recorded(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)                       # 成功
        # 失败登录(错密码 BADPASS123)
        conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "BADPASS123"}),
                     {"Content-Type": "application/json"})
        conn.getresponse().read()
        # 登出
        conn.request("POST", "/api/logout", headers={"Cookie": cookie})
        conn.getresponse().read()
        _wait_for(lambda: {"login.success", "login.failure", "logout"} <=
                  {r["event"] for r in audit.read({}, 1, 50)["rows"]})
        events = [r["event"] for r in audit.read({}, 1, 50)["rows"]]
        assert "login.success" in events
        assert "login.failure" in events
        assert "logout" in events
        # 隐私:错误密码明文绝不落库
        with open(str(tmp_path / "audit_log.jsonl"), encoding="utf-8") as f:
            raw = f.read()
        assert "BADPASS123" not in raw
    finally:
        srv.shutdown(); srv.server_close()


def test_account_create_recorded_with_target_no_password(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        body = {"account": "zhangsan", "password": "SECRET_PW_9", "displayName": "张三",
                "allowedPages": ["projects"], "allowedL4": ["交付一部"]}
        conn.request("POST", "/api/admin/accounts/create", json.dumps(body),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        r.read()
        _wait_for(lambda: audit.read({"event": ["account.create"]}, 1, 50)["rows"])
        rows = audit.read({"event": ["account.create"]}, 1, 50)["rows"]
        assert rows and rows[0]["target"] == "zhangsan"
        assert rows[0]["account"] == "admin" and rows[0]["success"] is True
        # 隐私:新账号密码明文绝不落库
        with open(str(tmp_path / "audit_log.jsonl"), encoding="utf-8") as f:
            assert "SECRET_PW_9" not in f.read()
    finally:
        srv.shutdown(); srv.server_close()


def test_audit_endpoint_super_reads_nonsuper_403(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)                       # admin 超管
        # 造一条业务写(创建普通账号)以产生可读审计
        conn.request("POST", "/api/admin/accounts/create",
                     json.dumps({"account": "puser", "password": "Pw123456", "displayName": "普通",
                                 "allowedPages": ["projects"], "allowedL4": ["交付一部"]}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        conn.getresponse().read()
        _wait_for(lambda: audit.read({"event": ["account.create"]}, 1, 50)["rows"])
        # 超管读端点
        conn.request("GET", "/api/admin/audit?pageSize=100", headers={"Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        data = json.loads(r.read())
        assert data["success"] is True
        assert data["total"] >= 1
        assert "accounts" in data["facets"] and "events" in data["facets"]
        # 普通账号登录后读 → 403
        conn2, cookie2 = _login(port, "puser", "Pw123456")
        conn2.request("GET", "/api/admin/audit", headers={"Cookie": cookie2})
        assert conn2.getresponse().status == 403
    finally:
        srv.shutdown(); srv.server_close()


def test_read_only_get_not_recorded(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        conn.request("GET", "/api/auth/me", headers={"Cookie": cookie})
        conn.getresponse().read()
        _wait_for(lambda: audit.read({"event": ["login.success"]}, 1, 50)["total"] >= 1)
        # /api/auth/me 不在动作表 → 不产生审计
        assert audit.read({"event": ["login.success"]}, 1, 50)["total"] == 1
        me_rows = [r for r in audit.read({}, 1, 50)["rows"] if r["path"] == "/api/auth/me"]
        assert me_rows == []
    finally:
        srv.shutdown(); srv.server_close()


def _patch_business_files(monkeypatch, tmp_path):
    """把业务数据文件全局指到 tmp,避免测试污染真实 data/。"""
    for name in ('FOLLOWUP_FILE', 'PROJECT_TAGS_FILE'):
        monkeypatch.setattr(server, name, str(tmp_path / (name.lower() + '.json')))


def _post(conn, cookie, path, body):
    conn.request('POST', path, json.dumps(body),
                 {'Content-Type': 'application/json', 'Cookie': cookie})
    return conn.getresponse()


def test_followup_add_enriched_and_content_private(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        secret = '这是一段较长的跟进内容属于业务正文不应落审计日志'
        _post(conn, cookie, '/api/followup/add', {
            '项目编号': 'PRJ-9', '项目名称': '测试项目', '跟进人': '李四',
            '跟进类型': '邮件推动', '跟进内容': secret, '跟进状态': '跟进中'}).read()
        _wait_for(lambda: audit.read({'event': ['followup.add']}, 1, 50)['rows'])
        row = audit.read({'event': ['followup.add']}, 1, 50)['rows'][0]
        assert row['target'] == 'PRJ-9 · 测试项目'
        assert '邮件推动' in row['detail'] and '跟进中' in row['detail']
        with open(str(tmp_path / 'audit_log.jsonl'), encoding='utf-8') as f:
            assert secret not in f.read()   # 长正文不落审计
    finally:
        srv.shutdown(); srv.server_close()


def test_followup_update_records_old_to_new(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        r = _post(conn, cookie, '/api/followup/add', {
            '项目编号': 'PRJ-1', '项目名称': 'P1', '跟进人': '王五',
            '跟进类型': '电话沟通', '跟进内容': '短', '跟进状态': '跟进中'})
        rec_id = json.loads(r.read())['记录编号']
        _post(conn, cookie, '/api/followup/update',
              {'记录编号': rec_id, '跟进状态': '已解决'}).read()
        _wait_for(lambda: audit.read({'event': ['followup.update']}, 1, 50)['rows'])
        row = audit.read({'event': ['followup.update']}, 1, 50)['rows'][0]
        assert row['target'] == rec_id
        assert row['detail'] == '跟进状态 跟进中→已解决'
    finally:
        srv.shutdown(); srv.server_close()


def test_followup_delete_and_tags_save_enriched(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    _patch_business_files(monkeypatch, tmp_path)
    try:
        conn, cookie = _login(port)
        r = _post(conn, cookie, '/api/followup/add', {
            '项目编号': 'PRJ-2', '项目名称': 'P2', '跟进人': '赵六',
            '跟进类型': '现场拜访', '跟进内容': '短', '跟进状态': '跟进中'})
        rec_id = json.loads(r.read())['记录编号']
        _post(conn, cookie, '/api/followup/delete', {'记录编号': rec_id}).read()
        _wait_for(lambda: audit.read({'event': ['followup.delete']}, 1, 50)['rows'])
        drow = audit.read({'event': ['followup.delete']}, 1, 50)['rows'][0]
        assert drow['target'] == rec_id and drow['detail'] == '删除跟进记录'
        # 标签保存
        _post(conn, cookie, '/api/tags',
              {'tags': [{'name': 'A'}, {'name': 'B'}], 'assignments': {'PRJ-2': ['A']}}).read()
        _wait_for(lambda: audit.read({'event': ['tags.save']}, 1, 50)['rows'])
        trow = audit.read({'event': ['tags.save']}, 1, 50)['rows'][0]
        assert '标签库' in trow['detail'] and '挂载' in trow['detail']
    finally:
        srv.shutdown(); srv.server_close()


def test_reprocess_busy_not_marked_triggered(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    server.reprocess_state.clear(); server.reprocess_state.update({'running': True, 'progress': 50})
    try:
        conn, cookie = _login(port)
        conn.request('GET', '/api/reprocess', headers={'Cookie': cookie})
        conn.getresponse().read()
        _wait_for(lambda: audit.read({'event': ['data.reprocess']}, 1, 50)['rows'])
        row = audit.read({'event': ['data.reprocess']}, 1, 50)['rows'][0]
        assert not row.get('detail')   # 被拒:不标记"触发"
    finally:
        server.reprocess_state.clear()
        server.reprocess_state.update({'running': False, 'progress': 0, 'message': ''})
        srv.shutdown(); srv.server_close()


def test_reprocess_trigger_recorded(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)

    def _fake():
        server.reprocess_state.clear()
        server.reprocess_state.update({'running': False, 'progress': 100, 'message': 'done'})
    monkeypatch.setattr(server, 'run_reprocess', _fake)
    try:
        conn, cookie = _login(port)
        conn.request('GET', '/api/reprocess', headers={'Cookie': cookie})
        conn.getresponse().read()
        _wait_for(lambda: audit.read({'event': ['data.reprocess']}, 1, 50)['rows'])
        row = audit.read({'event': ['data.reprocess']}, 1, 50)['rows'][0]
        assert row['detail'] == '触发数据重新处理'
    finally:
        server.reprocess_state.clear()
        server.reprocess_state.update({'running': False, 'progress': 0, 'message': ''})
        srv.shutdown(); srv.server_close()


def test_pmis_cookie_save_enriched_no_value(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    monkeypatch.setattr(server, 'PMISDATA_CONFIG', str(tmp_path / 'pmis_config.json'))
    try:
        conn, cookie = _login(port)
        _post(conn, cookie, '/api/pmis/cookie', {'cookie': 'SESSION=SECRET_TOKEN_XYZ; a=1'}).read()
        _wait_for(lambda: audit.read({'event': ['pmis.cookie_save']}, 1, 50)['rows'])
        row = audit.read({'event': ['pmis.cookie_save']}, 1, 50)['rows'][0]
        assert row['detail'] == '更新 PMIS Cookie'
        with open(str(tmp_path / 'audit_log.jsonl'), encoding='utf-8') as f:
            raw = f.read()
        assert 'SECRET_TOKEN_XYZ' not in raw   # cookie 值绝不落审计
    finally:
        srv.shutdown(); srv.server_close()
