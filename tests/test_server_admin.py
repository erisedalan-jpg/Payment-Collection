import json
import threading
import http.client
import pytest
import auth
import server


@pytest.fixture
def admin_server(tmp_path, monkeypatch):
    # 独立 accounts.json: 1 超管 boss + 1 普通 liu
    accounts_file = tmp_path / "accounts.json"
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(accounts_file))
    auth._sessions.clear()
    data = {"version": 1, "users": {}}
    data["users"]["boss"] = auth._make_user("bosspw", "超管", is_super=True)
    data["users"]["liu"] = auth._make_user(
        "liupw", "老刘", is_super=False, pages=["projects"], l4=["北京"]
    )
    auth.save_accounts(data)

    httpd = server.create_server(host="127.0.0.1", port=0)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield port
    httpd.shutdown()
    httpd.server_close()


def _login(port, account, password):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request(
        "POST",
        "/api/login",
        json.dumps({"account": account, "password": password}),
        {"Content-Type": "application/json"},
    )
    r = conn.getresponse()
    body = r.read()
    cookie = r.getheader("Set-Cookie")
    conn.close()
    return r.status, cookie, json.loads(body or b"{}")


def _req(port, method, path, cookie=None, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie.split(";")[0]
    conn.request(method, path, json.dumps(body) if body is not None else None, headers)
    r = conn.getresponse()
    data = json.loads(r.read() or b"{}")
    conn.close()
    return r.status, data


def test_super_lists_accounts_without_secrets(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(port, "GET", "/api/admin/accounts", cookie)
    assert status == 200 and data["success"]
    accs = data["accounts"]
    assert {a["account"] for a in accs} == {"boss", "liu"}
    for a in accs:
        assert "salt" not in a and "hash" not in a


def test_normal_user_forbidden(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "liu", "liupw")
    assert _req(port, "GET", "/api/admin/accounts", cookie)[0] == 403
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/create",
            cookie,
            {
                "account": "x",
                "password": "p",
                "displayName": "X",
                "allowedPages": ["projects"],
                "allowedL4": ["北京"],
            },
        )[0]
        == 403
    )
    assert (
        _req(port, "POST", "/api/admin/accounts/delete", cookie, {"account": "boss"})[0]
        == 403
    )


def test_unauthenticated_401(admin_server):
    port = admin_server
    assert _req(port, "GET", "/api/admin/accounts")[0] == 401


def test_super_create_then_list(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(
        port,
        "POST",
        "/api/admin/accounts/create",
        cookie,
        {
            "account": "newbie",
            "password": "pw12345",
            "displayName": "新人",
            "allowedPages": ["projects"],
            "allowedL4": ["上海"],
        },
    )
    assert status == 200 and data["user"]["isSuper"] is False
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    assert "newbie" in {a["account"] for a in lst["accounts"]}
    # 撞名 400
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/create",
            cookie,
            {
                "account": "newbie",
                "password": "p",
                "displayName": "x",
                "allowedPages": ["projects"],
                "allowedL4": ["上海"],
            },
        )[0]
        == 400
    )


def test_super_update_normal(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, _ = _req(
        port,
        "POST",
        "/api/admin/accounts/update",
        cookie,
        {"account": "liu", "allowedL4": ["上海", "广州"]},
    )
    assert status == 200
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    liu = next(a for a in lst["accounts"] if a["account"] == "liu")
    assert liu["allowedL4"] == ["上海", "广州"]


def test_super_cannot_update_or_delete_super(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/update",
            cookie,
            {"account": "boss", "displayName": "x"},
        )[0]
        == 400
    )
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/delete",
            cookie,
            {"account": "boss"},
        )[0]
        == 400
    )


def test_super_cannot_delete_self(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    assert (
        _req(port, "POST", "/api/admin/accounts/delete", cookie, {"account": "boss"})[0]
        == 400
    )


def test_super_delete_normal_revokes_session(admin_server):
    port = admin_server
    _, boss_cookie, _ = _login(port, "boss", "bosspw")
    _, liu_cookie, _ = _login(port, "liu", "liupw")
    assert _req(port, "GET", "/api/auth/me", liu_cookie)[0] == 200
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/delete",
            boss_cookie,
            {"account": "liu"},
        )[0]
        == 200
    )
    assert _req(port, "GET", "/api/auth/me", liu_cookie)[0] == 401
