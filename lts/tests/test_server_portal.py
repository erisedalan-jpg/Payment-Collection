import json
import http.client
import threading
import auth
import portal
import server


def _write_accounts(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "super": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
                  "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"},
        "u1": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
               "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "普通"},
    }})


def _isolate_portal(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "PORTAL_LINKS_FILE", str(tmp_path / "portal_links.json"))
    monkeypatch.setattr(server, "PORTAL_FILES_DIR", str(tmp_path / "portal_files"))


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    return conn, cookie


def _req(conn, method, path, cookie, body=None, ctype="application/json"):
    headers = {"Cookie": cookie}
    if body is not None:
        headers["Content-Type"] = ctype
    conn.request(method, path, body, headers)
    r = conn.getresponse()
    data = r.read()
    return r, data


def _mk_url_item(iid, group, vis):
    return {"id": iid, "type": "url", "name": iid, "group": group, "emoji": "",
            "featured": False, "url": "https://x.com", "file": None, "visibility": vis}


def _serve(monkeypatch, tmp_path):
    _write_accounts(tmp_path, monkeypatch)
    _isolate_portal(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def test_get_config_filters_for_normal_user(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "super")
        cfg = {"version": 1, "groups": ["G", "H"], "items": [
            _mk_url_item("pl_" + "a" * 12, "G", {"mode": "all"}),
            _mk_url_item("pl_" + "b" * 12, "H", {"mode": "accounts", "accounts": ["zhangsan"]}),
        ]}
        r, _ = _req(conn, "POST", "/api/portal/config", ck, json.dumps(cfg))
        assert r.status == 200
        # 普通用户只见 all 项、H 组被收敛
        conn2, ck2 = _login(port, "u1")
        r2, d2 = _req(conn2, "GET", "/api/portal/config", ck2)
        out = json.loads(d2)["config"]
        assert [it["id"] for it in out["items"]] == ["pl_" + "a" * 12]
        assert out["groups"] == ["G"]
        # 超管见全量
        r3, d3 = _req(conn, "GET", "/api/portal/config", ck)
        assert len(json.loads(d3)["config"]["items"]) == 2
    finally:
        srv.shutdown()


def test_post_config_nonsuper_403(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "u1")
        r, _ = _req(conn, "POST", "/api/portal/config", ck, json.dumps(portal.empty_config()))
        assert r.status == 403
    finally:
        srv.shutdown()


def test_post_config_bad_scheme_400(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "super")
        bad = {"version": 1, "groups": ["G"], "items": [
            {"id": "pl_" + "a" * 12, "type": "url", "name": "x", "group": "G", "emoji": "",
             "featured": False, "url": "javascript:alert(1)", "file": None, "visibility": {"mode": "all"}}]}
        r, _ = _req(conn, "POST", "/api/portal/config", ck, json.dumps(bad))
        assert r.status == 400
    finally:
        srv.shutdown()


def test_upload_then_download_and_visibility(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "super")
        # 上传(裸字节)
        r, d = _req(conn, "POST", "/api/portal/upload?name=%E5%91%A8%E6%8A%A5.txt", ck,
                    b"hello-bytes", ctype="application/octet-stream")
        assert r.status == 200
        fref = json.loads(d)["file"]
        assert fref["originalName"] == "周报.txt" and fref["size"] == 11
        # 存为 accounts-限定给 zhangsan(u1 不含)的文件项
        iid = "pl_" + "f" * 12
        cfg = {"version": 1, "groups": ["D"], "items": [
            {"id": iid, "type": "file", "name": "周报", "group": "D", "emoji": "", "featured": False,
             "url": "", "file": fref, "visibility": {"mode": "accounts", "accounts": ["zhangsan"]}}]}
        r, _ = _req(conn, "POST", "/api/portal/config", ck, json.dumps(cfg))
        assert r.status == 200
        # 超管下载 200 + Content-Disposition 中文名
        r, d = _req(conn, "GET", "/api/portal/download?id=" + iid, ck)
        assert r.status == 200 and d == b"hello-bytes"
        assert "filename*=UTF-8''" in r.getheader("Content-Disposition")
        # 越权账号 u1 下载 → 404(防探测)
        conn2, ck2 = _login(port, "u1")
        r2, _ = _req(conn2, "GET", "/api/portal/download?id=" + iid, ck2)
        assert r2.status == 404
        # 不存在 id → 404
        r3, _ = _req(conn, "GET", "/api/portal/download?id=pl_" + "0" * 12, ck)
        assert r3.status == 404
    finally:
        srv.shutdown()


def test_upload_nonsuper_403(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "u1")
        r, _ = _req(conn, "POST", "/api/portal/upload?name=a.txt", ck, b"x", ctype="application/octet-stream")
        assert r.status == 403
    finally:
        srv.shutdown()
