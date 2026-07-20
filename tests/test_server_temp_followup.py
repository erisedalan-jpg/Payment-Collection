"""临时重点跟进(/projects/temp)V4.0.2 多实例改造:HTTP 层测试。

脚手架照抄 tests/test_server_authz.py / tests/test_server_risk_paykey_followup.py:
_write_accounts/_login/_status(每测试内手起 server:create_server(port=0)+后台线程
serve_forever,finally shutdown+server_close;本仓库无共享 running_server fixture)。
在此基础上加一层 _get/_post 薄封装(按 super_user 选登录会话)与 _write_store_file
(直接落盘 store 文件,用于构造"现网存量单实例结构"的迁移场景)。
"""
import json
import http.client
import threading
import pytest
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
               "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "普通管理"},
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


class _JsonResp(dict):
    """dict 子类:既能 resp['key'] 取值,又能 resp.status 取 HTTP 状态码。"""
    status = 200


def _request(method, path, body, super_user):
    conn = _H['conn_super'] if super_user else _H['conn_normal']
    cookie = _H['ck_super'] if super_user else _H['ck_normal']
    headers = {"Cookie": cookie}
    payload = None
    if body is not None:
        payload = json.dumps(body)
        headers["Content-Type"] = "application/json"
    conn.request(method, path, payload, headers)
    r = conn.getresponse()
    status = r.status
    raw = r.read()
    try:
        parsed = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception:
        parsed = {}
    resp = _JsonResp(parsed if isinstance(parsed, dict) else {})
    resp.status = status
    return resp


def _get(path, super_user=True):
    return _request("GET", path, None, super_user)


def _post(path, body, super_user=True):
    return _request("POST", path, body, super_user)


def _write_store_file(data):
    with open(_H['store_file'], 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)


_H = {}


@pytest.fixture(autouse=True)
def _harness(tmp_path, monkeypatch):
    _write_accounts(tmp_path, monkeypatch)
    store_file = str(tmp_path / "temp_followup.json")
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", store_file)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    conn_super, ck_super = _login(port, "super")
    conn_normal, ck_normal = _login(port, "d1")
    _H.clear()
    _H.update(port=port, conn_super=conn_super, ck_super=ck_super,
              conn_normal=conn_normal, ck_normal=ck_normal, store_file=store_file)
    try:
        yield
    finally:
        srv.shutdown()
        srv.server_close()


def test_load_temp_missing_returns_default(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(tmp_path / "none.json"))
    s = server._load_temp_followup()
    assert len(s["instances"]) == 1
    inst = s["instances"][0]
    assert inst["scope"]["groups"] == []
    assert inst["current"] == {} and inst["archives"] == []


def test_load_temp_corrupt_returns_default(tmp_path, monkeypatch):
    f = tmp_path / "temp_followup.json"
    f.write_text("{bad", encoding="utf-8")
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(f))
    s = server._load_temp_followup()
    assert len(s["instances"]) == 1
    assert s["instances"][0]["scope"]["groups"] == []


def test_save_load_roundtrip(tmp_path, monkeypatch):
    f = tmp_path / "temp_followup.json"
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(f))
    store = server._load_temp_followup()
    inst = store["instances"][0]
    server.temp_followup.apply_update(inst, "P1", "weekProgress", "x", "admin", "t")
    server._save_temp_followup(store)
    reloaded = server._load_temp_followup()
    assert reloaded["instances"][0]["current"]["P1"]["weekProgress"] == "x"


def test_temp_super_only_paths():
    assert '/api/temp-followup/scope' in server._SUPER_ONLY_PATHS
    assert '/api/temp-followup/archive' in server._SUPER_ONLY_PATHS
    assert '/api/temp-followup' not in server._SUPER_ONLY_PATHS        # GET 任意登录
    assert '/api/temp-followup/update' not in server._SUPER_ONLY_PATHS  # 进展编辑任意登录


def test_instance_paths_are_super_only():
    for p in ('/api/temp-followup/instances/create',
              '/api/temp-followup/instances/rename',
              '/api/temp-followup/instances/delete'):
        assert p in server._SUPER_ONLY_PATHS, "%s 未进超管闸" % p


def test_get_returns_instances_array():
    """GET 返回 instances 数组,不再有顶层 scope/current/archives。"""
    resp = _get('/api/temp-followup')
    assert resp['success'] is True
    assert isinstance(resp['instances'], list) and len(resp['instances']) >= 1
    inst = resp['instances'][0]
    assert set(['id', 'name', 'scope', 'current', 'archives']) <= set(inst.keys())


def test_legacy_file_is_migrated_on_read():
    """现网存量文件(单实例结构)读出来必须已是 instances 数组,归档逐字保留。"""
    _write_store_file({
        "version": 1,
        "scope": {"combinator": "AND", "groups": []},
        "current": {"P1": {"weekProgress": "旧进展"}},
        "archives": [{"archiveTime": "2026-06-25 13:29:08", "rows": [{"projectId": "P1"}]}],
    })
    resp = _get('/api/temp-followup')
    inst = resp['instances'][0]
    assert inst['name'] == '默认跟进'
    assert inst['current'] == {"P1": {"weekProgress": "旧进展"}}
    assert len(inst['archives']) == 1
    assert inst['archives'][0]['archiveTime'] == "2026-06-25 13:29:08"


def test_update_requires_valid_instance_id():
    """instanceId 不存在必须 400 —— 静默落到第一个实例会让 A 实例的进展出现在 B 实例。"""
    r = _post('/api/temp-followup/update',
              {"instanceId": "inst-nope", "projectId": "P1",
               "field": "weekProgress", "content": "x"}, super_user=False)
    assert r.status == 400


def test_update_writes_into_the_named_instance_only():
    iid_a = _get('/api/temp-followup')['instances'][0]['id']
    iid_b = _post('/api/temp-followup/instances/create', {"name": "第二个"})['instance']['id']
    _post('/api/temp-followup/update',
          {"instanceId": iid_b, "projectId": "P1", "field": "weekProgress", "content": "仅B"})
    insts = {i['id']: i for i in _get('/api/temp-followup')['instances']}
    assert insts[iid_b]['current']['P1']['weekProgress'] == '仅B'
    assert 'P1' not in insts[iid_a]['current']


def test_create_rename_delete_are_super_only():
    for path, body in [('/api/temp-followup/instances/create', {"name": "x"}),
                       ('/api/temp-followup/instances/rename', {"instanceId": "i", "name": "y"}),
                       ('/api/temp-followup/instances/delete', {"instanceId": "i"})]:
        assert _post(path, body, super_user=False).status == 403


def test_update_allowed_for_normal_user():
    """填写进展是任意登录用户 —— 这是现状权限,不能因多实例改造收紧。"""
    iid = _get('/api/temp-followup')['instances'][0]['id']
    r = _post('/api/temp-followup/update',
              {"instanceId": iid, "projectId": "P1", "field": "weekProgress", "content": "x"},
              super_user=False)
    assert r.status == 200


def test_delete_last_instance_rejected():
    iid = _get('/api/temp-followup')['instances'][0]['id']
    r = _post('/api/temp-followup/instances/delete', {"instanceId": iid})
    assert r.status == 400


def test_create_with_copy_from_copies_scope_only():
    src = _get('/api/temp-followup')['instances'][0]
    _post('/api/temp-followup/scope', {
        "instanceId": src['id'], "combinator": "AND",
        "groups": [{"combinator": "AND", "conditions": [
            {"group": "project", "field": "orgL4", "op": "in", "values": ["A组"]}]}]})
    _post('/api/temp-followup/update',
          {"instanceId": src['id'], "projectId": "P1", "field": "weekProgress", "content": "x"})
    new = _post('/api/temp-followup/instances/create',
                {"name": "复制的", "copyFrom": src['id']})['instance']
    assert new['scope']['groups'][0]['conditions'][0]['values'] == ["A组"]
    assert new['current'] == {}


def test_instance_endpoints_are_audited():
    """审计埋点靠 _ACTION_MAP 按 (method,path) 查表。
    新端点不加条目 → map_action 返 None → 一条审计都不写(V3.3.0 实际踩过的死埋点)。"""
    import audit
    for p in ('/api/temp-followup/instances/create',
              '/api/temp-followup/instances/rename',
              '/api/temp-followup/instances/delete'):
        assert ('POST', p) in audit._ACTION_MAP, "%s 漏登记审计,会静默不记录" % p
