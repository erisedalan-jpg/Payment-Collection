# -*- coding: utf-8 -*-
"""Characterization 端点测试(Phase C 安全网,V2.6.8 批2 Task 8)。

刻画 risk-followup / payment-key-followup 处理器族现状行为——update → get(current 生效)
→ archive → get(archives+1 且 current 仍保留,归档不清空)。作为 Task 9 重构 followup 写
处理器的回归网;不改产品代码,不追求 red-green。

脚手架照抄 tests/test_server_authz.py:1-43(_write_accounts/_login/_status)+
tests/test_server_download.py(每测试内手起 server:create_server(port=0)+后台线程 serve_forever,
finally shutdown+server_close;本仓库无共享 running_server fixture)。
"""
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


def _get_json(conn, path, cookie):
    conn.request("GET", path, None, {"Cookie": cookie})
    r = conn.getresponse()
    st = r.status
    data = json.loads(r.read().decode("utf-8"))
    return st, data


def test_risk_followup_update_then_archive_retains_current(tmp_path, monkeypatch):
    _write_accounts(tmp_path, monkeypatch)
    monkeypatch.setattr(server, "RISK_FOLLOWUP_FILE", str(tmp_path / "risk_followup.json"))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "super")

        # 1) update 单格编辑
        st = _status(conn, "POST", "/api/risk-followup/update", ck,
                     json.dumps({"riskKey": "R1", "field": "followAction", "content": "推进"}))
        assert st == 200

        # 2) get 断言 current 里有刚才的编辑
        st2, body = _get_json(conn, "/api/risk-followup", ck)
        assert st2 == 200
        assert body["current"]["R1"]["followAction"] == "推进"

        # 3) archive 后 current 仍保留(归档不清空)
        st3 = _status(conn, "POST", "/api/risk-followup/archive", ck,
                      json.dumps({"rows": [{"riskKey": "R1", "followAction": "推进"}]}))
        assert st3 == 200
        st4, body2 = _get_json(conn, "/api/risk-followup", ck)
        assert st4 == 200
        assert len(body2["archives"]) == 1
        assert body2["current"]["R1"]["followAction"] == "推进"
    finally:
        srv.shutdown()
        srv.server_close()


def test_paykey_followup_update_then_archive_retains_current(tmp_path, monkeypatch):
    _write_accounts(tmp_path, monkeypatch)
    monkeypatch.setattr(server, "PAYKEY_FOLLOWUP_FILE", str(tmp_path / "payment_key_followup.json"))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "super")

        # 1) update 单格编辑
        st = _status(conn, "POST", "/api/payment-key-followup/update", ck,
                     json.dumps({"projectId": "P1", "field": "followAction", "content": "推进"}))
        assert st == 200

        # 2) get 断言 current 里有刚才的编辑
        st2, body = _get_json(conn, "/api/payment-key-followup", ck)
        assert st2 == 200
        assert body["current"]["P1"]["followAction"] == "推进"

        # 3) archive 后 current 仍保留(归档不清空)
        st3 = _status(conn, "POST", "/api/payment-key-followup/archive", ck,
                      json.dumps({"rows": [{"projectId": "P1", "followAction": "推进"}]}))
        assert st3 == 200
        st4, body2 = _get_json(conn, "/api/payment-key-followup", ck)
        assert st4 == 200
        assert len(body2["archives"]) == 1
        assert body2["current"]["P1"]["followAction"] == "推进"
    finally:
        srv.shutdown()
        srv.server_close()
