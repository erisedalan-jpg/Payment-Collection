"""L-63 HTTP 层回归:归档的【清空作用域】必须等于【快照作用域】。

为什么必须打真实端点而不是只测 followup_store:引擎改对了、handler 忘了传 archived_keys,
单元测试照样全绿(V4.5.7 的教训 —— lib 层契约 ≠ 调用点接线)。本文件逐个域发真实 HTTP,
断言范围外记录在归档后仍在 store 里。

各域主键字段名【不一样】,这正是最容易接错的地方:
  temp / payment_key / progress = projectId、opportunity = id、risk = riskKey(复合键)。
接错的后果不是报错,而是 archived_keys 恒空 → 什么都不清 → 归档静默失效(安全方向,
但功能坏了),所以每个域都断言「可见行确实被清掉了」+「范围外记录确实还在」两头。

脚手架照抄 tests/test_server_temp_followup.py。
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
    auth.save_accounts({"version": 1, "users": {
        "super": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
                  "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"},
    }})


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    return conn, cookie


_H = {}


def _post(path, body):
    conn, cookie = _H['conn'], _H['ck']
    conn.request("POST", path, json.dumps(body),
                 {"Cookie": cookie, "Content-Type": "application/json"})
    r = conn.getresponse()
    raw = r.read()
    return r.status, (json.loads(raw.decode("utf-8")) if raw else {})


def _write(path_key, data):
    with open(_H[path_key], 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)


def _read(path_key):
    with open(_H[path_key], encoding='utf-8') as f:
        return json.load(f)


@pytest.fixture(autouse=True)
def _harness(tmp_path, monkeypatch):
    _write_accounts(tmp_path, monkeypatch)
    files = {
        'temp': ("TEMP_FOLLOWUP_FILE", "temp_followup.json"),
        'progress': ("PROGRESS_FILE", "project_progress.json"),
        'opp': ("OPP_FOLLOWUP_FILE", "opportunity_followup.json"),
        'risk': ("RISK_FOLLOWUP_FILE", "risk_followup.json"),
        'cols': ("FOLLOWUP_COLUMNS_FILE", "followup_columns.json"),
    }
    paths = {}
    for k, (const, name) in files.items():
        p = str(tmp_path / name)
        monkeypatch.setattr(server, const, p)
        paths[k] = p
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    conn, ck = _login(port, "super")
    _H.clear()
    _H.update(port=port, conn=conn, ck=ck, **paths)
    try:
        yield
    finally:
        srv.shutdown()
        srv.server_close()


def test_temp_archive_keeps_out_of_scope_record():
    """temp 是表级清空(clear_on_archive=True)+ 多实例,受影响最重的一个域。"""
    _write('temp', {"version": 2, "instances": [{
        "id": "inst-1", "name": "默认跟进", "scope": {"combinator": "AND", "groups": []},
        "current": {"P1": {"weekProgress": "可见行"},
                    "P9": {"weekProgress": "蓝信归入写进来的,页面上看不见"}},
        "archives": []}]})
    st, resp = _post('/api/temp-followup/archive',
                     {"instanceId": "inst-1", "rows": [{"projectId": "P1"}]})
    assert st == 200
    cur = _read('temp')["instances"][0]["current"]
    assert "P1" not in cur                                    # 可见行照常清
    assert cur["P9"]["weekProgress"] == "蓝信归入写进来的,页面上看不见"   # 范围外内容还在
    assert resp["kept"] == 1 and resp["current"] == cur       # 回传供前端回填+提示


def test_progress_archive_keeps_non_key_project_record():
    """progress 域【不走 followup_store】,store 逻辑内联在 server.py,必须单独验。
    其行集是「重点项目」子集 —— 非重点项目的记录同样看不见、同样会被清。"""
    _write('progress', {"version": 1, "current": {
        "P1": {"weekProgress": "重点项目,可见"},
        "P9": {"weekProgress": "非重点项目,页面不显示它"}}, "archives": []})
    st, resp = _post('/api/progress/archive', {"rows": [{"projectId": "P1"}]})
    assert st == 200
    cur = _read('progress')["current"]
    assert "P1" not in cur
    assert cur["P9"]["weekProgress"] == "非重点项目,页面不显示它"
    assert resp["kept"] == 1 and resp["current"] == cur


def test_opportunity_archive_uses_id_not_project_id():
    """★ opportunity 的主键字段是 `id`,不是 projectId —— 全仓唯一的一处。
    接成 projectId 会让 archived_keys 恒空:可见行不会被清,本用例第一条断言变红。"""
    _write('opp', {"version": 1, "scope": {"combinator": "AND", "groups": []},
                   "current": {"O1": {"weekProgress": "可见商机"},
                               "O9": {"weekProgress": "范围外商机"}},
                   "archives": []})
    st, resp = _post('/api/opportunity-followup/archive', {"rows": [{"id": "O1"}]})
    assert st == 200
    cur = _read('opp')["current"]
    assert "O1" not in cur                                    # 接错字段名时这条会红
    assert cur["O9"]["weekProgress"] == "范围外商机"
    assert resp["kept"] == 1


def test_risk_archive_uses_composite_key_and_field_level_clear():
    """★ risk 是四域唯一的复合键 `{projectId}::{风险编码}`,且表级留存 —— 只有配了
    clearOnArchive 的自定义列才会清值。范围外那条的自定义列值不该被清。"""
    _write('cols', {"version": 1, "tables": {"risk": [
        {"key": "cf-a1b2c3d4", "label": "本期动作", "type": "text", "clearOnArchive": True}]}})
    _write('risk', {"version": 1, "scope": {"combinator": "AND", "groups": []},
                    "current": {"P1::R1": {"followAction": "留", "cf-a1b2c3d4": "可见行的值"},
                                "P9::R9": {"followAction": "留", "cf-a1b2c3d4": "范围外的值"}},
                    "archives": []})
    st, resp = _post('/api/risk-followup/archive', {"rows": [{"riskKey": "P1::R1"}]})
    assert st == 200
    cur = _read('risk')["current"]
    assert "cf-a1b2c3d4" not in cur["P1::R1"]                 # 可见行的自定义列照清
    assert cur["P1::R1"]["followAction"] == "留"              # 内置列本域留存
    assert cur["P9::R9"]["cf-a1b2c3d4"] == "范围外的值"        # 范围外的值不动
    assert resp["kept"] == 1


def test_archive_with_unrecognizable_rows_clears_nothing():
    """行结构变了(字段改名/前端旧版本)→ 一个 key 都提不出 → 什么都不清。
    宁可归档看起来没生效(kept 会把真相摆给用户),也不能销毁内容。"""
    _write('temp', {"version": 2, "instances": [{
        "id": "inst-1", "name": "默认跟进", "scope": {"combinator": "AND", "groups": []},
        "current": {"P1": {"weekProgress": "a"}, "P2": {"weekProgress": "b"}},
        "archives": []}]})
    st, resp = _post('/api/temp-followup/archive',
                     {"instanceId": "inst-1", "rows": [{"projId": "P1"}, {"projId": "P2"}]})
    assert st == 200
    inst = _read('temp')["instances"][0]
    assert inst["current"] == {"P1": {"weekProgress": "a"}, "P2": {"weekProgress": "b"}}
    assert len(inst["archives"]) == 1        # 快照照存
    assert resp["kept"] == 2
