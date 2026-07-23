# -*- coding: utf-8 -*-
"""跟进表超管自定义列(Task 4):server 更新/归档接线 + 删列清值 —— HTTP 层测试。

覆盖:
1) 4 域 update handler 放行自定义列 key(通过 extra_fields 透传)。
2) 归档 clear_fields 语义 —— 留存表(risk/payment_key)只清 clearOnArchive=True 的自定义列、
   内置字段保留;清空表(temp/opportunity)内置字段全清、但 clearOnArchive=False 的自定义列仍存活
   (证明走的是 clear_field_keys() 精确集合,不是旧的"table_level 全清 current"整表清空)。
3) handle_followup_columns_delete:删配置 + 清对应 store 当前值(temp 需遍历全部实例)+ 返回
   affectedRows;未知列 400。

脚手架照抄 tests/test_server_risk_paykey_followup.py / tests/test_server_temp_followup.py
(_write_accounts/_login,每测试内手起 server:create_server(port=0)+后台线程 serve_forever,
finally shutdown+server_close)。
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
    status = 200


def _request(conn, cookie, method, path, body):
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


_H = {}


@pytest.fixture(autouse=True)
def _harness(tmp_path, monkeypatch):
    _write_accounts(tmp_path, monkeypatch)
    monkeypatch.setattr(server, "FOLLOWUP_COLUMNS_FILE", str(tmp_path / "followup_columns.json"))
    monkeypatch.setattr(server, "RISK_FOLLOWUP_FILE", str(tmp_path / "risk_followup.json"))
    monkeypatch.setattr(server, "PAYKEY_FOLLOWUP_FILE", str(tmp_path / "payment_key_followup.json"))
    monkeypatch.setattr(server, "OPP_FOLLOWUP_FILE", str(tmp_path / "opportunity_followup.json"))
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(tmp_path / "temp_followup.json"))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    conn, ck = _login(port, "super")
    _H.clear()
    _H.update(conn=conn, ck=ck)
    try:
        yield
    finally:
        srv.shutdown()
        srv.server_close()


def _get(path):
    return _request(_H['conn'], _H['ck'], "GET", path, None)


def _post(path, body):
    return _request(_H['conn'], _H['ck'], "POST", path, body)


def _add_col(table, label, type_="text", clear_on_archive=False):
    r = _post('/api/followup-columns/add',
               {"table": table, "label": label, "type": type_, "clearOnArchive": clear_on_archive})
    assert r.status == 200, r
    return r['column']['key']


# ── 1) update 放行自定义列(4 域) ──

def test_risk_update_accepts_custom_column_field():
    key = _add_col('risk', '责任人')
    r = _post('/api/risk-followup/update', {"riskKey": "R1", "field": key, "content": "张三"})
    assert r.status == 200
    body = _get('/api/risk-followup')
    assert body['current']['R1'][key] == "张三"


def test_paykey_update_accepts_custom_column_field():
    key = _add_col('payment_key', '责任人')
    r = _post('/api/payment-key-followup/update', {"projectId": "P1", "field": key, "content": "李四"})
    assert r.status == 200
    body = _get('/api/payment-key-followup')
    assert body['current']['P1'][key] == "李四"


def test_opportunity_update_accepts_custom_column_field():
    key = _add_col('opportunity', '责任人')
    r = _post('/api/opportunity-followup/update', {"oppId": "opp-1", "field": key, "content": "王五"})
    assert r.status == 200
    body = _get('/api/opportunity-followup')
    assert body['current']['opp-1'][key] == "王五"


def test_temp_update_accepts_custom_column_field():
    key = _add_col('temp', '责任人')
    iid = _get('/api/temp-followup')['instances'][0]['id']
    r = _post('/api/temp-followup/update',
               {"instanceId": iid, "projectId": "P1", "field": key, "content": "赵六"})
    assert r.status == 200
    inst = _get('/api/temp-followup')['instances'][0]
    assert inst['current']['P1'][key] == "赵六"


def test_update_still_rejects_unknown_field_not_builtin_not_custom():
    r = _post('/api/risk-followup/update', {"riskKey": "R1", "field": "cf-notregistered", "content": "x"})
    assert r.status == 400


# ── 2) 归档 clear_fields 语义 ──

def test_archive_on_retain_table_clears_only_clear_on_archive_true_custom_column():
    """risk 表级留存:内置字段本就保留;两个自定义列——clearOnArchive=True 的清、False 的留。"""
    keep_key = _add_col('risk', '留', clear_on_archive=False)
    wipe_key = _add_col('risk', '清', clear_on_archive=True)
    _post('/api/risk-followup/update', {"riskKey": "R1", "field": "followAction", "content": "推进"})
    _post('/api/risk-followup/update', {"riskKey": "R1", "field": keep_key, "content": "留存值"})
    _post('/api/risk-followup/update', {"riskKey": "R1", "field": wipe_key, "content": "待清值"})

    r = _post('/api/risk-followup/archive', {"rows": [{"riskKey": "R1"}]})
    assert r.status == 200

    body = _get('/api/risk-followup')
    assert len(body['archives']) == 1
    rec = body['current']['R1']
    assert rec['followAction'] == "推进"      # 内置字段:留存表本就不清
    assert rec[keep_key] == "留存值"          # clearOnArchive=False:留
    assert wipe_key not in rec                # clearOnArchive=True:清
    assert (wipe_key + 'EditTime') not in rec
    assert (wipe_key + 'EditBy') not in rec


def test_archive_on_clear_table_wipes_builtin_but_keeps_custom_col_with_clear_on_archive_false():
    """opportunity 表级清空:内置字段全清;但 clearOnArchive=False 的自定义列不在 clear_fields
    集合里,必须继续存活(不是简单粗暴 current={} 整表清空)。"""
    keep_key = _add_col('opportunity', '备注', clear_on_archive=False)
    _post('/api/opportunity-followup/update', {"oppId": "opp-1", "field": "weekProgress", "content": "本周进展"})
    _post('/api/opportunity-followup/update', {"oppId": "opp-1", "field": keep_key, "content": "常驻备注"})

    r = _post('/api/opportunity-followup/archive', {"rows": [{"oppId": "opp-1"}]})
    assert r.status == 200

    body = _get('/api/opportunity-followup')
    assert len(body['archives']) == 1
    rec = body['current']['opp-1']
    assert 'weekProgress' not in rec          # 内置字段:表级清空必清
    assert rec[keep_key] == "常驻备注"        # clearOnArchive=False:即便表级清空也留存


def test_archive_none_clear_fields_behavior_unaffected_when_no_custom_columns():
    """未配置任何自定义列时(常态)归档行为须与升级前逐字一致——回归安全网。"""
    _post('/api/opportunity-followup/update', {"oppId": "opp-1", "field": "weekProgress", "content": "a"})
    _post('/api/opportunity-followup/archive', {"rows": [{"oppId": "opp-1"}]})
    body = _get('/api/opportunity-followup')
    assert body['current'] == {}   # 表级清空,老行为

    _post('/api/risk-followup/update', {"riskKey": "R1", "field": "followAction", "content": "b"})
    _post('/api/risk-followup/archive', {"rows": [{"riskKey": "R1"}]})
    body2 = _get('/api/risk-followup')
    assert body2['current']['R1']['followAction'] == "b"   # 表级留存,老行为


# ── 3) 删列清值 ──

def test_delete_column_purges_value_on_single_store_table():
    key = _add_col('risk', '责任人')
    _post('/api/risk-followup/update', {"riskKey": "R1", "field": key, "content": "张三"})

    r = _post('/api/followup-columns/delete', {"table": "risk", "key": key})
    assert r.status == 200
    assert r['deleted']['key'] == key
    assert r['affectedRows'] == 1

    cfg = _get('/api/followup-columns')
    assert cfg['tables']['risk'] == []

    body = _get('/api/risk-followup')
    assert key not in body['current']['R1']


def test_delete_column_purges_across_all_temp_instances():
    key = _add_col('temp', '责任人')
    iid_a = _get('/api/temp-followup')['instances'][0]['id']
    iid_b = _post('/api/temp-followup/instances/create', {"name": "第二个"})['instance']['id']
    _post('/api/temp-followup/update', {"instanceId": iid_a, "projectId": "P1", "field": key, "content": "A"})
    _post('/api/temp-followup/update', {"instanceId": iid_b, "projectId": "P2", "field": key, "content": "B"})

    r = _post('/api/followup-columns/delete', {"table": "temp", "key": key})
    assert r.status == 200
    assert r['affectedRows'] == 2

    insts = {i['id']: i for i in _get('/api/temp-followup')['instances']}
    assert key not in insts[iid_a]['current']['P1']
    assert key not in insts[iid_b]['current']['P2']


def test_delete_unknown_column_returns_400():
    r = _post('/api/followup-columns/delete', {"table": "risk", "key": "cf-deadbeef"})
    assert r.status == 400


def test_delete_is_super_only():
    assert '/api/followup-columns/delete' in server._SUPER_ONLY_PATHS
